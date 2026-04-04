/**
 * AQUASTROKE — API Client
 * Replaces in-memory S.athletes operations with real backend API calls.
 * Drop this script BEFORE the main app JS in index.html.
 */

"use strict";

// ── CONFIG ────────────────────────────────────────────────────────────
const API_BASE = "/api";

// ── AUTH STATE ────────────────────────────────────────────────────────
let _accessToken  = null;
let _coachProfile = null;
let _academy      = null;

// ── TOKEN MANAGEMENT ─────────────────────────────────────────────────
function setSession(accessToken, coach, academy) {
  _accessToken  = accessToken;
  _coachProfile = coach;
  _academy      = academy;
  // Store in sessionStorage (cleared on browser close — more secure than localStorage)
  sessionStorage.setItem("aq_token",   accessToken);
  sessionStorage.setItem("aq_coach",   JSON.stringify(coach));
  sessionStorage.setItem("aq_academy", JSON.stringify(academy));
}

function restoreSession() {
  _accessToken  = sessionStorage.getItem("aq_token");
  _coachProfile = JSON.parse(sessionStorage.getItem("aq_coach")  || "null");
  _academy      = JSON.parse(sessionStorage.getItem("aq_academy") || "null");
  return !!_accessToken;
}

function clearSession() {
  _accessToken = _coachProfile = _academy = null;
  sessionStorage.removeItem("aq_token");
  sessionStorage.removeItem("aq_coach");
  sessionStorage.removeItem("aq_academy");
}

function getHeaders(extra = {}) {
  const h = { "Content-Type": "application/json", ...extra };
  if (_accessToken) h["Authorization"] = `Bearer ${_accessToken}`;
  return h;
}

// ── CORE FETCH WRAPPER ────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: getHeaders(options.headers),
  });

  if (res.status === 204) return null;

  const body = await res.json();

  if (!res.ok) {
    const msg = body?.title || body?.message || `API error ${res.status}`;
    throw new Error(msg);
  }

  return body.data !== undefined ? body.data : body;
}

// ── AUTH API ──────────────────────────────────────────────────────────
const Auth = {
  /**
   * Sign up with Supabase (done on frontend with Supabase client)
   * Then register academy + coach via our API
   */
  async signup({ email, password, displayName, academyName }) {
    // First create Supabase auth user (frontend)
    const { data: authData, error: authErr } = await window.supabase
      .createClient(window.AQUASTROKE_SUPABASE_URL, window.AQUASTROKE_SUPABASE_ANON_KEY)
      .auth.signUp({ email, password });
    if (authErr) throw new Error(authErr.message);

    return { user: authData.user, session: authData.session };
  },

  /**
   * Login with Supabase — get JWT — load coach/academy metadata
   */
  async login({ email, password }) {
    const client = window._supabaseClient;
    if (!client) throw new Error("Supabase not initialized");

    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);

    // Fetch coach + academy metadata via our API
    const profile = await apiFetch("/athletes", {
      method: "GET",
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    }).catch(() => null);

    // Store session
    _accessToken = data.session.access_token;
    sessionStorage.setItem("aq_token",   _accessToken);

    return { session: data.session, user: data.user };
  },

  async logout() {
    if (window._supabaseClient) {
      await window._supabaseClient.auth.signOut().catch(() => {});
    }
    clearSession();
  },
};

// ── ATHLETES API ──────────────────────────────────────────────────────
const Athletes = {
  async list() {
    return apiFetch("/athletes");
  },

  async get(id) {
    return apiFetch(`/athletes/${id}`);
  },

  async create({ name, event, category, dob, notes, targets }) {
    return apiFetch("/athletes", {
      method: "POST",
      body:   JSON.stringify({ name, event, category, dob, notes, targets }),
    });
  },

  async update(id, fields) {
    return apiFetch(`/athletes/${id}`, {
      method: "PATCH",
      body:   JSON.stringify(fields),
    });
  },

  async delete(id, permanent = false) {
    return apiFetch(`/athletes/${id}?permanent=${permanent}`, { method: "DELETE" });
  },

  async getPrescription(id) {
    return apiFetch(`/athletes/${id}/prescription`);
  },

  async regeneratePrescription(id) {
    return apiFetch(`/athletes/${id}/prescription/regenerate`, { method: "POST" });
  },
};

// ── TRIALS API ────────────────────────────────────────────────────────
const Trials = {
  async list(filters = {}) {
    const params = new URLSearchParams(filters).toString();
    return apiFetch(`/trials${params ? "?" + params : ""}`);
  },

  async create({ athleteId, trialNumber, actualTime, date, rpe, context, strokeRate, cssAtTrial, notes }) {
    return apiFetch("/trials", {
      method: "POST",
      body:   JSON.stringify({
        athlete_id:   athleteId,
        trial_number: trialNumber,
        actual_time:  actualTime,
        trial_date:   date,
        rpe, context,
        stroke_rate:  strokeRate,
        css_at_trial: cssAtTrial,
        notes,
      }),
    });
  },

  async update(id, fields) {
    return apiFetch(`/trials/${id}`, {
      method: "PATCH",
      body:   JSON.stringify(fields),
    });
  },

  async delete(id) {
    return apiFetch(`/trials/${id}`, { method: "DELETE" });
  },
};

// ── SEASON API ────────────────────────────────────────────────────────
const Season = {
  async get() {
    return apiFetch("/season");
  },

  async update(fields) {
    return apiFetch("/season", {
      method: "PATCH",
      body:   JSON.stringify(fields),
    });
  },
};

