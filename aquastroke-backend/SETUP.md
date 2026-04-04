# AQUASTROKE — Full-Stack Deployment Guide
## Netlify + Supabase (Free Tier)

---

## What You're Deploying

```
Frontend     → Netlify CDN (static HTML/JS)
Backend API  → Netlify Functions (serverless Node.js)
Database     → Supabase PostgreSQL
Auth         → Supabase Auth (JWT)
File Storage → Supabase Storage (S3-compatible)
WhatsApp Bot → Meta Cloud API + Anthropic (optional)
```

**Estimated setup time: 30 minutes**
**Monthly cost: $0 (all free tiers)**

---

## Step 1 — Set Up Supabase (10 min)

### 1.1 Create Project
1. Go to **supabase.com** → Sign up / Log in
2. Click **"New Project"** → Choose a name → Set a strong DB password
3. Wait ~2 minutes for the project to initialize

### 1.2 Run Database Migrations
1. Go to **SQL Editor** → **New Query**
2. Paste contents of `db/migrations/001_init.sql` → Click **Run**
3. New query → Paste `db/migrations/002_rls.sql` → Click **Run**

### 1.3 Create Storage Bucket
1. Go to **Storage** in the sidebar
2. Click **"New Bucket"**
   - Name: `athlete-files`
   - Public: **OFF** (private bucket)
3. Click Create

### 1.4 Get Your Keys
1. Go to **Project Settings** → **API**
2. Copy these two values:
   - **Project URL** → e.g. `https://abcxyz.supabase.co`
   - **anon public** key → starts with `eyJhbGci...`
3. Also copy the **service_role** key (⚠️ keep this SECRET — backend only)

---

## Step 2 — Configure the App (5 min)

### 2.1 Add Supabase Keys to Frontend
Open `public/index.html` and find these lines near the top:
```javascript
const SUPABASE_URL  = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY  = 'YOUR_SUPABASE_ANON_KEY';
```
Replace with your actual values:
```javascript
const SUPABASE_URL  = 'https://abcxyz.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

### 2.2 Prepare Environment Variables
Create a file called `.env` in the project root (this is for local testing only):
```
SUPABASE_URL=https://abcxyz.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...SERVICE_KEY...
APP_URL=https://your-site.netlify.app
```

---

## Step 3 — Deploy to Netlify (5 min)

### Option A: Drag & Drop (Quickest)
1. Go to **app.netlify.com**
2. Drag the entire project folder onto the page
3. Wait for deploy → you get a URL like `https://amazing-app-123.netlify.app`

### Option B: Connect Git (Recommended for Updates)
1. Push this project to a GitHub repository
2. Go to **app.netlify.com** → **Add new site** → **Import from Git**
3. Select your repository
4. Build settings:
   - **Build command:** *(leave empty)*
   - **Publish directory:** `public`
   - **Functions directory:** `netlify/functions`
5. Click **Deploy**

### Step 3.1 — Add Environment Variables in Netlify
After deploying, go to:
**Site settings** → **Environment variables** → **Add variable**

Add each of these:

| Key | Value |
|-----|-------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Your Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key (**SECRET**) |
| `APP_URL` | Your Netlify site URL (e.g. `https://aquastroke.netlify.app`) |

**Trigger a new deploy after adding env vars:**
Deploys → Trigger deploy → Deploy site

---

## Step 4 — Test It (2 min)

1. Open your Netlify URL
2. Click **Sign In** → Enter any email + password → Click **Continue →**
3. If Supabase is configured: you'll be redirected to the dashboard
4. Add an athlete → it saves to the database ✓
5. Add a trial result → prescription is generated server-side ✓
6. Reload the page → data is still there ✓

---

## Step 5 — WhatsApp Bot (Optional, 15 min)

### 5.1 Meta Business Setup
1. Go to **developers.facebook.com** → Create App → Business
2. Add **WhatsApp** product → Go to API Setup
3. Copy:
   - **Phone Number ID**
   - **Access Token** (temporary — generate a permanent one for production)
4. Set webhook URL: `https://your-site.netlify.app/.netlify/functions/whatsapp`
5. Set **Verify Token** to any secret string

### 5.2 Add WhatsApp Environment Variables in Netlify

| Key | Value |
|-----|-------|
| `META_VERIFY_TOKEN` | Your chosen secret string |
| `META_ACCESS_TOKEN` | From Meta App Dashboard |
| `META_PHONE_NUMBER_ID` | From Meta App Dashboard |
| `ANTHROPIC_API_KEY` | From console.anthropic.com |

