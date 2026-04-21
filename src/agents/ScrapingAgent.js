// ============================================================
// SCRAPING AGENT (Phase 2)
// Discovers robotics companies from public web sources
// Uses Cheerio for static pages + Puppeteer for JS-rendered pages
// ============================================================

const axios = require("axios");
const cheerio = require("cheerio");
const logger = require("../utils/logger").forAgent("ScrapingAgent");
const dedup = require("../utils/deduplication");
const { sleep, sleepWithJitter, generateCompanyId, extractDomain } = require("../utils/helpers");
const icpConfig = require("../config/icp.config");
const llm = require("../integrations/OpenAILLM");
const apollo = require("../integrations/ApolloIntegration");

class ScrapingAgent {
  constructor() {
    this.browser = null;
    this.useHeadless = process.env.USE_HEADLESS_BROWSER === "true";
    this.delayMs = parseInt(process.env.SCRAPING_DELAY_MS || "2000");
    this.maxCompanies = parseInt(process.env.MAX_COMPANIES_PER_RUN || "100");
    this.discoveredCompanies = [];
  }

  /**
   * MAIN ENTRY POINT
   * Runs all scraping sources and returns deduplicated companies
   */
  async run() {
    logger.info("=== SCRAPING AGENT STARTING ===");
    logger.info(`Target: ${this.maxCompanies} companies`);

    const allCompanies = [];

    // Source 1: Scrape from Apollo API
    const fromApollo = await this.scrapeFromApollo();
    allCompanies.push(...fromApollo);

    // Source 2: Build from known companies seed list
    const fromSeedList = await this.loadSeedCompanies();
    allCompanies.push(...fromSeedList);

    // Deduplication pass
    const unique = dedup.deduplicateCompanies(allCompanies);

    // ICP qualification filter
    const qualified = this.filterByIcp(unique);

    // Score each qualified company with ICP fit score via LLM
    const scored = await this.scoreIcpCompanies(qualified);

    logger.info(`Scraping complete: ${allCompanies.length} raw → ${unique.length} unique → ${scored.length} ICP-qualified`);

    this.discoveredCompanies = scored.slice(0, this.maxCompanies);
    return this.discoveredCompanies;
  }

  /**
   * Scrape companies from Apollo API
   */
  async scrapeFromApollo() {
    logger.info("Scraping robotics companies from Apollo...");
    try {
      // Use ICP segments as keywords for Apollo search
      const keywords = icpConfig.company.segments || ["robotics", "automation"];
      const apolloOrgs = await apollo.searchCompanies(keywords);
      
      return apolloOrgs.map(org => ({
        ...this._createCompanyRecord(org.name, {
          website: org.website,
          employeeCount: org.employeeCount,
          revenue: org.revenue,
          primarySegment: org.subIndustry || org.industry,
          description: org.description,
          technologies: org.technologies,
          source: "apollo",
        }),
        domain: org.domain || (org.website ? extractDomain(org.website) : null),
      }));
    } catch (err) {
      logger.warn(`Failed to scrape from Apollo: ${err.message}`);
      return [];
    }
  }