// ── SQUAD API ─────────────────────────────────────────────────────────
const Squad = {
  async analysis() {
    return apiFetch("/squad/analysis");
  },

  async adapt() {
    return apiFetch("/squad/adapt", { method: "POST" });
  },

  async export(format = "csv") {
    // Direct download
    const url    = `${API_BASE}/squad/export?format=${format}`;
    const link   = document.createElement("a");
    link.href    = url;
    link.setAttribute("download", "");
    // Add auth header via fetch blob
    const res    = await fetch(url, { headers: getHeaders() });
    if (!res.ok) throw new Error("Export failed");
    const blob   = await res.blob();
    link.href    = URL.createObjectURL(blob);
    link.download = `AQUASTROKE_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  },
};

// ── FILES API ─────────────────────────────────────────────────────────
const Files = {
  async list(athleteId = null) {
    const params = athleteId ? `?athlete_id=${athleteId}` : "";
    return apiFetch(`/files${params}`);
  },

  async upload(file, athleteId = null) {
    // Step 1: Get pre-signed upload URL
    const uploadMeta = await apiFetch("/files/upload", {
      method: "POST",
      body:   JSON.stringify({
        filename:     file.name,
        content_type: file.type || "application/octet-stream",
        size_bytes:   file.size,
        athlete_id:   athleteId,
      }),
    });

    // Step 2: Upload directly to Supabase Storage
    const uploadRes = await fetch(uploadMeta.upload_url, {
      method:  "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body:    file,
    });

    if (!uploadRes.ok) throw new Error("File upload to storage failed");

    return uploadMeta;
  },

  async getDownloadUrl(id) {
    return apiFetch(`/files/${id}/download`);
  },

  async delete(id) {
    return apiFetch(`/files/${id}`, { method: "DELETE" });
  },
};

// ── NOTIFICATIONS API ─────────────────────────────────────────────────
const Notifications = {
  async list(unreadOnly = false) {
    return apiFetch(`/notifications${unreadOnly ? "?unread_only=true" : ""}`);
  },

  async markRead(id) {
    return apiFetch(`/notifications/${id}`, {
      method: "PATCH",
      body:   JSON.stringify({ is_read: true }),
    });
  },

  async markAllRead() {
    return apiFetch("/notifications/read-all", { method: "POST" });
  },

  async delete(id) {
    return apiFetch(`/notifications/${id}`, { method: "DELETE" });
  },
};

// ── SUPABASE AUTH LISTENER ────────────────────────────────────────────
/**
 * Initialize Supabase client and listen for auth state changes.
 * Call this after Supabase CDN script loads.
 */
function initAQUASTROKEAuth(supabaseUrl, supabaseAnonKey) {
  window.AQUASTROKE_SUPABASE_URL      = supabaseUrl;
  window.AQUASTROKE_SUPABASE_ANON_KEY = supabaseAnonKey;

  if (!window.supabase || supabaseUrl === "YOUR_SUPABASE_URL") {
    console.warn("AQUASTROKE: Supabase not configured — running in demo mode (data not persisted)");
    window._backendMode = false;
    return;
  }

  window._supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

  // Listen for auth changes (login/logout/token refresh)
  window._supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session) {
      _accessToken = session.access_token;
      sessionStorage.setItem("aq_token", _accessToken);
      window._backendMode = true;
      console.log("✓ AQUASTROKE: Auth session active");
    } else if (event === "SIGNED_OUT") {
      clearSession();
      window._backendMode = false;
    } else if (event === "TOKEN_REFRESHED" && session) {
      _accessToken = session.access_token;
      sessionStorage.setItem("aq_token", _accessToken);
    }
  });

  // Restore existing session on page load
  window._supabaseClient.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      _accessToken        = session.access_token;
      window._backendMode = true;
      sessionStorage.setItem("aq_token", _accessToken);
    }
  });

  window._backendMode = true;
  console.log("✓ AQUASTROKE: Backend API mode active");
}

// ── BRIDGE FUNCTIONS ─────────────────────────────────────────────────
/**
 * These replace the original in-memory operations with API calls.
 * The frontend calls these wrappers — they call the API when connected,
 * fall back to in-memory when not (demo mode).
 */

async function apiSaveAthlete(athleteData) {
  if (!window._backendMode) return null;
  try {
    const athlete = await Athletes.create(athleteData);
    return athlete;
  } catch (e) {
    console.error("apiSaveAthlete failed:", e.message);
    return null;
  }
}

async function apiSaveResult(trialData) {
  if (!window._backendMode) return null;
  try {
    const result = await Trials.create(trialData);
    return result;
  } catch (e) {
    console.error("apiSaveResult failed:", e.message);
    return null;
  }
}

async function apiLoadDashboard() {
  if (!window._backendMode) return null;
  try {
    const [athletes, season] = await Promise.all([Athletes.list(), Season.get()]);
    return { athletes, season };
  } catch (e) {
    console.error("apiLoadDashboard failed:", e.message);
    return null;
  }
}

async function apiRunAdapt() {
  if (!window._backendMode) return null;
  try {
    return await Squad.adapt();
  } catch (e) {
    console.error("apiRunAdapt failed:", e.message);
    return null;
  }
}

// ── EXPORT ────────────────────────────────────────────────────────────
window.AQ = {
  Auth, Athletes, Trials, Season, Squad, Files, Notifications,
  initAQUASTROKEAuth, restoreSession, clearSession,
  apiSaveAthlete, apiSaveResult, apiLoadDashboard, apiRunAdapt,
  isBackendMode: () => !!window._backendMode && !!_accessToken,
};

console.log("✓ AQUASTROKE API client loaded");
