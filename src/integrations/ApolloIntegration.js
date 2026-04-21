// ============================================================
// APOLLO.IO INTEGRATION
// Enriches company and contact data via Apollo API
// Docs: https://apolloio.github.io/apollo-api-docs/
// ============================================================

const axios = require("axios");
const logger = require("../utils/logger").forAgent("Apollo");
const { retry, sleepWithJitter } = require("../utils/helpers");

const BASE_URL = "https://api.apollo.io/v1";

class ApolloIntegration {
  constructor() {
    this.apiKey = process.env.APOLLO_API_KEY;
    this.client = axios.create({
      baseURL: BASE_URL,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": this.apiKey,
      },
      timeout: 60000,
    });

    // Log a clear warning if no API key is configured
    if (!this.apiKey || this.apiKey.length < 10) {
      logger.warn("⚠️  APOLLO_API_KEY is not set or invalid — all contact data will use realistic mock data");
      logger.warn("    → To get real contacts, set APOLLO_API_KEY in your .env file");
    }
  }

  _headers() {
    return { "X-Api-Key": this.apiKey };
  }

  /**
   * Search for people matching role criteria at a company
   * @param {string} companyDomain - e.g. "boston-dynamics.com"
   * @param {string[]} titles - e.g. ["CTO", "VP Engineering"]
   * @returns {Array} contacts
   */
  async searchPeople(companyDomain, titles = []) {
    if (!this.apiKey || this.apiKey.length < 10) {
      return this._mockContacts(companyDomain);
    }

    try {
      const response = await this.client.post(
        "/mixed_people/api_search",
        {
          q_organization_domains: companyDomain,
          person_titles: titles,
          page: 1,
          per_page: 10,
        }
      );

      const peopleRefs = response.data?.people || [];
      logger.info(`Apollo found ${peopleRefs.length} people at ${companyDomain}`);

      if (peopleRefs.length === 0) {
        logger.warn(`Apollo returned 0 results for ${companyDomain} — using mock data`);
        return this._mockContacts(companyDomain);
      }

      // Step 2: Try to unlock full data, but use basic info if unlock fails
      const contacts = [];
      for (const p of peopleRefs) {
        try {
          await sleepWithJitter(500);
          const matchRes = await this.client.post("/people/match", {
            id: p.id,
            reveal_personal_emails: true,
          });
          if (matchRes.data?.person) {
            contacts.push(this._mapPerson(matchRes.data.person));
          } else {
            // Unlock returned no data, use basic search result
            contacts.push(this._mapPerson(p));
          }
        } catch (matchErr) {
          logger.warn(`Failed to unlock person ${p.id}: ${matchErr.message} - using basic info`);
          // Use the basic contact info from search results
          contacts.push(this._mapPerson(p));
        }
      }

      return contacts;
    } catch (err) {
      logger.warn(`Apollo API failed for ${companyDomain}: ${err.message} — using mock data`);
      if (err.response) {
        console.error("APOLLO 422 PAYLOAD ERROR:", err.response.data);
      }
      return this._mockContacts(companyDomain);
    }
  }

  /**
   * Enrich a single person by email
   */
  async enrichPerson(email) {
    if (!this.apiKey || this.apiKey.length < 10) return null;

    return retry(async () => {
      await sleepWithJitter(500);
      const response = await this.client.post("/people/match", {
        email,
        reveal_personal_emails: true,
      });

      const person = response.data?.person;
      if (!person) return null;

      return this._mapPerson(person);
    }, 2, 1500);
  }

  /**
   * Enrich a company by domain
   */
  async enrichCompany(domain) {
    if (!this.apiKey || this.apiKey.length < 10) return this._mockCompany(domain);

    try {
      await sleepWithJitter(500);
      const response = await this.client.post("/organizations/enrich", {
        domain,
      });

      const org = response.data?.organization;
      if (!org) return this._mockCompany(domain);

      return {
        name: org.name,
        domain: org.primary_domain,
        website: `https://${org.primary_domain}`,
        industry: org.industry,
        subIndustry: org.sub_industry,
        employeeCount: org.estimated_num_employees,
        revenueRange: org.annual_revenue_printed,
        revenue: org.annual_revenue,
        founded: org.founded_year,
        description: org.short_description,
        headquarters: `${org.city || ""}, ${org.country || ""}`.trim(),
        linkedinUrl: org.linkedin_url,
        technologies: org.technologies || [],
        keywords: org.keywords || [],
        funding: org.total_funding_printed,
        source: "apollo",
      };
    } catch (err) {
      logger.warn(`Apollo enrich failed for ${domain}: ${err.message} — using mock data`);
      return this._mockCompany(domain);
    }
  }

  /**
   * Search for companies by keyword
   * @param {string[]} keywords
   */
  async searchCompanies(keywords = ["robotics", "automation", "manufacturing"]) {
    if (!this.apiKey || this.apiKey.length < 10) {
      return Object.keys(this._getKnownContacts()).slice(0, 10).map(domain => this._mockCompany(domain));
    }

    try {
      await sleepWithJitter(500);
      const response = await this.client.post("/organizations/search", {
        q_organization_keyword_tags: keywords,
        page: 1,
        per_page: 25,
      });

      const organizations = response.data?.organizations || [];
      logger.info(`Apollo found ${organizations.length} companies for keywords: ${keywords.join(",")}`);

      return organizations.map((org) => ({
        name: org.name,
        domain: org.primary_domain,
        website: org.website_url || `https://${org.primary_domain}`,
        industry: org.industry,
        subIndustry: org.sub_industry,
        employeeCount: org.estimated_num_employees,
        revenueRange: org.annual_revenue_printed,
        revenue: org.annual_revenue,
        founded: org.founded_year,
        description: org.short_description || org.seo_description,
        headquarters: `${org.city || ""}, ${org.country || ""}`.trim(),
        linkedinUrl: org.linkedin_url,
        technologies: Array.isArray(org.technologies) ? org.technologies.map(t => t.name || t) : [],
        keywords: org.keywords || [],
        funding: org.total_funding_printed,
        source: "apollo",
      }));
    } catch (err) {
      logger.warn(`Apollo company search failed: ${err.message} — using mock data`);
      return Object.keys(this._getKnownContacts()).slice(0, 10).map(domain => this._mockCompany(domain));
    }
  }

  /**
   * Map raw Apollo person to our schema
   */
  _mapPerson(p) {
    return {
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      name: `${p.first_name || ""} ${p.last_name || ""}`.trim(),
      title: p.title,
      email: p.email,
      emailStatus: p.email_status,
      phone: p.phone_numbers?.[0]?.raw_number,
      linkedinUrl: p.linkedin_url,
      company: p.organization?.name,
      companyDomain: p.organization?.primary_domain,
      city: p.city,
      country: p.country,
      seniorityLevel: p.seniority,
      source: "apollo",
      enrichedAt: new Date().toISOString(),
    };
  }

  // ============================================================
  // MOCK DATA — realistic per-company contacts for dev/demo use
  // ============================================================

  /**
   * Curated map of known robotics company domains → real/realistic executives.
   * When Apollo API is unavailable, each company gets its own unique contacts.
   */
  _getKnownContacts() {
    return {
      "bostondynamics.com": [
        { firstName: "Robert",   lastName: "Playter",        title: "CEO",                       emailPrefix: "r.playter",       emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Aaron",    lastName: "Saunders",        title: "CTO",                       emailPrefix: "a.saunders",      emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Marc",     lastName: "Raibert",         title: "Founder & Chairman",        emailPrefix: "m.raibert",       emailStatus: "likely",   seniorityLevel: "c_suite" },
      ],
      "waymo.com": [
        { firstName: "Dmitri",   lastName: "Dolgov",          title: "CEO",                       emailPrefix: "d.dolgov",        emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Tekedra",  lastName: "Mawakana",        title: "Co-CEO",                    emailPrefix: "t.mawakana",      emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Drago",    lastName: "Anguelov",        title: "Chief Scientist",           emailPrefix: "d.anguelov",      emailStatus: "likely",   seniorityLevel: "vp" },
      ],
      "intuitive.com": [
        { firstName: "Gary",     lastName: "Guthart",         title: "CEO",                       emailPrefix: "g.guthart",       emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Jamie",    lastName: "Samath",          title: "CFO",                       emailPrefix: "j.samath",        emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Dave",     lastName: "Rosa",            title: "VP of Products",            emailPrefix: "d.rosa",          emailStatus: "likely",   seniorityLevel: "vp" },
      ],
      "universal-robots.com": [
        { firstName: "Kim",      lastName: "Povlsen",         title: "President",                 emailPrefix: "k.povlsen",       emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Anders",   lastName: "Beck",            title: "VP of Innovation",          emailPrefix: "a.beck",          emailStatus: "verified", seniorityLevel: "vp" },
        { firstName: "Soren",    lastName: "Johansen",        title: "CTO",                       emailPrefix: "s.johansen",      emailStatus: "likely",   seniorityLevel: "c_suite" },
      ],
      "symbotic.com": [
        { firstName: "Rick",     lastName: "Cohen",           title: "CEO",                       emailPrefix: "r.cohen",         emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Corey",    lastName: "Dufresne",        title: "CTO",                       emailPrefix: "c.dufresne",      emailStatus: "likely",   seniorityLevel: "c_suite" },
        { firstName: "Michael",  lastName: "Duffy",           title: "VP of Engineering",         emailPrefix: "m.duffy",         emailStatus: "likely",   seniorityLevel: "vp" },
      ],
      "medtronic.com": [
        { firstName: "Geoff",    lastName: "Martha",          title: "CEO",                       emailPrefix: "g.martha",        emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Thierry",  lastName: "Piton",           title: "CFO",                       emailPrefix: "t.piton",         emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Sean",     lastName: "Salmon",          title: "EVP Robotics",              emailPrefix: "s.salmon",        emailStatus: "likely",   seniorityLevel: "vp" },
      ],
      "stryker.com": [
        { firstName: "Kevin",    lastName: "Lobo",            title: "Chairman & CEO",            emailPrefix: "k.lobo",          emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Preston",  lastName: "Wells",           title: "VP Robotics",               emailPrefix: "p.wells",         emailStatus: "verified", seniorityLevel: "vp" },
        { firstName: "Brad",     lastName: "Saar",            title: "Director of Engineering",   emailPrefix: "b.saar",          emailStatus: "likely",   seniorityLevel: "manager" },
      ],
      "nuro.ai": [
        { firstName: "Jiajun",   lastName: "Zhu",             title: "CEO & Co-founder",          emailPrefix: "j.zhu",           emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Dave",     lastName: "Ferguson",        title: "President & Co-founder",    emailPrefix: "d.ferguson",      emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Alan",     lastName: "Freck",           title: "CTO",                       emailPrefix: "a.freck",         emailStatus: "likely",   seniorityLevel: "c_suite" },
      ],
      "agilityrobotics.com": [
        { firstName: "Damion",   lastName: "Shelton",         title: "CEO",                       emailPrefix: "d.shelton",       emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Jonathan", lastName: "Hurst",           title: "Chief Robot Officer",       emailPrefix: "j.hurst",         emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Melonee",  lastName: "Wise",            title: "VP of Robotics",            emailPrefix: "m.wise",          emailStatus: "likely",   seniorityLevel: "vp" },
      ],
      "figure.ai": [
        { firstName: "Brett",    lastName: "Adcock",          title: "CEO & Founder",             emailPrefix: "b.adcock",        emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Jerry",    lastName: "Pratt",           title: "Chief Scientist",           emailPrefix: "j.pratt",         emailStatus: "likely",   seniorityLevel: "vp" },
        { firstName: "Kat",      lastName: "Steele",          title: "VP of Engineering",         emailPrefix: "k.steele",        emailStatus: "likely",   seniorityLevel: "vp" },
      ],
      "apptronik.com": [
        { firstName: "Jeff",     lastName: "Cardenas",        title: "CEO & Co-founder",          emailPrefix: "j.cardenas",      emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Nick",     lastName: "Paine",           title: "CTO",                       emailPrefix: "n.paine",         emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Graham",   lastName: "Ryland",          title: "VP of Operations",          emailPrefix: "g.ryland",        emailStatus: "likely",   seniorityLevel: "vp" },
      ],
      "locusrobotics.com": [
        { firstName: "Rick",     lastName: "Faulk",           title: "CEO",                       emailPrefix: "r.faulk",         emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Bruce",    lastName: "Welty",           title: "Chairman & Co-founder",     emailPrefix: "b.welty",         emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Sham",     lastName: "Sao",             title: "Chief Marketing Officer",   emailPrefix: "s.sao",           emailStatus: "likely",   seniorityLevel: "vp" },
      ],
      "skydio.com": [
        { firstName: "Adam",     lastName: "Bry",             title: "CEO & Co-founder",          emailPrefix: "a.bry",           emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Abraham",  lastName: "Bachrach",        title: "CTO & Co-founder",          emailPrefix: "a.bachrach",      emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Matt",     lastName: "Donahoe",         title: "VP of Sales",               emailPrefix: "m.donahoe",       emailStatus: "likely",   seniorityLevel: "vp" },
      ],
      "flyzipline.com": [
        { firstName: "Keller",   lastName: "Rinaudo",         title: "CEO & Co-founder",          emailPrefix: "k.rinaudo",       emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Keenan",   lastName: "Wyrobek",         title: "CTO & Co-founder",          emailPrefix: "k.wyrobek",       emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Tobias",   lastName: "Perez",           title: "VP of Engineering",         emailPrefix: "t.perez",         emailStatus: "likely",   seniorityLevel: "vp" },
      ],
      "covariant.ai": [
        { firstName: "Peter",    lastName: "Chen",            title: "CEO & Co-founder",          emailPrefix: "p.chen",          emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Pieter",   lastName: "Abbeel",          title: "Chief Scientist",           emailPrefix: "p.abbeel",        emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Rocky",    lastName: "Duan",            title: "CTO",                       emailPrefix: "r.duan",          emailStatus: "likely",   seniorityLevel: "c_suite" },
      ],
      "intrinsic.ai": [
        { firstName: "Wendy",    lastName: "Tan White",       title: "CEO",                       emailPrefix: "w.white",         emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "James",    lastName: "Kuffner",         title: "Chief Technology Officer",  emailPrefix: "j.kuffner",       emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Salvador", lastName: "Dominguez",       title: "VP of Product",             emailPrefix: "s.dominguez",     emailStatus: "likely",   seniorityLevel: "vp" },
      ],
      "viam.com": [
        { firstName: "Eliot",    lastName: "Horowitz",        title: "CEO & Co-founder",          emailPrefix: "e.horowitz",      emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Naomi",    lastName: "Ntanzi",          title: "VP of Engineering",         emailPrefix: "n.ntanzi",        emailStatus: "verified", seniorityLevel: "vp" },
        { firstName: "Tara",     lastName: "Madhyastha",      title: "Chief Scientist",           emailPrefix: "t.madhyastha",    emailStatus: "likely",   seniorityLevel: "vp" },
      ],
      "sarcos.com": [
        { firstName: "Ben",      lastName: "Wolff",           title: "CEO",                       emailPrefix: "b.wolff",         emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Jordan",   lastName: "Aas",             title: "VP of Sales",               emailPrefix: "j.aas",           emailStatus: "likely",   seniorityLevel: "vp" },
        { firstName: "Laura",    lastName: "Brill",           title: "Chief Communications Officer", emailPrefix: "l.brill",      emailStatus: "likely",   seniorityLevel: "vp" },
      ],
      "bearrobotics.ai": [
        { firstName: "Juan",     lastName: "Higueros",        title: "CEO & Co-founder",          emailPrefix: "j.higueros",      emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Ha",       lastName: "Nguyen",          title: "CTO",                       emailPrefix: "h.nguyen",        emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Lily",     lastName: "Kim",             title: "VP of Operations",          emailPrefix: "l.kim",           emailStatus: "likely",   seniorityLevel: "vp" },
      ],
      "machinalabs.ai": [
        { firstName: "Edward",   lastName: "Mehr",            title: "CEO & Co-founder",          emailPrefix: "e.mehr",          emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Babak",    lastName: "Raeisinia",       title: "CTO & Co-founder",          emailPrefix: "b.raeisinia",     emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Patricia", lastName: "Jones",           title: "VP of Business Dev",        emailPrefix: "p.jones",         emailStatus: "likely",   seniorityLevel: "vp" },
      ],
      "formant.io": [
        { firstName: "Jeff",     lastName: "Linnell",         title: "CEO & Co-founder",          emailPrefix: "j.linnell",       emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Tim",      lastName: "Field",           title: "CTO",                       emailPrefix: "t.field",         emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Angie",    lastName: "Chang",           title: "VP of Marketing",           emailPrefix: "a.chang",         emailStatus: "likely",   seniorityLevel: "vp" },
      ],
      "fetchrobotics.com": [
        { firstName: "Melonee",  lastName: "Wise",            title: "CEO",                       emailPrefix: "m.wise",          emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Michael",  lastName: "Ferguson",        title: "CTO",                       emailPrefix: "m.ferguson",      emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Wyatt",    lastName: "Newman",          title: "VP of Engineering",         emailPrefix: "w.newman",        emailStatus: "likely",   seniorityLevel: "vp" },
      ],
      "6river.com": [
        { firstName: "Jerome",   lastName: "Dubois",          title: "CEO & Co-founder",          emailPrefix: "j.dubois",        emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Rylan",    lastName: "Hamilton",        title: "CTO",                       emailPrefix: "r.hamilton",      emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Bethany",  lastName: "Perez",           title: "VP of Operations",          emailPrefix: "b.perez",         emailStatus: "likely",   seniorityLevel: "vp" },
      ],
      "greyorange.com": [
        { firstName: "Samay",    lastName: "Kohli",           title: "CEO & Co-founder",          emailPrefix: "s.kohli",         emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Akash",    lastName: "Gupta",           title: "CTO",                       emailPrefix: "a.gupta",         emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Alex",     lastName: "Vouch",           title: "VP of Global Sales",        emailPrefix: "a.vouch",         emailStatus: "likely",   seniorityLevel: "vp" },
      ],
      "berkshiregrey.com": [
        { firstName: "Tom",      lastName: "Wagner",          title: "CEO & Founder",             emailPrefix: "t.wagner",        emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Steve",    lastName: "Johnson",         title: "Chief Product Officer",     emailPrefix: "s.johnson",       emailStatus: "likely",   seniorityLevel: "c_suite" },
        { firstName: "Mark",     lastName: "Fidler",          title: "VP of Engineering",         emailPrefix: "m.fidler",        emailStatus: "likely",   seniorityLevel: "vp" },
      ],
      "memicmed.com": [
        { firstName: "Dvir",     lastName: "Cohen",           title: "CEO",                       emailPrefix: "d.cohen",         emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Ori",      lastName: "Hadomi",          title: "President",                 emailPrefix: "o.hadomi",        emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Lior",     lastName: "Ben-David",       title: "CTO",                       emailPrefix: "l.bendavid",      emailStatus: "likely",   seniorityLevel: "c_suite" },
      ],
      "percepto.co": [
        { firstName: "Dor",      lastName: "Abuhasira",       title: "CEO & Co-founder",          emailPrefix: "d.abuhasira",     emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Raviv",    lastName: "Raz",             title: "CTO & Co-founder",          emailPrefix: "r.raz",           emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Ariel",    lastName: "Avitan",          title: "VP of Business Dev",        emailPrefix: "a.avitan",        emailStatus: "likely",   seniorityLevel: "vp" },
      ],
      "righthandrobotics.com": [
        { firstName: "Leif",     lastName: "Jentoft",         title: "CEO & Co-founder",          emailPrefix: "l.jentoft",       emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Yaroslav", lastName: "Tenzer",          title: "CTO",                       emailPrefix: "y.tenzer",        emailStatus: "likely",   seniorityLevel: "c_suite" },
        { firstName: "Megan",    lastName: "Ward",            title: "VP of Engineering",         emailPrefix: "m.ward",          emailStatus: "likely",   seniorityLevel: "vp" },
      ],
      "formic.co": [
        { firstName: "Saman",    lastName: "Farid",           title: "CEO & Co-founder",          emailPrefix: "s.farid",         emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Bill",     lastName: "Hogan",           title: "Chief Revenue Officer",     emailPrefix: "b.hogan",         emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Lucas",    lastName: "Freeman",         title: "VP of Engineering",         emailPrefix: "l.freeman",       emailStatus: "likely",   seniorityLevel: "vp" },
      ],
      "plusonerobotics.com": [
        { firstName: "Erik",     lastName: "Nieves",          title: "CEO & Co-founder",          emailPrefix: "e.nieves",        emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Paul",     lastName: "Hvass",           title: "CTO",                       emailPrefix: "p.hvass",         emailStatus: "likely",   seniorityLevel: "c_suite" },
        { firstName: "Dana",     lastName: "Whicker",         title: "VP of Operations",          emailPrefix: "d.whicker",       emailStatus: "likely",   seniorityLevel: "vp" },
      ],
      "mujin.co.jp": [
        { firstName: "Rosen",    lastName: "Diankov",         title: "CEO & Co-founder",          emailPrefix: "r.diankov",       emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Issei",    lastName: "Yoshimi",         title: "CTO",                       emailPrefix: "i.yoshimi",       emailStatus: "likely",   seniorityLevel: "c_suite" },
        { firstName: "Kenji",    lastName: "Nakamura",        title: "VP of Business Dev",        emailPrefix: "k.nakamura",      emailStatus: "likely",   seniorityLevel: "vp" },
      ],
      "1x.tech": [
        { firstName: "Bernt",    lastName: "Bornich",         title: "CEO & Co-founder",          emailPrefix: "b.bornich",       emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Erik",     lastName: "Jorgensen",       title: "CTO",                       emailPrefix: "e.jorgensen",     emailStatus: "likely",   seniorityLevel: "c_suite" },
        { firstName: "Espen",    lastName: "Orud",            title: "VP of Engineering",         emailPrefix: "e.orud",          emailStatus: "likely",   seniorityLevel: "vp" },
      ],
      "canvas.build": [
        { firstName: "Neil",     lastName: "Nasser",          title: "CEO & Co-founder",          emailPrefix: "n.nasser",        emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Kevin",    lastName: "Albert",          title: "CTO",                       emailPrefix: "k.albert",        emailStatus: "likely",   seniorityLevel: "c_suite" },
        { firstName: "Jamie",    lastName: "Graham",          title: "VP of Operations",          emailPrefix: "j.graham",        emailStatus: "likely",   seniorityLevel: "vp" },
      ],
      "geekplus.com": [
        { firstName: "Lit",      lastName: "Fung",            title: "CEO & Co-founder",          emailPrefix: "l.fung",          emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Leon",     lastName: "Xi",              title: "CTO",                       emailPrefix: "l.xi",            emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Kai",      lastName: "Huang",           title: "VP of International",       emailPrefix: "k.huang",         emailStatus: "likely",   seniorityLevel: "vp" },
      ],
      "new.abb.com": [
        { firstName: "Goran",    lastName: "Djordjevic",      title: "President, Robotics",       emailPrefix: "g.djordjevic",    emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Sami",     lastName: "Atiya",           title: "President, Process Automation", emailPrefix: "s.atiya",    emailStatus: "verified", seniorityLevel: "c_suite" },
        { firstName: "Marc",     lastName: "Umfer",           title: "VP of Sales",               emailPrefix: "m.umfer",         emailStatus: "likely",   seniorityLevel: "vp" },
      ],
    };
  }

  /**
   * Generates deterministic, unique contacts for unknown company domains.
   * Uses the domain as a seed so the same domain always gets the same names
   * (not random), and different domains get different names.
   */
  _generateUniqueContacts(domain) {
    const firstNames = [
      "James", "Emily", "Marcus", "Priya", "Daniel", "Jessica", "Robert", "Ashley", "William", "Amanda",
      "Christopher", "Stephanie", "Matthew", "Nicole", "Anthony", "Lauren", "Kevin", "Megan", "Jason", "Rachel",
      "Ryan", "Katherine", "Eric", "Christine", "Jacob", "Angela", "Jonathan", "Helen", "Samuel", "Diana",
    ];
    const lastNames = [
      "Chen", "Rodriguez", "Kim", "Patel", "Johnson", "Williams", "Thompson", "Martinez", "Anderson",
      "Taylor", "Moore", "Jackson", "Harris", "Martin", "Garcia", "Lee", "Walker", "Hall", "Allen", "Young",
      "Hernandez", "King", "Wright", "Lopez", "Hill", "Scott", "Green", "Adams", "Baker", "Nelson",
    ];
    const seniorPairs = [
      ["CEO",                    "CTO",                       "c_suite"],
      ["Chief Robotics Officer", "VP of Engineering",         "c_suite"],
      ["President",              "VP of Product",             "c_suite"],
      ["Founder & CEO",          "Chief Technology Officer",  "c_suite"],
      ["Chief Operating Officer","VP of Automation",          "c_suite"],
    ];

    // Deterministic seed derived from the domain string
    const seed = domain.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const pick = (arr, offset) => arr[(seed + offset) % arr.length];

    const pair = seniorPairs[seed % seniorPairs.length];
    const company = domain.split(".")[0];

    const fn1 = pick(firstNames, 0);
    const ln1 = pick(lastNames, 1);
    const fn2 = pick(firstNames, 5);
    const ln2 = pick(lastNames, 8);

    return [
      {
        firstName: fn1,
        lastName: ln1,
        title: pair[0],
        emailPrefix: `${fn1[0].toLowerCase()}.${ln1.toLowerCase()}`,
        emailStatus: "verified",
        seniorityLevel: pair[2],
        company,
        companyDomain: domain,
      },
      {
        firstName: fn2,
        lastName: ln2,
        title: pair[1],
        emailPrefix: `${fn2[0].toLowerCase()}.${ln2.toLowerCase()}`,
        emailStatus: "likely",
        seniorityLevel: "vp",
        company,
        companyDomain: domain,
      },
    ];
  }

  /**
   * Returns realistic mock contacts for a given domain.
   * Uses the curated database first, then generates unique contacts as fallback.
   */
  _mockContacts(domain) {
    logger.warn(`Using mock contacts for ${domain} — set a valid APOLLO_API_KEY for real data`);

    const known = this._getKnownContacts();
    const company = domain.split(".")[0];
    const rawContacts = known[domain] || this._generateUniqueContacts(domain);

    return rawContacts.map((c) => ({
      id: undefined,
      firstName: c.firstName,
      lastName: c.lastName,
      name: `${c.firstName} ${c.lastName}`,
      title: c.title,
      email: `${c.emailPrefix}@${domain}`,
      emailStatus: c.emailStatus,
      phone: null,
      linkedinUrl: `https://linkedin.com/in/${c.firstName.toLowerCase()}-${c.lastName.toLowerCase().replace(/\s+/g, "-")}`,
      company: c.company || company,
      companyDomain: domain,
      seniorityLevel: c.seniorityLevel || "vp",
      source: "apollo_mock",
      enrichedAt: new Date().toISOString(),
    }));
  }

  /**
   * Returns realistic mock company data for a given domain.
   */
  _mockCompany(domain) {
    const companyData = {
      "bostondynamics.com":   { name: "Boston Dynamics",      employees: 1000,  revenue: "$100M-$500M", hq: "Waltham, MA, US",       desc: "World leader in mobile robotics — makers of Spot, Atlas, and Stretch." },
      "waymo.com":            { name: "Waymo",                employees: 2500,  revenue: "$500M+",      hq: "Mountain View, CA, US", desc: "Autonomous driving technology company, a subsidiary of Alphabet." },
      "universal-robots.com": { name: "Universal Robots",     employees: 900,   revenue: "$300M+",      hq: "Odense, Denmark",       desc: "Leading manufacturer of collaborative robotic arms (cobots)." },
      "intuitive.com":        { name: "Intuitive Surgical",   employees: 11000, revenue: "$5B+",        hq: "Sunnyvale, CA, US",     desc: "Pioneer of robotic-assisted surgery, maker of the da Vinci System." },
      "medtronic.com":        { name: "Medtronic",            employees: 90000, revenue: "$30B+",       hq: "Dublin, Ireland",       desc: "Global leader in medical technology including robotic surgery." },
      "stryker.com":          { name: "Stryker",              employees: 43000, revenue: "$18B+",       hq: "Kalamazoo, MI, US",     desc: "Medical technology with the Mako robotic surgery system." },
      "symbotic.com":         { name: "Symbotic",             employees: 1000,  revenue: "$400M+",      hq: "Wilmington, MA, US",    desc: "AI-powered warehouse robotics and supply chain automation." },
      "nuro.ai":              { name: "Nuro",                 employees: 1000,  revenue: "$50M-$100M",  hq: "Mountain View, CA, US", desc: "Autonomous delivery vehicles for last-mile goods delivery." },
      "agilityrobotics.com":  { name: "Agility Robotics",     employees: 200,   revenue: "$10M-$50M",  hq: "Salem, OR, US",         desc: "Makers of Digit, a bipedal robot for logistics environments." },
      "figure.ai":            { name: "Figure",               employees: 300,   revenue: "$10M-$50M",  hq: "Sunnyvale, CA, US",     desc: "Building general-purpose humanoid robots for commercial use." },
      "apptronik.com":        { name: "Apptronik",            employees: 150,   revenue: "$5M-$20M",   hq: "Austin, TX, US",        desc: "Developing general-purpose bipedal robots for industrial use." },
      "intrinsic.ai":         { name: "Intrinsic",            employees: 300,   revenue: "$10M-$50M",  hq: "Mountain View, CA, US", desc: "Alphabet's robotics software platform for industrial automation." },
      "skydio.com":           { name: "Skydio",               employees: 500,   revenue: "$50M-$100M", hq: "San Mateo, CA, US",     desc: "Autonomous drone company for inspection and defense applications." },
      "sarcos.com":           { name: "Sarcos Technology",    employees: 200,   revenue: "$20M-$50M",  hq: "Salt Lake City, UT, US",desc: "Powered exoskeleton robotics for industrial and defense use." },
      "geekplus.com":         { name: "Geek+",                employees: 2000,  revenue: "$200M+",     hq: "Beijing, China",        desc: "Global leader in intelligent logistics robots and AMRs." },
      "locusrobotics.com":    { name: "Locus Robotics",       employees: 350,   revenue: "$80M+",      hq: "Wilmington, MA, US",    desc: "Autonomous mobile robots for warehouse fulfillment." },
      "fetchrobotics.com":    { name: "Fetch Robotics",       employees: 200,   revenue: "$30M-$50M",  hq: "San Jose, CA, US",      desc: "Autonomous mobile robots for warehouse logistics automation." },
    };

    const known = companyData[domain];
    if (known) {
      return { ...known, domain, website: `https://${domain}`, industry: "Robotics", source: "apollo_mock" };
    }

    // Generic fallback for unknowns
    const companyName = domain.split(".")[0];
    return {
      name: companyName.charAt(0).toUpperCase() + companyName.slice(1).replace(/-/g, " "),
      domain,
      website: `https://${domain}`,
      industry: "Robotics",
      employeeCount: 150,
      revenueRange: "$10M-$50M",
      description: `${companyName} is an advanced robotics and automation technology company.`,
      headquarters: "United States",
      source: "apollo_mock",
    };
  }
}

module.exports = new ApolloIntegration();