  /**
   * Load curated seed list of known robotics companies
   * This is a foundational list that always gets processed
   */
  async loadSeedCompanies() {
    logger.info("Loading seed company list...");

    const seedCompanies = [
      { name: "Boston Dynamics", website: "https://bostondynamics.com", segment: "industrial automation", employees: 500, revenue: 50_000_000 },
      { name: "ABB Robotics", website: "https://new.abb.com/products/robotics", segment: "industrial automation", employees: 10000, revenue: 3_000_000_000 },
      { name: "Universal Robots", website: "https://www.universal-robots.com", segment: "collaborative robots", employees: 900, revenue: 300_000_000 },
      { name: "Fetch Robotics", website: "https://fetchrobotics.com", segment: "warehouse robotics", employees: 200, revenue: 30_000_000 },
      { name: "6 River Systems", website: "https://6river.com", segment: "warehouse robotics", employees: 400, revenue: 50_000_000 },
      { name: "Locus Robotics", website: "https://locusrobotics.com", segment: "warehouse robotics", employees: 350, revenue: 80_000_000 },
      { name: "Symbotic", website: "https://symbotic.com", segment: "warehouse robotics", employees: 1000, revenue: 400_000_000 },
      { name: "Geek+", website: "https://www.geekplus.com", segment: "warehouse robotics", employees: 2000, revenue: 200_000_000 },
      { name: "GreyOrange", website: "https://greyorange.com", segment: "warehouse robotics", employees: 500, revenue: 100_000_000 },
      { name: "Righthand Robotics", website: "https://righthandrobotics.com", segment: "warehouse robotics", employees: 80, revenue: 15_000_000 },
      { name: "Covariant", website: "https://covariant.ai", segment: "warehouse robotics", employees: 150, revenue: 20_000_000 },
      { name: "Intrinsic", website: "https://intrinsic.ai", segment: "industrial automation", employees: 300, revenue: 0 },
      { name: "Machina Labs", website: "https://machinalabs.ai", segment: "manufacturing automation", employees: 60, revenue: 10_000_000 },
      { name: "Viam Robotics", website: "https://viam.com", segment: "industrial automation", employees: 150, revenue: 5_000_000 },
      { name: "Formant", website: "https://formant.io", segment: "industrial automation", employees: 80, revenue: 8_000_000 },
      { name: "Waymo", website: "https://waymo.com", segment: "autonomous mobile robots", employees: 2500, revenue: 100_000_000 },
      { name: "Nuro", website: "https://nuro.ai", segment: "autonomous mobile robots", employees: 1000, revenue: 50_000_000 },
      { name: "Sarcos Technology", website: "https://sarcos.com", segment: "industrial automation", employees: 200, revenue: 20_000_000 },
      { name: "Canvas Construction", website: "https://canvas.build", segment: "construction robotics", employees: 70, revenue: 5_000_000 },
      { name: "Memic", website: "https://memicmed.com", segment: "medical robotics", employees: 150, revenue: 10_000_000 },
      { name: "Intuitive Surgical", website: "https://www.intuitive.com", segment: "medical robotics", employees: 10000, revenue: 5_700_000_000 },
      { name: "Medtronic Robotics", website: "https://www.medtronic.com", segment: "medical robotics", employees: 90000, revenue: 30_000_000_000 },
      { name: "Stryker Robotics", website: "https://www.stryker.com/us/en/portfolios/robotic-applications.html", segment: "medical robotics", employees: 43000, revenue: 18_000_000_000 },
      { name: "Bear Robotics", website: "https://www.bearrobotics.ai", segment: "service robotics", employees: 120, revenue: 8_000_000 },
      { name: "Zipline", website: "https://flyzipline.com", segment: "inspection robotics", employees: 700, revenue: 50_000_000 },
      { name: "Skydio", website: "https://skydio.com", segment: "inspection robotics", employees: 500, revenue: 70_000_000 },
      { name: "Percepto", website: "https://percepto.co", segment: "inspection robotics", employees: 200, revenue: 20_000_000 },
      { name: "Berkshire Grey", website: "https://berkshiregrey.com", segment: "warehouse robotics", employees: 450, revenue: 40_000_000 },
      { name: "Plus One Robotics", website: "https://plusonerobotics.com", segment: "warehouse robotics", employees: 70, revenue: 5_000_000 },
      { name: "Mujin", website: "https://mujin.co.jp/en", segment: "manufacturing automation", employees: 300, revenue: 60_000_000 },
      { name: "Agility Robotics", website: "https://agilityrobotics.com", segment: "industrial automation", employees: 200, revenue: 10_000_000 },
      { name: "Apptronik", website: "https://apptronik.com", segment: "industrial automation", employees: 150, revenue: 5_000_000 },
      { name: "Figure AI", website: "https://figure.ai", segment: "industrial automation", employees: 200, revenue: 10_000_000 },
      { name: "1X Technologies", website: "https://www.1x.tech", segment: "industrial automation", employees: 100, revenue: 5_000_000 },
      { name: "Formic Technologies", website: "https://formic.co", segment: "manufacturing automation", employees: 80, revenue: 8_000_000 },
    ];

    return seedCompanies.map((c) => ({
      ...this._createCompanyRecord(c.name, {
        website: c.website,
        employeeCount: c.employees,
        revenue: c.revenue,
        primarySegment: c.segment,
        source: "seed_list",
      }),
      domain: extractDomain(c.website),
    }));
  }

