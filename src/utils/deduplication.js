// ============================================================
// DEDUPLICATION - Prevents duplicate companies/contacts
// Uses in-memory Sets synced from MongoDB Atlas on boot
// ============================================================

const logger = require("./logger").forAgent("Dedup");

class DeduplicationStore {
  constructor() {
    this.seenCompanies = new Set();
    this.seenContacts = new Set();
    this.isLoaded = false;
  }

  /**
   * Called to pre-fetch all existing keys from MongoDB into memory
   */
  async loadFromDB() {
    try {
      const { Company, Contact } = require("../db/mongoose");
      const companies = await Company.find({}, { domain: 1, name: 1 });
      const contacts = await Contact.find({}, { email: 1, name: 1, companyName: 1 });
      
      this.seenCompanies.clear();
      this.seenContacts.clear();

      companies.forEach(c => this.seenCompanies.add(this._normalizeCompany(c.name, c.domain)));
      contacts.forEach(c => this.seenContacts.add(this._normalizeContact(c.email, c.name, c.companyName)));
      
      this.isLoaded = true;
      logger.info(`Loaded ${this.seenCompanies.size} seen companies and ${this.seenContacts.size} seen contacts from MongoDB`);
    } catch (err) {
      logger.warn(`Could not load MongoDB dedup state: ${err.message}`);
    }
  }

  /**
   * Normalize company name to a dedup key
   */
  _normalizeCompany(name, domain) {
    const namePart = (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const domainPart = domain ? domain.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
    return domainPart || namePart;
  }

  /**
   * Normalize contact to a dedup key
   */
  _normalizeContact(email, name, company) {
    if (email) return email.toLowerCase().trim();
    const n = (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const c = (company || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return `${n}@${c}`;
  }

  /**
   * Check if company is a duplicate
   */
  isCompanyDuplicate(name, domain) {
    const key = this._normalizeCompany(name, domain);
    return this.seenCompanies.has(key);
  }

  /**
   * Mark a company as seen (in-memory)
   */
  markCompanySeen(name, domain) {
    const key = this._normalizeCompany(name, domain);
    this.seenCompanies.add(key);
  }

  /**
   * Check if contact is a duplicate
   */
  isContactDuplicate(email, name, company) {
    const key = this._normalizeContact(email, name, company);
    return this.seenContacts.has(key);
  }

  /**
   * Mark contact as seen (in-memory)
   */
  markContactSeen(email, name, company) {
    const key = this._normalizeContact(email, name, company);
    this.seenContacts.add(key);
  }

  /**
   * Deduplicate an array of companies
   */
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

  /**
   * Deduplicate an array of contacts
   */
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
      totalSeenContacts: this.seenContacts.size,
    };
  }

  async clearMongo() {
    try {
      const { Company, Contact } = require("../db/mongoose");
      await Company.deleteMany({});
      await Contact.deleteMany({});
      this.seenCompanies.clear();
      this.seenContacts.clear();
      logger.info("MongoDB Dedup Collections cleared.");
    } catch (err) {
      logger.warn("Error clearing mongo state: " + err.message);
    }
  }
}

// Singleton instance
module.exports = new DeduplicationStore();
