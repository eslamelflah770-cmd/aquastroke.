// lib/supabase.js — Supabase client (service role for server functions)
"use strict";

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL          = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY     = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("AQUASTROKE: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
}

/**
 * Service role client — bypasses RLS.
 * ONLY for server-side functions. Never expose to browser.
 */
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Anon client — respects RLS. Used when we want to act as a specific user.
 * Pass the user's JWT to get a scoped client.
 */
function supabaseForUser(accessToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Extract JWT from Authorization header
 */
function extractToken(req) {
  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

/**
 * Verify JWT and return user + coach metadata
 * Returns { user, coach, academy } or throws error
 */
async function requireAuth(req) {
  const token = extractToken(req);
  if (!token) throw { status: 401, message: "Missing authorization token" };

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) throw { status: 401, message: "Invalid or expired token" };

  // Fetch coach record with academy
  const { data: coach, error: coachErr } = await supabaseAdmin
    .from("coaches")
    .select("id, academy_id, display_name, role, phone")
    .eq("user_id", user.id)
    .single();

  if (coachErr || !coach) throw { status: 403, message: "No coach profile found for this user" };

  // Fetch academy
  const { data: academy } = await supabaseAdmin
    .from("academies")
    .select("id, name, plan, athlete_quota, settings")
    .eq("id", coach.academy_id)
    .single();

  return { user, coach, academy };
}

/**
 * Write to audit log (fire-and-forget — never block on this)
 */
async function writeAuditLog({ academyId, coachId, action, entityType, entityId, before, after, ip }) {
  try {
    await supabaseAdmin.from("audit_log").insert({
      academy_id:   academyId,
      coach_id:     coachId,
      action,
      entity_type:  entityType,
      entity_id:    entityId   || null,
      before_value: before     || null,
      after_value:  after      || null,
      ip_address:   ip         || null,
    });
  } catch (e) {
    console.error("Audit log write failed:", e.message);
  }
}

module.exports = {
  supabaseAdmin,
  supabaseForUser,
  extractToken,
  requireAuth,
  writeAuditLog,
};
