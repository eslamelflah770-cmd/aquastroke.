"use strict";
const { supabaseAdmin, requireAuth } = require("../../lib/supabase");
const { ok, error, handleError, handleOptions } = require("../../lib/api");
const { analyzeSquad } = require("../../lib/adapt-engine");
exports.handler = async (event) => {
  if (event.httpMethod==="OPTIONS") return handleOptions();
  try {
    const { coach, academy } = await requireAuth(event);
    const rawPath = event.path.replace(/.*\/squad/,"").replace(/^\//,"");
    const action = rawPath.split("/")[0];
    const method = event.httpMethod;
    const { data:season } = await supabaseAdmin.from("seasons").select("*").eq("academy_id",academy.id).eq("is_active",true).single();
    const currentWeek = season?.current_week||1, currentPhase = season?.current_phase||"GPP";

    async function fetchAthletes() {
      const { data:athletes } = await supabaseAdmin.from("athletes").select("*,trial_results(*)").eq("academy_id",academy.id).eq("is_active",true);
      if (!athletes?.length) return [];
      return athletes.filter(a=>a.trial_results?.length>0).map(a => {
        const trialMap = {};
        a.trial_results.forEach(t => { trialMap[`t${t.trial_number}`]={actual:t.actual_time,date:t.trial_date,rpe:t.rpe,context:t.context,strokeRate:t.stroke_rate,css:t.css_at_trial,notes:t.notes}; });
        return { id:a.id, name:a.name, event:a.event, category:a.category, targets:{t1:a.target_t1,t2:a.target_t2,t3:a.target_t3}, results:trialMap, attendance:{planned:a.attendance_planned,attended:a.attendance_attended} };
      });
    }

    if (action==="analysis" && method==="GET") {
      const athletes = await fetchAthletes();
      if (!athletes.length) return ok({currentPhase,currentWeek,totalAthletes:0,analyzed:0,flaggedAthletes:[],onTrackAthletes:[],taperCandidates:[],squadPhaseRecommendation:"No athletes with trial results yet.",individualReports:[]});
      return ok(analyzeSquad(athletes,currentWeek,currentPhase));
    }

    if (action==="adapt" && method==="POST") {
      if (!["ADMIN","HEAD_COACH"].includes(coach.role)) throw {status:403,message:"Only HEAD_COACH or ADMIN can run Auto-Adapt"};
      const athletes = await fetchAthletes();
      if (!athletes.length) return ok({adapted:0,message:"No athletes with trial results found."});
      const report = analyzeSquad(athletes,currentWeek,currentPhase);
      const upserts = report.individualReports.filter(r=>r.trial&&r.athlete).map(r => {
        const match = athletes.find(a=>a.name===r.athlete.name);
        return match ? {athlete_id:match.id,academy_id:academy.id,trial_number:r.trial.number,season_week:currentWeek,season_phase:currentPhase,prescription:r} : null;
      }).filter(Boolean);
      if (upserts.length) await supabaseAdmin.from("adapt_prescriptions").upsert(upserts,{onConflict:"athlete_id,trial_number,season_week"});
      return ok({adapted:upserts.length,squadReport:{averageGap:report.squadAverageGap,phaseRecommendation:report.squadPhaseRecommendation}});
    }

    if (action==="export" && method==="GET") {
      const { data:athletes } = await supabaseAdmin.from("athletes").select("*,trial_results(*)").eq("academy_id",academy.id).eq("is_active",true);
      const rows = [["Name","Event","Category","DOB","T1 Target","T1 Actual","T1 Gap%","T1 RPE","T2 Target","T2 Actual","T2 Gap%","T2 RPE","T3 Target","T3 Actual","T3 Gap%","T3 RPE","Notes"]];
      (athletes||[]).forEach(a => {
        const tm = {}; (a.trial_results||[]).forEach(t=>{tm[t.trial_number]=t;});
        const g = n => { const t=a[`target_t${n}`],r=tm[n]; return r&&t?((r.actual_time-t)/t*100).toFixed(1)+"%":""; };
        rows.push([a.name,a.event,a.category,a.dob||"",a.target_t1||"",tm[1]?.actual_time||"",g(1),tm[1]?.rpe||"",a.target_t2||"",tm[2]?.actual_time||"",g(2),tm[2]?.rpe||"",a.target_t3||"",tm[3]?.actual_time||"",g(3),tm[3]?.rpe||"",a.notes||""]);
      });
      const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
      return { statusCode:200, headers:{"Content-Type":"text/csv;charset=utf-8","Content-Disposition":`attachment;filename="AQUASTROKE_${new Date().toISOString().split("T")[0]}.csv"`,"Access-Control-Allow-Origin":process.env.APP_URL||"*"}, body:"\uFEFF"+csv };
    }

    return error(404,"Squad endpoint not found");
  } catch(e) { return handleError(e); }
};
