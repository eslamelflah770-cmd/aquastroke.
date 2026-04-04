"use strict";
const { supabaseAdmin, requireAuth, writeAuditLog } = require("../../lib/supabase");
const { ok, error, handleError, handleOptions, parseBody, getIP } = require("../../lib/api");
exports.handler = async (event) => {
  if (event.httpMethod==="OPTIONS") return handleOptions();
  try {
    const { coach, academy } = await requireAuth(event);
    const method = event.httpMethod;
    if (method==="GET") {
      const { data:season, error:e } = await supabaseAdmin.from("seasons").select("*").eq("academy_id",academy.id).eq("is_active",true).single();
      if (e||!season) return ok({current_week:1,current_phase:"GPP",label:"2025/2026"});
      return ok(season);
    }
    if (method==="PATCH") {
      if (!["ADMIN","HEAD_COACH"].includes(coach.role)) throw {status:403,message:"Only HEAD_COACH or ADMIN can modify the season plan"};
      const body = parseBody(event);
      const updates = {};
      ["current_week","current_phase","label","start_date","volume_gpp","volume_spp1","volume_spp2","volume_comp","volume_taper"].forEach(f => { if (body[f]!==undefined) updates[f]=body[f]; });
      const validPhases = ["GPP","SPP1","SPP2","COMP","TAPER","CHAMP"];
      if (updates.current_phase && !validPhases.includes(updates.current_phase)) throw {status:400,message:"Invalid current_phase"};
      if (!Object.keys(updates).length) throw {status:400,message:"No valid fields provided"};
      const { data:existing } = await supabaseAdmin.from("seasons").select("id").eq("academy_id",academy.id).eq("is_active",true).single();
      let season;
      if (existing) {
        const { data, error:e } = await supabaseAdmin.from("seasons").update(updates).eq("id",existing.id).select().single();
        if (e) throw {status:500,message:e.message};
        season = data;
      } else {
        const { data, error:e } = await supabaseAdmin.from("seasons").insert({academy_id:academy.id,current_week:1,current_phase:"GPP",start_date:new Date().toISOString().split("T")[0],...updates}).select().single();
        if (e) throw {status:500,message:e.message};
        season = data;
      }
      return ok(season);
    }
    return error(405,"Method not allowed");
  } catch(e) { return handleError(e); }
};
