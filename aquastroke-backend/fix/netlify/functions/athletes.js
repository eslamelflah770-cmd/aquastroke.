"use strict";
const { supabaseAdmin, requireAuth, writeAuditLog } = require("../../lib/supabase");
const { ok, created, noContent, error, handleError, handleOptions, parseBody, getIP } = require("../../lib/api");
exports.handler = async (event) => {
  if (event.httpMethod==="OPTIONS") return handleOptions();
  try {
    const { coach, academy } = await requireAuth(event);
    const rawPath = event.path.replace(/.*\/athletes/,"").replace(/^\//,"");
    const segs = rawPath.split("/").filter(Boolean);
    const athleteId = segs[0]||null, sub = segs[1]||null, action = segs[2]||null, method = event.httpMethod;

    if (!athleteId && method==="GET") {
      const { is_active } = event.queryStringParameters||{};
      let q = supabaseAdmin.from("athletes").select("id,name,event,category,dob,notes,is_active,target_t1,target_t2,target_t3,attendance_planned,attendance_attended,added_date,trial_results(id,trial_number,actual_time,gap_percent,fatigue_index,rpe,context,trial_date)").eq("academy_id",academy.id).order("name",{ascending:true});
      if (is_active!==undefined) q=q.eq("is_active",is_active!=="false"); else q=q.eq("is_active",true);
      const { data:athletes, error:e } = await q;
      if (e) throw {status:500,message:e.message};
      return ok(athletes,{total:athletes.length,plan:academy.plan,quota:academy.athlete_quota});
    }

    if (!athleteId && method==="POST") {
      const { count } = await supabaseAdmin.from("athletes").select("id",{count:"exact",head:true}).eq("academy_id",academy.id).eq("is_active",true);
      if (academy.plan==="FREE" && count>=academy.athlete_quota) throw {status:403,message:`Free plan limit: ${academy.athlete_quota} athletes.`};
      const body = parseBody(event);
      if (!body.name||!body.event) throw {status:400,message:"Required: name, event"};
      const { data:athlete, error:e } = await supabaseAdmin.from("athletes").insert({
        academy_id:academy.id, coach_id:coach.id, name:body.name.trim(), event:body.event,
        category:body.category||"Middle", dob:body.dob||null, notes:body.notes||null,
        target_t1:body.targets?.t1||null, target_t2:body.targets?.t2||null, target_t3:body.targets?.t3||null,
        added_date:new Date().toISOString().split("T")[0]
      }).select().single();
      if (e) throw {status:500,message:e.message};
      writeAuditLog({academyId:academy.id,coachId:coach.id,action:"ATHLETE_CREATE",entityType:"athlete",entityId:athlete.id,after:athlete,ip:getIP(event)});
      return created(athlete);
    }

    if (!athleteId) return error(404,"Not found");

    if (!sub && method==="GET") {
      const { data:athlete, error:e } = await supabaseAdmin.from("athletes").select("*,trial_results(*),adapt_prescriptions(id,trial_number,season_week,season_phase,prescription,engine_version,created_at)").eq("id",athleteId).eq("academy_id",academy.id).single();
      if (e||!athlete) throw {status:404,message:"Athlete not found"};
      return ok(athlete);
    }

    if (!sub && method==="PATCH") {
      const body = parseBody(event);
      const updates = {};
      if (body.name!==undefined) updates.name=body.name.trim();
      if (body.event!==undefined) updates.event=body.event;
      if (body.category!==undefined) updates.category=body.category;
      if (body.dob!==undefined) updates.dob=body.dob;
      if (body.notes!==undefined) updates.notes=body.notes;
      if (body.targets) { if(body.targets.t1!==undefined)updates.target_t1=body.targets.t1; if(body.targets.t2!==undefined)updates.target_t2=body.targets.t2; if(body.targets.t3!==undefined)updates.target_t3=body.targets.t3; }
      if (body.attendance) { if(body.attendance.planned!==undefined)updates.attendance_planned=body.attendance.planned; if(body.attendance.attended!==undefined)updates.attendance_attended=body.attendance.attended; }
      if (!Object.keys(updates).length) throw {status:400,message:"No valid fields to update"};
      const { data:athlete, error:e } = await supabaseAdmin.from("athletes").update(updates).eq("id",athleteId).eq("academy_id",academy.id).select().single();
      if (e||!athlete) throw {status:404,message:"Athlete not found or update failed"};
      return ok(athlete);
    }

    if (!sub && method==="DELETE") {
      const perm = (event.queryStringParameters||{}).permanent==="true";
      if (perm && coach.role!=="ADMIN") throw {status:403,message:"Only ADMIN can permanently delete"};
      if (perm) await supabaseAdmin.from("athletes").delete().eq("id",athleteId).eq("academy_id",academy.id);
      else await supabaseAdmin.from("athletes").update({is_active:false}).eq("id",athleteId).eq("academy_id",academy.id);
      return noContent();
    }

    if (sub==="prescription" && !action && method==="GET") {
      const { data:prescription } = await supabaseAdmin.from("adapt_prescriptions").select("*").eq("athlete_id",athleteId).eq("academy_id",academy.id).order("created_at",{ascending:false}).limit(1).single();
      if (!prescription) throw {status:404,message:"No prescription found. Record a trial result first."};
      return ok(prescription);
    }

    if (sub==="prescription" && action==="regenerate" && method==="POST") {
      const { data:latestTrial } = await supabaseAdmin.from("trial_results").select("*").eq("athlete_id",athleteId).eq("academy_id",academy.id).order("trial_number",{ascending:false}).limit(1).single();
      if (!latestTrial) throw {status:404,message:"No trial results found"};
      const { data:season } = await supabaseAdmin.from("seasons").select("current_week,current_phase").eq("academy_id",academy.id).eq("is_active",true).single();
      const { generateAdaptation } = require("../../lib/adapt-engine");
      const { buildAthleteShape } = require("../../lib/trial-pipeline");
      const { data:athlete } = await supabaseAdmin.from("athletes").select("*").eq("id",athleteId).eq("academy_id",academy.id).single();
      const prescription = generateAdaptation(buildAthleteShape(athlete,latestTrial,latestTrial.trial_number), season.current_week, season.current_phase, latestTrial.trial_number);
      await supabaseAdmin.from("adapt_prescriptions").upsert({athlete_id:athleteId,academy_id:academy.id,trial_number:latestTrial.trial_number,season_week:season.current_week,season_phase:season.current_phase,prescription},{onConflict:"athlete_id,trial_number,season_week"});
      return ok({prescription,regenerated:true});
    }

    return error(404,"Endpoint not found");
  } catch(e) { return handleError(e); }
};