### 5.3 Register Coach Phone Numbers
In the AQUASTROKE dashboard → **Settings**:
- Add your WhatsApp phone number (with country code, no +)
- Example: `97312345678` for Bahrain

Now WhatsApp the bot — it will have LIVE data about your athletes.

---

## File Structure

```
aquastroke/
├── public/                  ← Frontend (served by Netlify CDN)
│   ├── index.html           ← Main app
│   ├── adapt-engine.js      ← Browser copy (UI preview only)
│   └── api-client.js        ← API bridge (NEW)
├── netlify/
│   └── functions/           ← Backend API (serverless)
│       ├── auth.js          ← Auth endpoints
│       ├── athletes.js      ← Athletes CRUD
│       ├── trials.js        ← Trial results + ingestion pipeline
│       ├── season.js        ← Season config
│       ├── squad.js         ← Squad analysis + Auto-Adapt + export
│       ├── files.js         ← File upload/download
│       ├── notifications.js ← Notifications
│       └── whatsapp.js      ← WhatsApp bot (live DB)
├── lib/                     ← Shared server modules
│   ├── adapt-engine.js      ← Server copy (authoritative)
│   ├── supabase.js          ← Supabase client + auth helpers
│   ├── api.js               ← Response helpers + CORS
│   └── trial-pipeline.js    ← Trial ingestion pipeline
├── db/
│   └── migrations/
│       ├── 001_init.sql     ← All 10 tables
│       └── 002_rls.sql      ← Row Level Security policies
├── netlify.toml             ← Netlify config + URL rewrites
└── package.json             ← Dependencies
```

---

## API Endpoints Reference

All endpoints are at `/api/*` (rewritten by Netlify to `/.netlify/functions/*`).
All require `Authorization: Bearer <JWT>` except OPTIONS preflight.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/athletes` | List all athletes |
| POST | `/api/athletes` | Create athlete |
| GET | `/api/athletes/:id` | Get athlete + trials + prescription |
| PATCH | `/api/athletes/:id` | Update athlete |
| DELETE | `/api/athletes/:id` | Soft delete athlete |
| GET | `/api/athletes/:id/prescription` | Get latest prescription |
| POST | `/api/athletes/:id/prescription/regenerate` | Force regenerate |
| GET | `/api/trials` | List all trial results |
| POST | `/api/trials` | Record trial (runs full pipeline) |
| GET | `/api/trials/:id` | Get single trial |
| PATCH | `/api/trials/:id` | Update trial + recompute |
| DELETE | `/api/trials/:id` | Delete trial |
| GET | `/api/season` | Get season config |
| PATCH | `/api/season` | Update season config |
| GET | `/api/squad/analysis` | Full squad analysis |
| POST | `/api/squad/adapt` | Run Auto-Adapt (all athletes) |
| GET | `/api/squad/export` | Download CSV |
| POST | `/api/files/upload` | Get pre-signed S3 upload URL |
| GET | `/api/files/:id/download` | Get signed download URL |
| DELETE | `/api/files/:id` | Delete file |
| GET | `/api/notifications` | List notifications |
| PATCH | `/api/notifications/:id` | Mark read |
| POST | `/api/notifications/read-all` | Mark all read |
| GET/POST | `/api/whatsapp` | WhatsApp webhook |

---

## Upgrade Path

When you're ready to scale beyond free tier:

| Need | Solution | Cost |
|------|----------|------|
| More than 5 athletes | Upgrade to COACH plan (future) or raise `athlete_quota` in DB | $0 (DB change) |
| More DB storage | Supabase Pro | $25/mo |
| More file storage | Supabase Pro includes 100GB | Included in Pro |
| Redis caching | Add Upstash Redis env vars | Free up to 10K/day |
| Custom domain | Netlify → Domain settings | Free on Netlify |
| Email alerts | Add Resend API key | Free up to 100/day |

---

## Troubleshooting

**"Missing authorization token"** — User is not logged in. Click Sign In first.

**"No coach profile found"** — Supabase user was created but coach record wasn't. Run signup flow again or insert manually into `coaches` table.

**"Bucket not found"** — Create `athlete-files` bucket in Supabase Storage.

**"No active season found"** — Insert a season record or trigger a PATCH /api/season.

**WhatsApp bot not responding** — Check that the webhook URL is correct and META_VERIFY_TOKEN matches.

**Functions not found** — Ensure Netlify has `functions = "netlify/functions"` in netlify.toml and functions are deployed.
