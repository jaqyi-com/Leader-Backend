# Leader AI — Deployment Guide

## Architecture

```
┌─────────────────────────┐     ┌──────────────────────────┐
│  Vercel (Frontend)       │────▶│  Vercel (Backend API)    │
│  framework: vite         │     │  @vercel/node            │
│  /frontend               │     │  /src/server.js          │
└─────────────────────────┘     └──────────┬───────────────┘
                                            │
                              ┌─────────────┼──────────────┐
                              ▼             ▼              ▼
                        MongoDB Atlas   Upstash Redis   OpenAI API
```

---

## Prerequisites

| Service | Purpose | Free tier? |
|---------|---------|------------|
| [Vercel](https://vercel.com) | Host backend + frontend | ✅ Yes |
| [MongoDB Atlas](https://cloud.mongodb.com) | Database | ✅ Yes (512MB) |
| [Upstash Redis](https://upstash.com) | Cache | ✅ Yes (10K req/day) |
| [OpenAI](https://platform.openai.com) | GPT-4o + Embeddings | 💳 Pay-per-use |
| [Apollo.io](https://apollo.io) | Lead enrichment | Freemium |
| [Google Cloud](https://console.cloud.google.com) | OAuth + Places API | Freemium |

---

## Step 1 — Deploy the Backend (API)

### Via Vercel CLI
```bash
# Install Vercel CLI
npm i -g vercel

# From the project root
cd /path/to/LeadGenerator
vercel --prod
```

### Via Vercel Dashboard
1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repo
3. Set **Root Directory** to `.` (the project root)
4. Framework: **Other**
5. Build command: leave empty (Node.js, no build needed)
6. Output directory: leave empty
7. Add all environment variables (see below)

### Required Environment Variables (Backend)
Set these in Vercel → Project → Settings → Environment Variables:

```
OPENAI_API_KEY          = sk-proj-...
OPENAI_MODEL            = gpt-4o
APOLLO_API_KEY          = ...
SMTP_HOST               = smtp.gmail.com
SMTP_PORT               = 587
SMTP_SECURE             = false
SMTP_USER               = your@email.com
SMTP_PASS               = your-app-password
SMTP_FROM_NAME          = Leader
SMTP_FROM_EMAIL         = your@email.com
MONGO_URI               = mongodb+srv://...
UPSTASH_REDIS_REST_URL  = https://...upstash.io
UPSTASH_REDIS_REST_TOKEN= ...
JWT_SECRET              = <generate: openssl rand -hex 32>
JWT_EXPIRES_IN          = 7d
GOOGLE_CLIENT_ID        = ...
GOOGLE_CLIENT_SECRET    = ...
GOOGLE_REDIRECT_URI     = https://<your-backend>.vercel.app/api/auth/google/callback
FRONTEND_URL            = https://<your-frontend>.vercel.app
GOOGLE_API_KEY          = ...
UNIFIED_API_KEY         = ...
UNIFIED_WORKSPACE_ID    = ...
UNIFIED_WORKSPACE_SECRET= ...
UNIFIED_BASE_URL        = https://api.unified.to
NODE_ENV                = production
```

---

## Step 2 — Deploy the Frontend

### Via Vercel CLI
```bash
cd /path/to/LeadGenerator/frontend
vercel --prod
```

### Via Vercel Dashboard
1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the same repo
3. Set **Root Directory** to `frontend`
4. Framework: **Vite** (auto-detected)
5. Build command: `npm run build`
6. Output directory: `dist`
7. Add environment variables:

```
VITE_API_URL            = https://<your-backend>.vercel.app/api
VITE_CRAWLER_API_URL    = https://<your-backend>.vercel.app/api/crawler
```

> **Important**: After deploying the frontend, copy its URL and set it as `FRONTEND_URL` in the **backend** project's environment variables. Then redeploy the backend.

---

## Step 3 — Configure Google OAuth (Production)

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Edit your OAuth 2.0 Client
3. Add to **Authorised redirect URIs**:
   ```
   https://<your-backend>.vercel.app/api/auth/google/callback
   ```
4. Add to **Authorised JavaScript origins**:
   ```
   https://<your-frontend>.vercel.app
   ```

---

## Step 4 — MongoDB Atlas Setup

1. Create a free cluster at [cloud.mongodb.com](https://cloud.mongodb.com)
2. Create a database user with Read/Write access
3. Add Vercel's IP range to the Atlas IP Allowlist (or use `0.0.0.0/0` for simplicity)
4. Copy the connection string as `MONGO_URI`

The app auto-creates these collections on first run:
- `companies`, `contacts`, `outreachlogs`, `responses`, `leadscores`
- `autonomousleads`, `places`, `websites`, `socialposts`
- `users`, `organizations`, `members`
- `chatknowledgechunks`, `chatknowledgesources`, `chatconversations`, `chatmessages`

---

## Step 5 — Verify Deployment

```bash
# Check backend health
curl https://<your-backend>.vercel.app/

# Should return:
# {"name":"Leader API","status":"online","version":"1.0.0"}

# Check chatbot routes are protected
curl https://<your-backend>.vercel.app/api/chatbot/conversations
# Should return: {"error":"Authentication required. Please log in."}
```

---

## Local Development

```bash
# Clone & install
git clone <repo>
cd LeadGenerator
npm install
cd frontend && npm install && cd ..

# Copy env
cp .env.example .env
# Fill in your .env values

# Start both servers
bash start.sh

# Backend: http://localhost:3001
# Frontend: http://localhost:5174
```

---

## Build Output Summary

| Chunk | Size (gzip) | Description |
|-------|------------|-------------|
| `vendor-react` | 56 KB | React + Router |
| `vendor-motion` | 43 KB | Framer Motion |
| `vendor-icons` | 7 KB | Lucide React |
| `vendor-markdown` | 35 KB | react-markdown |
| `vendor-charts` | 108 KB | Recharts |
| `vendor-export` | 233 KB | jsPDF + xlsx |
| `index` (app) | **89 KB** | All app pages |
| Total initial load | ~230 KB gzip | Excellent |

---

## Notes

- **Chatbot SSE streaming**: The backend `vercel.json` sets `maxDuration: 60s` for the serverless function. Vercel Pro supports up to 300s; free tier is 10s. For long AI responses, consider upgrading to Vercel Pro or using a persistent server (Railway, Render).
- **RAG embeddings**: `text-embedding-3-small` at ~$0.02/1M tokens. Org knowledge is embedded once on upload; queries use cosine similarity in-memory (no extra cost per query).
- **PDF parsing** (`pdf-parse`): Fully supported in production. File size limit: 20MB.
