// ============================================================
// DEDUPLICATION - Prevents duplicate companies/contacts
// Uses in-memory Sets + Redis (Upstash) for persistence across
// serverless cold starts.
// ============================================================

const logger = require("./logger").forAgent("Dedup");
const { setAdd, setHas } = require("../db/redis");

// Redis key names
const REDIS_COMPANIES_KEY = "dedup:companies";
const REDIS_CONTACTS_KEY  = "dedup:contacts";

class DeduplicationStore {
  constructor() {
    this.seenCompanies = new Set();
    this.seenContacts = new Set();
    this.isLoaded = false;
  }

  /**
   * Called to pre-fetch all existing keys from MongoDB into memory
   * and seed them into Redis for cross-instance deduplication.
   */
  async loadFromDB() {
    try {
      const { Company, Contact } = require("../db/mongoose");
      const companies = await Company.find({}, { domain: 1, name: 1 });
      const contacts  = await Contact.find({}, { email: 1, name: 1, companyName: 1 });

      this.seenCompanies.clear();
      this.seenContacts.clear();

      const companyKeys = companies.map(c => this._normalizeCompany(c.name, c.domain));
      const contactKeys = contacts.map(c => this._normalizeContact(c.email, c.name, c.companyName));

      companyKeys.forEach(k => this.seenCompanies.add(k));
      contactKeys.forEach(k => this.seenContacts.add(k));

      // Seed Redis with all existing keys for cross-instance dedup
      if (companyKeys.length > 0) await setAdd(REDIS_COMPANIES_KEY, ...companyKeys);
      if (contactKeys.length > 0) await setAdd(REDIS_CONTACTS_KEY, ...contactKeys);

      this.isLoaded = true;
      logger.info(`Loaded ${this.seenCompanies.size} seen companies and ${this.seenContacts.size} seen contacts from MongoDB → synced to Redis`);
    } catch (err) {
      logger.warn(`Could not load MongoDB dedup state: ${err.message}`);
    }
  }

  /** Normalize company name to a dedup key */
  _normalizeCompany(name, domain) {
    const namePart   = (name   || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const domainPart = (domain || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return domainPart || namePart;
  }

  /** Normalize contact to a dedup key */
  _normalizeContact(email, name, company) {
    if (email) return email.toLowerCase().trim();
    const n = (name    || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const c = (company || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return `${n}@${c}`;
  }

  /**
   * Check if company is a duplicate.
   * Checks Redis first (cross-instance), falls back to in-memory Set.
   */
  async isCompanyDuplicateAsync(name, domain) {
    const key = this._normalizeCompany(name, domain);
    if (this.seenCompanies.has(key)) return true;
    const inRedis = await setHas(REDIS_COMPANIES_KEY, key);
    if (inRedis) {
      this.seenCompanies.add(key); // sync back to local for speed
      return true;
    }
    return false;
  }

  /** Sync version — only checks in-memory (for hot path) */
  isCompanyDuplicate(name, domain) {
    return this.seenCompanies.has(this._normalizeCompany(name, domain));
  }

  /**
   * Mark a company as seen — writes to both in-memory and Redis.
   */
  markCompanySeen(name, domain) {
    const key = this._normalizeCompany(name, domain);
    this.seenCompanies.add(key);
    setAdd(REDIS_COMPANIES_KEY, key); // fire-and-forget
  }

  /**
   * Check if contact is a duplicate (async, Redis-backed).
   */
  async isContactDuplicateAsync(email, name, company) {
    const key = this._normalizeContact(email, name, company);
    if (this.seenContacts.has(key)) return true;
    const inRedis = await setHas(REDIS_CONTACTS_KEY, key);
    if (inRedis) {
      this.seenContacts.add(key);
      return true;
    }
    return false;
  }

  /** Sync version — only checks in-memory */
  isContactDuplicate(email, name, company) {
    return this.seenContacts.has(this._normalizeContact(email, name, company));
  }

  /**
   * Mark contact as seen — writes to both in-memory and Redis.
   */
  markContactSeen(email, name, company) {
    const key = this._normalizeContact(email, name, company);
    this.seenContacts.add(key);
    setAdd(REDIS_CONTACTS_KEY, key); // fire-and-forget
  }

  /** Deduplicate an array of companies (async, Redis-aware) */
  async deduplicateCompaniesAsync(companies) {
    const unique = [];
    for (const c of companies) {
      const isDup = await this.isCompanyDuplicateAsync(c.name, c.domain || c.website);
      if (!isDup) {
        unique.push(c);
        this.markCompanySeen(c.name, c.domain || c.website);
      }
    }
    logger.info(`Dedup: ${companies.length} → ${unique.length} unique companies (Redis-backed)`);
    return unique;
  }

  /** Deduplicate an array of companies (sync, in-memory only) */
  deduplicateCompanies(companies) {
    const unique = [];
    for (const c of companies) {
      if (!this.isCompanyDuplicate(c.name, c.domain || c.website)) {
        unique.push(c);
        this.markCompanySeen(c.name, c.domain || c.website);
      }
    }
    logger.info(`Dedup: ${companies.length} → ${unique.length} unique companies`);
    return unique;
  }

  /** Deduplicate an array of contacts (async, Redis-aware) */
  async deduplicateContactsAsync(contacts) {
    const unique = [];
    for (const c of contacts) {
      const isDup = await this.isContactDuplicateAsync(c.email, c.name, c.company);
      if (!isDup) {
        unique.push(c);
        this.markContactSeen(c.email, c.name, c.company);
      }
    }
    logger.info(`Dedup: ${contacts.length} → ${unique.length} unique contacts (Redis-backed)`);
    return unique;
  }

  /** Deduplicate an array of contacts (sync, in-memory only) */
  deduplicateContacts(contacts) {
    const unique = [];
    for (const c of contacts) {
      if (!this.isContactDuplicate(c.email, c.name, c.company)) {
        unique.push(c);
        this.markContactSeen(c.email, c.name, c.company);
      }
    }
    logger.info(`Dedup: ${contacts.length} → ${unique.length} unique contacts`);
    return unique;
  }

  getStats() {
    return {
      totalSeenCompanies: this.seenCompanies.size,
      totalSeenContacts:  this.seenContacts.size,
    };
  }

  async clearMongo() {
    try {
      const { Company, Contact }  = require("../db/mongoose");
      const { redis }             = require("../db/redis");
      await Company.deleteMany({});
      await Contact.deleteMany({});
      this.seenCompanies.clear();
      this.seenContacts.clear();
      // Also clear Redis dedup sets
      if (redis) {
        await redis.del(REDIS_COMPANIES_KEY);
        await redis.del(REDIS_CONTACTS_KEY);
      }
      logger.info("MongoDB + Redis Dedup Collections cleared.");
    } catch (err) {
      logger.warn("Error clearing dedup state: " + err.message);
    }
  }
}

// Singleton instance
module.exports = new DeduplicationStore();
