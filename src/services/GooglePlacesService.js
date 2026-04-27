const axios = require("axios");
const { Place, PlaceSearchHistory } = require("../db/mongoose");
const logger = require("../utils/logger").forAgent("GooglePlaces");

class GooglePlacesService {
  constructor() {
    this.apiKey = process.env.GOOGLE_API_KEY;
  }

  async searchNearby(lat, lng, radius, keyword) {
    if (!this.apiKey) throw new Error("GOOGLE_API_KEY not set");

    const allPlaceIds = [];
    let nextPageToken = null;
    
    logger.info(`[GOOGLE_PLACES] Searching near (${lat}, ${lng}), radius=${radius}m, keyword='${keyword}'`);

    do {
      const params = {
        location: `${lat},${lng}`,
        radius,
        keyword,
        key: this.apiKey,
      };

      if (nextPageToken) {
        // Wait 2 seconds before using next_page_token as required by Google
        await new Promise((res) => setTimeout(res, 2000));
        params.pagetoken = nextPageToken;
      }

      const response = await axios.get("https://maps.googleapis.com/maps/api/place/nearbysearch/json", { params });
      const data = response.data;
      
      if (data.results) {
        for (const place of data.results) {
          allPlaceIds.push(place.place_id);
        }
      }
      
      nextPageToken = data.next_page_token || null;
    } while (nextPageToken);

    logger.info(`[GOOGLE_PLACES] Found ${allPlaceIds.length} places`);
    return allPlaceIds;
  }

  async getPlaceDetails(placeId) {
    if (!this.apiKey) throw new Error("GOOGLE_API_KEY not set");

    const params = {
      place_id: placeId,
      fields: "name,formatted_address,formatted_phone_number,website,geometry,place_id,type,rating,user_ratings_total",
      key: this.apiKey
    };

    try {
      const response = await axios.get("https://maps.googleapis.com/maps/api/place/details/json", { params });
      return response.data.result;
    } catch (error) {
      logger.error(`[GOOGLE_PLACES] Error fetching details for ${placeId}: ${error.message}`);
      return null;
    }
  }

  async geocodeAddress(address) {
    if (!this.apiKey) throw new Error("GOOGLE_API_KEY not set");
    if (!address) throw new Error("Address is required");

    const params = {
      address: address,
      key: this.apiKey
    };

    try {
      const response = await axios.get("https://maps.googleapis.com/maps/api/geocode/json", { params });
      if (response.data.status === "OK" && response.data.results.length > 0) {
        const location = response.data.results[0].geometry.location;
        const formatted_address = response.data.results[0].formatted_address;
        return {
          lat: location.lat,
          lng: location.lng,
          formatted_address: formatted_address
        };
      }
      return null;
    } catch (error) {
      logger.error(`[GOOGLE_PLACES] Error geocoding address '${address}': ${error.message}`);
      return null;
    }
  }

  async autocompleteAddress(input) {
    if (!this.apiKey) throw new Error("GOOGLE_API_KEY not set");
    if (!input) return [];

    const params = {
      input,
      types: "(regions)", // usually for cities/locations
      key: this.apiKey
    };

    try {
      const response = await axios.get("https://maps.googleapis.com/maps/api/place/autocomplete/json", { params });
      if (response.data.status === "OK") {
        return response.data.predictions.map(p => ({
          description: p.description,
          place_id: p.place_id,
        }));
      }
      return [];
    } catch (error) {
      logger.error(`[GOOGLE_PLACES] Error in autocomplete '${input}': ${error.message}`);
      return [];
    }
  }

  normalizePlace(details, categoryKeyword) {
    const geom = details.geometry && details.geometry.location ? details.geometry.location : {};
    
    return {
      place_id: details.place_id,
      name: details.name,
      phone: details.formatted_phone_number || null,
      website: details.website || null,
      address: details.formatted_address || null,
      lat: geom.lat || null,
      lng: geom.lng || null,
      types: details.types || [],
      rating: details.rating || null,
      user_ratings_total: details.user_ratings_total || null,
      category_keyword: categoryKeyword,
      raw: details
    };
  }

  async upsertPlaces(records) {
    if (!records || records.length === 0) return 0;
    
    let count = 0;
    for (const record of records) {
      if (!record.place_id) continue;
      
      try {
        await Place.findOneAndUpdate(
          { place_id: record.place_id },
          { $set: record },
          { upsert: true, new: true }
        );
        count++;
      } catch (err) {
        logger.error(`[GOOGLE_PLACES] Failed to upsert ${record.place_id}: ${err.message}`);
      }
    }
    logger.info(`[GOOGLE_PLACES] Upserted ${count} places to MongoDB`);
    return count;
  }

  async searchAndStore(lat, lng, radius, keywordStr) {
    const keywords = keywordStr.split(',').map(k => k.trim()).filter(Boolean);
    if (!keywords.length) {
      return { status: "success", count: 0, message: "No valid keywords provided" };
    }

    const allPlaceIds = [];
    const placeIdToKeyword = {};

    for (const kw of keywords) {
      try {
        const ids = await this.searchNearby(lat, lng, radius, kw);
        for (const pid of ids) {
          if (!placeIdToKeyword[pid]) {
            placeIdToKeyword[pid] = kw;
            allPlaceIds.push(pid);
          }
        }
      } catch (err) {
        logger.error(`[GOOGLE_PLACES] Search failed for kw '${kw}': ${err.message}`);
      }
    }

    if (allPlaceIds.length === 0) {
      return { status: "success", count: 0, message: "No places found" };
    }

    const records = [];
    
    // Concurrency control for local fetching
    // Uses simple chunking below.
    
    const chunkArray = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
      arr.slice(i * size, i * size + size)
    );
    
    const chunks = chunkArray(allPlaceIds, 10);
    
    for (const chunk of chunks) {
      const promises = chunk.map(async (pid) => {
        const details = await this.getPlaceDetails(pid);
        if (details) {
          const kw = placeIdToKeyword[pid];
          return this.normalizePlace(details, kw);
        }
        return null;
      });
      
      const results = await Promise.all(promises);
      records.push(...results.filter(Boolean));
    }

    const count = await this.upsertPlaces(records);

    // Log this search run to history
    try {
      await PlaceSearchHistory.create({
        lat, lng, radius, keyword: keywordStr, placesFound: count
      });
    } catch (err) {
      logger.error(`[GOOGLE_PLACES] Failed to log search history: ${err.message}`);
    }

    return {
      status: "success",
      count,
      message: `Found and stored ${count} places`
    };
  }

  async getStoredPlaces(limit = 100, offset = 0, keyword = null) {
    const filter = {};
    if (keyword) {
      const kws = keyword.split(",").map(k => k.trim()).filter(Boolean);
      if (kws.length > 0) {
        filter.category_keyword = { $in: kws };
      }
    }

    const places = await Place.find(filter)
      .sort({ createdAt: -1 })
      .skip(Number(offset))
      .limit(Number(limit))
      .lean();

    return places.map(p => {
      // Maps to snake_case format exactly like from python pg
      return {
        place_id: p.place_id,
        name: p.name,
        phone: p.phone,
        website: p.website,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
        types: p.types,
        rating: p.rating,
        user_ratings_total: p.user_ratings_total,
        category_keyword: p.category_keyword,
        inserted_at: p.createdAt,
        updated_at: p.updatedAt
      };
    });
  }
}

module.exports = new GooglePlacesService();
