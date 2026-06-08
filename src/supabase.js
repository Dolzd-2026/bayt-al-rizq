import { createClient } from '@supabase/supabase-js';

// ─── SUPABASE WORKAROUND ──────────────────────────────────────────
// Netlify env vars injected at build time (REACT_APP_*) sometimes
// don't propagate if the deploy happens before they're saved.
// This file reads from BOTH build-time env AND a runtime config
// object written into public/config.js — so you can update creds
// without a full redeploy by just editing one file.
// ─────────────────────────────────────────────────────────────────

const buildUrl  = process.env.REACT_APP_SUPABASE_URL;
const buildKey  = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Runtime config fallback — set in public/config.js
const runtimeUrl  = window.__BRQ_CONFIG__?.url;
const runtimeKey  = window.__BRQ_CONFIG__?.key;

export const SUPABASE_URL = buildUrl || runtimeUrl || '';
export const SUPABASE_KEY = buildKey || runtimeKey || '';

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY &&
  !SUPABASE_URL.includes('placeholder') && SUPABASE_URL.startsWith('https://'));

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      realtime: { params: { eventsPerSecond: 10 } }
    })
  : null;
