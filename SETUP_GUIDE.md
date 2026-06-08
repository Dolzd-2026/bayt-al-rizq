# 🏡 Bayt Al-Rizq V2 — Setup Guide
## 20 minutes. Permanent data. Multi-device sync. No env var headaches.

---

## NEW: Simpler credentials setup

Previous versions required Netlify environment variables which kept failing.
V2 has **two ways** to connect — use whichever works:

- **Method A (easiest):** Edit one file on GitHub — `public/config.js`
- **Method B (backup):** Netlify environment variables (same as before)

The app will use whichever one has valid credentials.

---

## STEP 1 — Create Supabase project (5 min)

1. Go to **https://supabase.com** → sign up free with Google
2. Click **New project** → name it `bayt-al-rizq`
3. Choose a database password (save it somewhere) → Region: **West EU (Ireland)**
4. Wait ~2 minutes for setup
5. Go to **SQL Editor → New Query**
6. Open `supabase/schema.sql` from this folder → copy ALL → paste → click **Run**
7. You should see: "Success. No rows returned"

---

## STEP 2 — Get your credentials (2 min)

In Supabase → **Settings (gear icon)** → **API**

Copy these two values — you need both:
- **Project URL** — `https://xxxxxxxxxx.supabase.co`
- **anon public key** — starts with `eyJhbGci...`

---

## STEP 3 — Deploy to Netlify (5 min)

1. Go to **https://netlify.com** → sign up free
2. **Add new site → Import from Git → GitHub**
3. Pick your `bayt-al-rizq` repository
4. Build settings (Netlify should auto-detect — if not, enter manually):
   - Build command: `npm run build`
   - Publish directory: `build`
5. Click **Deploy site** — wait 3–4 minutes

---

## STEP 4 — Connect credentials (THE IMPORTANT STEP)

### Method A — Edit config.js directly on GitHub (RECOMMENDED)

This bypasses the Netlify env var issue entirely.

1. Go to your GitHub repo → find `public/config.js`
2. Click the **pencil icon** to edit it
3. Replace the file contents with:

```javascript
window.__BRQ_CONFIG__ = {
  url: 'https://YOUR_PROJECT_ID.supabase.co',
  key: 'YOUR_ANON_KEY_HERE'
};
```

4. Replace the URL and key with your actual values from Step 2
5. Click **Commit changes** (directly to main)
6. Netlify automatically redeploys — wait 2–3 minutes
7. Open your Netlify URL — the app will load with your data ✅

### Method B — Netlify Environment Variables (backup)

If Method A doesn't work:

1. In Netlify → **Site configuration → Environment variables**
2. Add these two variables:
   - Key: `REACT_APP_SUPABASE_URL` → Value: your Project URL
   - Key: `REACT_APP_SUPABASE_ANON_KEY` → Value: your anon key
3. Go to **Deploys → Trigger deploy → Deploy site**
4. Wait 3–4 minutes and refresh

---

## STEP 5 — In-app setup wizard

If credentials aren't found, the app shows a **Setup Screen** automatically.
You can enter your Supabase URL and key directly in the app, test the connection,
and get the exact config.js code to paste — no guessing.

---

## STEP 6 — Add to iPhone home screen

1. Open your Netlify URL in **Safari** (not Chrome)
2. Tap the **Share button** (box with arrow)
3. Scroll down → **Add to Home Screen**
4. Name it **Bayt Al-Rizq** → tap **Add**

Share the URL with family/chef — they do the same on their phones.

---

## What's new in V2

- **Setup wizard built into the app** — no more guessing why it won't connect
- **config.js workaround** — edit one file instead of wrestling with Netlify env vars
- **Quick consume (−use)** — record usage with one tap, no full edit form needed
- **Restock with qty input** — enter how much you actually bought
- **Delete confirmation** — no more accidental deletes
- **"Trip done" button** — mark all items from one store as restocked in one tap
- **Overview respects store filter** — category cards show filtered counts
- **Shopping tab shows badge count** — e.g. "Shop (7)"
- **Timeline shows all items** — including those with no restock date set
- **Audit trail with filters** — filter by user, action type
- **Unique colours per new user** — visual differentiation on login screen
- **Rebuilt UI** — cleaner, more spacious, bottom tab bar, better mobile feel

---

## Costs

Both Supabase and Netlify are **free forever** for this use case.
- Supabase free: 500MB database, enough for thousands of pantry items
- Netlify free: 100GB bandwidth/month

---

## Troubleshooting

**"Setup" screen appears / not connecting**
→ Your credentials aren't in config.js yet. Follow Step 4 Method A.

**"Your anon key is wrong" message**
→ Make sure you copied the **anon public** key, not the service_role key.
→ The anon key starts with `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9`

**Data not syncing between devices**
→ In Supabase → Database → Replication → verify `brq_items` is listed under supabase_realtime

**Items showing as duplicate when running schema twice**
→ V2 schema uses `on conflict (name) do nothing` — safe to run multiple times

**Changes not saving**
→ Check the audit trail in ⚙️ Settings — if entries appear, writes are working
→ If no entries appear, the Supabase connection is broken — re-check config.js
