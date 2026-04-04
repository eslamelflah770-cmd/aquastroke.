"use strict";
const { supabaseAdmin, requireAuth, writeAuditLog } = require("../../lib/supabase");
const { ok, created, noContent, error, handleError, handleOptions, parseBody, getIP } = require("../../lib/api");
const { ingestTrial } = require("../../lib/trial-pipeline");
exports.handler = async (event) => {
  if (event.httpMethod==="OPTIONS") return handleOptions();
  try {
    const { coach, academy } = await requireAuth(event);
    const rawPath = event.path.replace(/.*\/trials/,"").replace(/^\//,"");
    const trialId = rawPath.split("/")[0]||null;
    const method = event.httpMethod;

    if (!trialId && method==="GET") {
      const { athlete_id, trial_number } = event.queryStringParameters||{};
      let q = supabaseAdmin.from("trial_results").select("*,athletes(id,name,event,category,target_t1,target_t2,target_t3)").eq("academy_id",academy.id).order("created_at",{ascending:false});
      if (athlete_id) q=q.eq("athlete_id",athlete_id);
      if (trial_number) q=q.eq("trial_number",parseInt(trial_number));
      const { data:trials, error:e } = await q;
      if (e) throw {status:500,message:e.message};
      return ok(trials,{total:trials.length});
    }

    if (!trialId && method==="POST") {
      const body = parseBody(event);
      if (!body.athlete_id) throw {status:400,message:"Required: athlete_id"};
      if (!body.trial_number) throw {status:400,message:"Required: trial_number (1, 2, or 3)"};
      if (!body.actual_time) throw {status:400,message:"Required: actual_time"};
      if (![1,2,3].includes(parseInt(body.trial_number))) throw {status:400,message:"trial_number must be 1, 2, or 3"};
      const { data:athlete } = await supabaseAdmin.from("athletes").select("id").eq("id",body.athlete_id).eq("academy_id",academy.id).single();
      if (!athlete) throw {status:404,message:"Athlete not found in your academy"};
      const { data:season } = await supabaseAdmin.from("seasons").select("current_week,current_phase").eq("academy_id",academy.id).eq("is_active",true).single();
      if (!season) throw {status:404,message:"No active season found."};
      const result = await ingestTrial({
        athleteId:body.athlete_id, academyId:academy.id, coachId:coach.id,
        trialData:{ trial_number:parseInt(body.trial_number), actual_time:parseFloat(body.actual_time), trial_date:body.trial_date||null, rpe:body.rpe?parseInt(body.rpe):null, context:body.context||"Normal", stroke_rate:body.stroke_rate?parseFloat(body.stroke_rate):null, css_at_trial:body.css_at_trial?parseFloat(body.css_at_trial):null, notes:body.notes||null },
        season
      });
      return created(result);
    }

    if (trialId && method==="GET") {
      const { data:trial, error:e } = await supabaseAdmin.from("trial_results").select("*,athletes(id,name,event,category,target_t1,target_t2,target_t3,attendance_planned,attendance_attended)").eq("id",trialId).eq("academy_id",academy.id).single();
      if (e||!trial) throw {status:404,message:"Trial not found"};
      return ok(trial);
    }

    if (trialId && method==="DELETE") {
      if (!["ADMIN","HEAD_COACH"].includes(coach.role)) throw {status:403,message:"Only HEAD_COACH or ADMIN can delete trial results"};
      const { data:existing } = await supabaseAdmin.from("trial_results").select("*").eq("id",trialId).eq("academy_id",academy.id).single();
      if (!existing) throw {status:404,message:"Trial not found"};
      await supabaseAdmin.from("adapt_prescriptions").delete().eq("athlete_id",existing.athlete_id).eq("trial_number",existing.trial_number);
      await supabaseAdmin.from("trial_results").delete().eq("id",trialId).eq("academy_id",academy.id);
      return noContent();
    }

    return error(404,"Endpoint not found");
  } catch(e) { return handleError(e); }
};
