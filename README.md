# 🤖 Keli Sensing — Multi-System Agent
### Robotics Market Intelligence & Outreach Automation
**Built by Trinity Agents | Powered by ChatGPT (OpenAI)**

---

## 📋 Table of Contents

1. [What This System Does](#what-this-system-does)
2. [How It Works — Architecture](#architecture)
3. [Project Structure](#project-structure)
4. [Prerequisites](#prerequisites)
5. [Installation Guide](#installation-guide)
6. [Configuration Guide](#configuration-guide)
7. [Running the Pipeline](#running-the-pipeline)
8. [Phase-by-Phase Explanation](#phase-by-phase-explanation)
9. [Real-Life Deployment Guide](#real-life-deployment-guide)
10. [Google Sheets Setup](#google-sheets-setup)
11. [Troubleshooting](#troubleshooting)
12. [API Key Setup Guides](#api-key-setup-guides)

---

## What This System Does

This is a **6-agent autonomous pipeline** that:

1. **Finds** robotics companies matching Keli Sensing's Ideal Customer Profile (ICP)
2. **Identifies** key decision-makers (CTOs, VPs of Engineering, etc.) at those companies
3. **Enriches** contact data with verified emails, phone numbers, LinkedIn profiles
4. **Sends** AI-personalized outreach emails using ChatGPT (OpenAI LLM)
5. **Scores** every lead based on company size, revenue, engagement, and sentiment
6. **Reports** everything to a live Google Sheets dashboard

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   PIPELINE ORCHESTRATOR                      │
│              (src/orchestrator.js) — coordinates all        │
└────────────────────┬────────────────────────────────────────┘
                     │
         ┌───────────▼────────────┐
         │   Phase 2              │
         │   SCRAPING AGENT       │──► Public web directories
         │   ScrapingAgent.js     │    Industry listings
         └───────────┬────────────┘    Seed company list
                     │
         ┌───────────▼────────────┐
         │   Phase 3              │
         │   ENRICHMENT AGENT     │──► Apollo.io API
         │   EnrichmentAgent.js   │    Clay API
         └───────────┬────────────┘    Email verification
                     │
         ┌───────────▼────────────┐
         │   Phase 4              │
         │   OUTREACH AGENT       │──► OpenAI ChatGPT LLM
         │   OutreachAgent.js     │    SMTP (email)
         └───────────┬────────────┘
                     │
         ┌───────────▼────────────┐
         │   Phase 5              │
         │   LEAD SCORING AGENT   │──► Sentiment analysis
         │   LeadScoringAgent.js  │    Multi-factor scoring
         └───────────┬────────────┘    Priority routing
                     │
         ┌───────────▼────────────┐
         │   Phase 6              │
         │   REPORTING AGENT      │──► Google Sheets API
         │   ReportingAgent.js    │    Local JSON reports
         └────────────────────────┘    Console dashboard
```

### Data Flow

```
Scraped Companies (JSON)
       ↓
Enriched Contacts (data/contacts.json)
       ↓
Outreach Log (data/outreach_log.json)
       ↓
Inbound Responses (data/responses.json)
       ↓
Lead Scores (data/lead_scores.json)
       ↓
Google Sheets Dashboard
```

---

## Project Structure

```
keli-sensing-agent/
├── src/
│   ├── index.js                    ← Main entry point (CLI router)
│   ├── orchestrator.js             ← Pipeline coordinator
│   │
│   ├── agents/
│   │   ├── ScrapingAgent.js        ← Phase 2: Company discovery
│   │   ├── EnrichmentAgent.js      ← Phase 3: Contact enrichment
│   │   ├── OutreachAgent.js        ← Phase 4: Email sending
│   │   ├── LeadScoringAgent.js     ← Phase 5: Lead scoring
│   │   └── ReportingAgent.js       ← Phase 6: Dashboard reporting
│   │
│   ├── integrations/
│   │   ├── OpenAILLM.js            ← ChatGPT AI for personalization
│   │   ├── ApolloIntegration.js    ← Apollo.io enrichment
│   │   ├── ClayIntegration.js      ← Clay enrichment
│   │   ├── SmtpIntegration.js      ← Email delivery
│   │   └── GoogleSheetsIntegration.js ← CRM dashboard
│   │
│   ├── config/
│   │   ├── icp.config.js           ← ICP criteria & personas
│   │   └── outreach.config.js      ← Email sequences & prompts
│   │
│   └── utils/
│       ├── logger.js               ← Winston structured logging
│       ├── helpers.js              ← Utility functions
│       ├── deduplication.js        ← Duplicate prevention
│       └── emailValidator.js       ← Email verification
│
├── data/                           ← Auto-generated pipeline data
│   ├── companies.json
│   ├── contacts.json
│   ├── outreach_log.json
│   ├── responses.json
│   ├── lead_scores.json
│   └── report_YYYY-MM-DD.json
│
├── logs/                           ← Auto-generated log files
│   ├── agent-YYYY-MM-DD.log
│   └── error-YYYY-MM-DD.log
│
├── .env.example                    ← Template for your .env
├── .env                            ← Your actual config (never commit this)
├── package.json
└── README.md
```

---

## Prerequisites

Before you begin, make sure you have:

- **Node.js 18+** installed (`node --version` to check)
- **npm** (comes with Node.js)
- A machine with internet access

Optional (for full functionality):
- **Apollo.io account** (for contact enrichment)
- **Anthropic API key** (for LLM personalization)
- **SMTP credentials** (Gmail or dedicated outreach domain)
- **Google Cloud project** (for Sheets reporting)


---

## Installation Guide

### Step 1: Unzip and enter the project

```bash
unzip keli-sensing-agent.zip
cd keli-sensing-agent
```

### Step 2: Install dependencies

```bash
npm install
```

This installs all packages including:
- `openai` — ChatGPT AI
- `puppeteer` — headless browser scraping
- `nodemailer` — email sending
- `googleapis` — Google Sheets
- `axios`, `cheerio` — HTTP + HTML parsing

### Step 3: Configure environment

```bash
cp .env.example .env
```

Now open `.env` in your text editor and fill in your credentials.

---

## Configuration Guide

### The `.env` File Explained

```env
# MINIMUM REQUIRED (works without API keys in dry-run mode)
ANTHROPIC_API_KEY=sk-ant-...     # Get from console.anthropic.com
APOLLO_API_KEY=...                # Get from app.apollo.io/settings/api
SMTP_USER=you@yourdomain.com      # Your outreach email
SMTP_PASS=your-app-password       # Gmail App Password or SMTP password

# GOOGLE SHEETS (optional but recommended)
GOOGLE_SHEETS_SPREADSHEET_ID=1BxiMVs...  # From the URL of your sheet
GOOGLE_SERVICE_ACCOUNT_EMAIL=...          # From your service account JSON
GOOGLE_PRIVATE_KEY="-----BEGIN..."        # From your service account JSON

# PIPELINE TUNING
MAX_COMPANIES_PER_RUN=100        # How many companies to process
MAX_CONTACTS_PER_COMPANY=3       # Decision-makers per company
OUTREACH_DAILY_EMAIL_LIMIT=200   # Daily send cap (stay safe)
OUTREACH_DELAY_BETWEEN_EMAILS_MS=3000  # 3s between emails

# FEATURE FLAGS

ENABLE_AB_TESTING=false          # Optional A/B email variants
```

### Customize Your ICP (`src/config/icp.config.js`)

This is the most important configuration file. Edit these to match Keli Sensing's real criteria:

```js
// Who you're targeting:
segments: ["warehouse robotics", "medical robotics", ...],

// Company size filters:
employeeRanges: [
  { min: 1000, max: Infinity, label: "Enterprise", score: 30 },
  ...
],

// Keli Sensing's pitch:
valueProposition: {
  products: [{
    name: "T1 Sensor",
    benefits: ["Ultra-low latency...", "ROS2 compatible..."],
  }]
}
```

---

## Running the Pipeline

### Option A: Full Pipeline (all phases)

```bash
node src/index.js --phase=all
```

Runs Phases 2 → 3 → 4 → 5 → 6 in sequence. Takes ~20-40 minutes.

### Option B: Individual Phases

```bash
# Phase 2: Discover robotics companies
node src/index.js --phase=scrape

# Phase 3: Find decision-makers and enrich
node src/index.js --phase=enrich

# Phase 4: Send initial outreach (Step 1)
node src/index.js --phase=outreach --step=1

# Phase 4: Send follow-up (Step 2, run 3 days later)
node src/index.js --phase=outreach --step=2

# Phase 5: Score all leads
node src/index.js --phase=score

# Phase 6: Sync to Google Sheets
node src/index.js --phase=report

# Process a simulated inbound reply
node src/index.js --phase=reply
```

### npm shortcuts

```bash
npm run scrape           # Phase 2
npm run enrich           # Phase 3
npm run outreach         # Phase 4 step 1
npm run score            # Phase 5
npm run report           # Phase 6
npm run full-pipeline    # All phases
```

---

## Phase-by-Phase Explanation

### Phase 2 — Scraping Agent

**What it does in code:**
- `ScrapingAgent.js` fetches robotics company listing pages using `axios` + `cheerio`
- Extracts company names, websites, descriptions from HTML
- Also loads a curated seed list of 35+ known robotics companies
- Filters results against ICP criteria (segments, disqualifiers)
- Deduplicates using `deduplication.js` (fuzzy domain matching)

**What it does in real life:**
- Scans TechCrunch Robotics, The Robot Report, Tracxn, and other directories
- Identifies companies like Boston Dynamics, Locus Robotics, Covariant, etc.
- Saves `data/companies.json` — your raw prospect database

**Output:** `data/companies.json` with 50-100 company records

---

### Phase 3 — Enrichment Agent

**What it does in code:**
- `EnrichmentAgent.js` takes each company and calls `ApolloIntegration.js`
- Apollo returns contacts matching your role targets (CTO, VP Eng, etc.)
- Falls back to email guessing (`emailValidator.js`) if no email found
- Runs MX record DNS checks to verify email domains
- Deduplicates contacts, validates emails, keeps top 3 per company

**What it does in real life:**
- For "Boston Dynamics" → finds Sarah Mitchell (CTO), David Park (VP Eng)
- Verifies sarah.mitchell@bostondynamics.com has a valid MX record
- Tags contacts by seniority: Primary (CTO) > Secondary (Robotics Eng) > Tertiary (Procurement)

**Output:** `data/contacts.json` with verified, enriched decision-makers

---

### Phase 4 — Outreach Agent

**What it does in code:**
- `OutreachAgent.js` takes each contact and calls `OpenAILLM.js`
- The LLM prompt is injected with: contact name, title, company description, robotics type
- ChatGPT generates a unique, personalized email (not a template — actual custom copy)
- `SmtpIntegration.js` sends via nodemailer with rate limiting (3s delay between sends)
- A multi-step sequence tracks Step 1 → 2 → 3 via `data/outreach_log.json`

**What it does in real life:**
- Sarah Mitchell at Boston Dynamics gets an email that says:
  *"Hi Sarah — noticed Boston Dynamics has been expanding into warehouse AMRs recently.
  Our T1 sensor's sub-1ms response time is designed specifically for high-speed AMR
  navigation. Would a 15-min call next week make sense?"*
- Each email is unique — not mail-merge. Claude personalizes per company context.

**Output:** Emails sent, logged in `data/outreach_log.json`

---

### Phase 5 — Lead Scoring Agent

**What it does in code:**
- `LeadScoringAgent.js` scores each contact 0-100 across 5 dimensions:
  - **Company Score (30%)**: Employee count + revenue + tech signal matches
  - **Role Score (20%)**: CTO = 100, Robotics Engineer = 70, Procurement = 40
  - **Engagement Score (25%)**: Replied = +40 bonus, Interested = +20 more
  - **Sentiment Score (15%)**: NLP sentiment analysis on email reply text
  - **Alignment Score (10%)**: LiDAR/ROS/sensor keywords in company profile
- Assigns priority: HIGH ≥ 75 | MEDIUM ≥ 50 | LOW < 50

**What it does in real life:**
- Enterprise robotics company (1000+ employees) that replied positively = score 88 → HIGH
- Early-stage startup, no reply = score 35 → LOW
- Mid-market company, replied asking for pricing = score 72 → MEDIUM/HIGH

**Output:** Prioritized lead list in `data/lead_scores.json`

---

### Phase 6 — Reporting Agent

**What it does in code:**
- `ReportingAgent.js` authenticates via Google Service Account
- Creates/verifies sheet tabs: Companies, Contacts, Outreach Log, Responses, Lead Scores
- Writes headers if tabs are new, appends data rows
- Also prints a formatted summary to console
- Saves a local `data/report_YYYY-MM-DD.json`

**What it does in real life:**
- Your Google Sheets becomes a live CRM dashboard
- "Leads" tab shows: Name | Company | Score | Priority | Last Activity
- "Outreach Log" shows: every email sent, subject line, timestamp
- "Responses" shows: inbound replies with AI-extracted intent and next action

---

## Real-Life Deployment Guide

### Option 1: Run Manually (Easiest)

Run each phase in sequence as a one-time job:

```bash
node src/index.js --phase=scrape   # Monday
node src/index.js --phase=enrich   # Monday (after scrape)
node src/index.js --phase=outreach --step=1  # Monday (send initial)
# Wait 3 days
node src/index.js --phase=outreach --step=2  # Thursday (follow-up)
# Wait 4 days
node src/index.js --phase=outreach --step=3  # Monday (final)
node src/index.js --phase=score    # Anytime
node src/index.js --phase=report   # Anytime
```

### Option 2: Cron Job (Automated)

Add to your server's crontab (`crontab -e`):

```cron
# Run full pipeline every Monday at 9am
0 9 * * 1 cd /path/to/keli-sensing-agent && node src/index.js --phase=all >> logs/cron.log 2>&1

# Step 1 outreach on Mondays
0 10 * * 1 cd /path/to/keli-sensing-agent && node src/index.js --phase=outreach --step=1

# Step 2 follow-up on Thursdays
0 10 * * 4 cd /path/to/keli-sensing-agent && node src/index.js --phase=outreach --step=2

# Weekly scoring every Friday
0 17 * * 5 cd /path/to/keli-sensing-agent && node src/index.js --phase=score
```

### Option 3: Deploy to a VPS/Server

1. Provision a VPS (DigitalOcean, AWS EC2, etc.) with Ubuntu 22.04
2. Install Node.js 20:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
3. Clone/upload the project, run `npm install`
4. Configure `.env` with your credentials
5. Use `pm2` for process management:
   ```bash
   npm install -g pm2
   pm2 start src/index.js --name keli-agent -- --phase=all
   pm2 save
   pm2 startup
   ```

### Handling Inbound Replies

When a prospect replies to your outreach email, you need to process it through the agent. Options:

**Option A: Gmail Webhook (Recommended)**
- Set up a Gmail Push Notification via Google Cloud Pub/Sub
- Webhook calls `pipeline.processInboundReply(emailData)` automatically

**Option B: IMAP Polling**
Add a polling loop using `node-imap` package:
```js
// Check inbox every 15 minutes for new replies
cron.schedule('*/15 * * * *', async () => {
  const newReplies = await checkInbox();
  for (const reply of newReplies) {
    await pipeline.processInboundReply(reply);
  }
});
```

**Option C: Manual**
```bash
# Edit src/index.js phase=reply block with the real email
node src/index.js --phase=reply
```

---

## Google Sheets Setup

### Step 1: Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project: "Keli Sensing Agent"
3. Enable the **Google Sheets API**:
   - APIs & Services → Library → Search "Google Sheets API" → Enable

### Step 2: Create a Service Account

1. APIs & Services → Credentials → Create Credentials → Service Account
2. Name: "keli-agent-service"
3. Role: Editor
4. Create key → JSON → Download the JSON file

### Step 3: Extract credentials from JSON

Open the downloaded JSON and copy to your `.env`:
```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=keli-agent-service@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
```

### Step 4: Create and share the spreadsheet

1. Create a new Google Sheets spreadsheet
2. Copy the ID from the URL:
   `https://docs.google.com/spreadsheets/d/`**`1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms`**`/edit`
3. Share the spreadsheet with your service account email (Editor access)
4. Add to `.env`:
   ```env
   GOOGLE_SHEETS_SPREADSHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
   ```

---

## API Key Setup Guides

### Anthropic (Claude) API Key
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up / log in
3. API Keys → Create Key
4. Copy to `ANTHROPIC_API_KEY` in `.env`

### Apollo.io API Key
1. Go to [app.apollo.io](https://app.apollo.io)
2. Settings → Integrations → API
3. Create API Key
4. Copy to `APOLLO_API_KEY` in `.env`

### Gmail SMTP Setup
1. Enable 2-factor authentication on your Google account
2. Go to myaccount.google.com → Security → App Passwords
3. Create app password for "Mail"
4. Use your Gmail as `SMTP_USER` and the app password as `SMTP_PASS`

**Note:** For production outreach, use a dedicated domain (e.g., outreach@kelisensing.com)
with SendGrid or AWS SES instead of Gmail to avoid spam filters.

---

## Troubleshooting

### "SMTP connection failed"
- Check `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` in `.env`
- Gmail: make sure you're using an App Password, not your regular password
- System will automatically fall back to DRY RUN mode

### "Apollo API key not set — using mock data"
- This is fine for testing! Mock data lets you test the full pipeline
- Add your Apollo key when ready for production

### "Google Sheets init failed"
- Check that your service account email has Editor access on the sheet
- Make sure `GOOGLE_PRIVATE_KEY` has actual newlines (replace `\n` with real newlines in .env)

### Emails going to spam
- Use a dedicated outreach domain (not Gmail)
- Warm up the domain first (start with 20/day, increase slowly)
- Set SPF, DKIM, DMARC DNS records for your domain
- Reduce `OUTREACH_DAILY_EMAIL_LIMIT` and increase `OUTREACH_DELAY_BETWEEN_EMAILS_MS`

### Rate limit errors from Apollo
- Apollo free tier: 50 requests/hour
- Add `sleep` between requests or upgrade your plan

### Node.js version error
```bash
node --version   # Must be 18+
nvm install 20   # If using nvm
nvm use 20
```

---

## Important Legal Notes

- **CAN-SPAM compliance**: Every email includes an unsubscribe link. Honor all unsubscribe requests immediately.
- **GDPR**: If targeting EU companies, ensure your outreach complies with GDPR. Consider adding explicit consent mechanisms.
- **Scraping**: The scraper only accesses publicly available data and identifies itself via User-Agent. Always check a site's `robots.txt`.
- **Data retention**: Regularly purge personal data you no longer need from `data/*.json`.

---

*Built with ❤️ by Trinity Agents for Keli Sensing*
*Powered by ChatGPT (OpenAI) — For questions, contact Trinity Agents*