  /**
   * Filter companies by ICP criteria
   */
  filterByIcp(companies) {
    return companies.filter((company) => {
      // Must be in a target segment
      const segmentMatch = icpConfig.company.segments.some((seg) =>
        (company.primarySegment || "").toLowerCase().includes(seg.toLowerCase()) ||
        (company.description || "").toLowerCase().includes(seg.toLowerCase())
      );

      // Check disqualifiers
      const disqualified = icpConfig.company.disqualifiers.some((d) =>
        (company.description || "").toLowerCase().includes(d.toLowerCase())
      );

      return segmentMatch && !disqualified;
    });
  }

  /**
   * Score each ICP-qualified company via LLM and stamp icpScore on the record
   * Falls back to a heuristic score if LLM is unavailable
   */
  async scoreIcpCompanies(companies) {
    const scored = [];
    for (const company of companies) {
      try {
        const description = [
          company.description || `${company.name} is a robotics company`,
          company.primarySegment || "",
          (company.technologies || []).join(", "),
        ].join(" ");

        const icpResult = await llm.scoreIcpFit(description, {
          segments: icpConfig.company.segments,
          technologySignals: icpConfig.company.technologySignals || [],
          disqualifiers: icpConfig.company.disqualifiers,
        });

        scored.push({
          ...company,
          icpScore: icpResult.score,
          primarySegment: icpResult.primarySegment || company.primarySegment,
        });
      } catch (err) {
        // Heuristic fallback: seed-list companies that passed filterByIcp() get 75
        logger.warn(`ICP LLM scoring failed for ${company.name}: ${err.message} — using default score`);
        scored.push({ ...company, icpScore: company.source === "seed_list" ? 75 : 60 });
      }
    }
    return scored;
  }

  /**
   * Check if content is robotics-related
   */
  _isRoboticsRelated(text) {
    const roboticsKeywords = [
      "robot", "robotic", "automation", "autonomous", "AMR",
      "warehouse automation", "industrial automation", "cobot",
      "LiDAR", "sensor", "actuator", "servo", "SLAM",
    ];
    const lower = text.toLowerCase();
    return roboticsKeywords.some((kw) => lower.includes(kw.toLowerCase()));
  }

  /**
   * Build a standardized company record
   */
  _createCompanyRecord(name, extra = {}) {
    return {
      id: generateCompanyId(name),
      name,
      domain: extra.website ? extractDomain(extra.website) : null,
      website: extra.website || null,
      industry: "Robotics",
      subIndustry: extra.primarySegment || null,
      primarySegment: extra.primarySegment || "robotics",
      employeeCount: extra.employeeCount || null,
      revenue: extra.revenue || null,
      description: extra.description || null,
      technologies: extra.technologies || [],
      source: extra.source || "scraping",
      articleUrl: extra.articleUrl || null,
      discoveredAt: new Date().toISOString(),
      enriched: false,
    };
  }

  /**
   * Fetch a page with polite headers
   */
  async _fetchPage(url) {
    try {
      const response = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ResearchBot/1.0; +https://leader.com/bot)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeout: 15000,
      });
      return response.data;
    } catch (err) {
      logger.warn(`Failed to fetch ${url}: ${err.message}`);
      return null;
    }
  }

  getStats() {
    // dedupStats can just be pulled normally if still synchronous
    const dedupStats = dedup.getStats();
    return {
      totalCompanies: this.discoveredCompanies.length,
      qualifiedCompanies: this.discoveredCompanies.length,
      discovered: this.discoveredCompanies.length,   // legacy alias
      dedupStats,
    };
  }
}

module.exports = ScrapingAgent;
