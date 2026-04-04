"use strict";
const { createClient } = require("@supabase/supabase-js");
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken:false, persistSession:false }
});
async function requireAuth(req) {
  const authHeader = req.headers["authorization"] || req.headers["Authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) throw { status:401, message:"Missing authorization token" };
  const { data:{ user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) throw { status:401, message:"Invalid or expired token" };
  const { data:coach, error:coachErr } = await supabaseAdmin.from("coaches").select("id,academy_id,display_name,role,phone").eq("user_id",user.id).single();
  if (coachErr || !coach) throw { status:403, message:"No coach profile found for this user" };
  const { data:academy } = await supabaseAdmin.from("academies").select("id,name,plan,athlete_quota,settings").eq("id",coach.academy_id).single();
  return { user, coach, academy };
}
async function writeAuditLog({ academyId, coachId, action, entityType, entityId, before, after, ip }) {
  try {
    await supabaseAdmin.from("audit_log").insert({ academy_id:academyId, coach_id:coachId, action, entity_type:entityType, entity_id:entityId||null, before_value:before||null, after_value:after||null, ip_address:ip||null });
  } catch(e) { console.error("Audit log:", e.message); }
}
module.exports = { supabaseAdmin, requireAuth, writeAuditLog };
