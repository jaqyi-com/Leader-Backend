// ============================================================
// ENRICHMENT AGENT (Phase 3)
// Identifies decision-makers and enriches contact data
// Runs Apollo → Clay → email guessing waterfall
// ============================================================

const logger = require("../utils/logger").forAgent("EnrichmentAgent");
const apollo = require("../integrations/ApolloIntegration");

const emailValidator = require("../utils/emailValidator");
const dedup = require("../utils/deduplication");
const icpConfig = require("../config/icp.config");
const { generateContactId, sleepWithJitter, chunkArray } = require("../utils/helpers");
const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(process.cwd(), "data", "enriched_contacts.json");
const MAX_CONTACTS_PER_COMPANY = parseInt(process.env.MAX_CONTACTS_PER_COMPANY || "3");

class EnrichmentAgent {
  constructor() {
    this.enrichedContacts = [];
    this.enrichedCompanies = [];
  }

  /**
   * MAIN ENTRY POINT
   * Takes scraped companies, enriches them, finds decision-makers
   */
  async run(companies) {
    logger.info(`=== ENRICHMENT AGENT STARTING ===`);
    logger.info(`Processing ${companies.length} companies`);

    const allContacts = [];
    const enrichedCompanies = [];

    // Process in batches to respect API limits
    const batches = chunkArray(companies, 5);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      logger.info(`Processing batch ${i + 1}/${batches.length} (${batch.length} companies)`);

      const batchResults = await Promise.all(
        batch.map((company) => this.processCompany(company))
      );

      for (const result of batchResults) {
        if (result) {
          enrichedCompanies.push(result.company);
          allContacts.push(...result.contacts);
        }
      }

      await sleepWithJitter(1000, 500);
    }

    // Deduplication pass on contacts
    const uniqueContacts = dedup.deduplicateContacts(allContacts);

    // Email validation pass
    const validatedContacts = await this.validateEmails(uniqueContacts);

    this.enrichedContacts = validatedContacts;
    this.enrichedCompanies = enrichedCompanies;

    // Save to disk
    this._saveContacts(validatedContacts);

    logger.info(`Enrichment complete: ${validatedContacts.length} validated contacts from ${enrichedCompanies.length} companies`);

    return { companies: enrichedCompanies, contacts: validatedContacts };
  }

  /**
   * Process a single company: enrich it + find decision-makers
   */
  async processCompany(company) {
    try {
      // Step 1: Enrich company data
      let enrichedCompany = company;
      if (company.domain) {
        const apolloCompany = await apollo.enrichCompany(company.domain);
        if (apolloCompany) {
          enrichedCompany = { ...company, ...apolloCompany, id: company.id };
          logger.info(`Company enriched: ${company.name}`);
        }


      }

      // Step 2: Find decision-makers
      const contacts = await this.findDecisionMakers(enrichedCompany);

      return { company: enrichedCompany, contacts };
    } catch (err) {
      logger.error(`Failed to process ${company.name}: ${err.message}`);
      return { company, contacts: [] };
    }
  }

  /**
   * Find decision-makers at a company
   * Priority: Primary roles (CTO, VP Eng) > Secondary > Tertiary
   */
  async findDecisionMakers(company) {
    const allTitles = [
      ...icpConfig.roles.primary,
      ...icpConfig.roles.secondary,
      ...icpConfig.roles.tertiary,
    ];

    let contacts = [];

    // Try Apollo first
    if (company.domain) {
      const apolloContacts = await apollo.searchPeople(company.domain, allTitles);
      contacts.push(...apolloContacts.map((c) => ({
        ...c,
        companyId: company.id,
        company: company.name,
        companyDomain: company.domain,
      })));
    }



    // Assign priority based on role
    const prioritized = this.prioritizeContacts(contacts);

    // Limit per company
    const limited = prioritized.slice(0, MAX_CONTACTS_PER_COMPANY);

    // Assign IDs
    return limited.map((c) => ({
      ...c,
      id: c.id || generateContactId(c.name, c.company || ""),
    }));
  }


  /**
   * Score and prioritize contacts by role seniority
   */
  prioritizeContacts(contacts) {
    const roleScore = (title = "") => {
      const t = title.toLowerCase();
      if (icpConfig.roles.primary.some((r) => t.includes(r.toLowerCase()))) return 3;
      if (icpConfig.roles.secondary.some((r) => t.includes(r.toLowerCase()))) return 2;
      if (icpConfig.roles.tertiary.some((r) => t.includes(r.toLowerCase()))) return 1;
      return 0;
    };

    return contacts
      .filter((c) => c.email) // Only contacts with emails
      .sort((a, b) => roleScore(b.title) - roleScore(a.title));
  }

  /**
   * Validate emails for a batch of contacts
   */
  async validateEmails(contacts) {
    logger.info(`Validating emails for ${contacts.length} contacts...`);
    const validated = [];

    for (const contact of contacts) {
      if (!contact.email) {
        // Skip contacts without email
        continue;
      }

      const validation = await emailValidator.validate(contact.email);
      validated.push({
        ...contact,
        emailValid: validation.valid,
        emailConfidence: validation.confidence,
        emailValidationReason: validation.reason,
      });

      await sleepWithJitter(100);
    }

    // Filter out invalid emails
    const valid = validated.filter((c) => c.emailValid);
    logger.info(`Email validation: ${contacts.length} → ${valid.length} valid emails`);
    return valid;
  }

  _saveContacts(contacts) {
    try {
      const dir = path.dirname(DATA_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(contacts, null, 2));
      logger.info(`Saved ${contacts.length} contacts to ${DATA_FILE}`);
    } catch (err) {
      logger.warn(`Could not save contacts: ${err.message}`);
    }
  }

  loadSavedContacts() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
      }
    } catch { /* ignore */ }
    return [];
  }

  getStats() {
    return {
      totalContacts: this.enrichedContacts.length,       // used by dashboard
      enrichedCompanies: this.enrichedCompanies.length,
      enrichedContacts: this.enrichedContacts.length,    // legacy alias
      contactsWithEmail: this.enrichedContacts.filter((c) => c.email).length,
      contactsWithPhone: this.enrichedContacts.filter((c) => c.phone).length,
    };
  }
}

module.exports = EnrichmentAgent;
