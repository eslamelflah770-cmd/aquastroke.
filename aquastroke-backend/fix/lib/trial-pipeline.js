"use strict";
const { generateAdaptation, calculateFatigueIndex } = require("./adapt-engine");
const { supabaseAdmin, writeAuditLog } = require("./supabase");

async function ingestTrial({ athleteId, academyId, coachId, trialData, season }) {
  const { data:athlete, error:athErr } = await supabaseAdmin.from("athletes").select("*").eq("id",athleteId).eq("academy_id",academyId).single();
  if (athErr||!athlete) throw { status:404, message:"Athlete not found" };

  const targetValue = athlete[`target_t${trialData.trial_number}`];
  const gapPercent = targetValue && trialData.actual_time
    ? parseFloat(((trialData.actual_time - targetValue) / targetValue * 100).toFixed(2))
    : null;

  const attendancePercent = athlete.attendance_planned > 0
    ? Math.round((athlete.attendance_attended / athlete.attendance_planned) * 100) : 100;

  const fatigueIndex = trialData.rpe ? calculateFatigueIndex({
    gapPercent: gapPercent??0, rpe:trialData.rpe, attendancePercent, context:trialData.context||"Normal"
  }) : null;

  const trialRow = {
    athlete_id:athleteId, academy_id:academyId,
    trial_number:trialData.trial_number, actual_time:trialData.actual_time,
    trial_date:trialData.trial_date||new Date().toISOString().split("T")[0],
    rpe:trialData.rpe||null, context:trialData.context||"Normal",
    stroke_rate:trialData.stroke_rate||null, css_at_trial:trialData.css_at_trial||null,
    notes:trialData.notes||null, gap_percent:gapPercent, fatigue_index:fatigueIndex,
    created_by:coachId,
  };

  const { data:trial, error:trialErr } = await supabaseAdmin.from("trial_results")
    .upsert(trialRow,{onConflict:"athlete_id,trial_number"}).select().single();
  if (trialErr) throw { status:500, message:`Trial save failed: ${trialErr.message}` };

  const results = {};
  results[`t${trialData.trial_number}`] = { actual:trial.actual_time, date:trial.trial_date, rpe:trial.rpe, context:trial.context, strokeRate:trial.stroke_rate, css:trial.css_at_trial, notes:trial.notes };
  const athleteForEngine = { id:athlete.id, name:athlete.name, event:athlete.event, category:athlete.category,
    targets:{t1:athlete.target_t1,t2:athlete.target_t2,t3:athlete.target_t3}, results,
    attendance:{planned:athlete.attendance_planned,attended:athlete.attendance_attended} };

  let prescription = null;
  try {
    prescription = generateAdaptation(athleteForEngine, season.current_week, season.current_phase, trialData.trial_number);
  } catch(e) { console.error("Adapt engine:", e); }

  if (prescription && !prescription.error) {
    await supabaseAdmin.from("adapt_prescriptions").upsert({
      athlete_id:athleteId, academy_id:academyId,
      trial_number:trialData.trial_number, season_week:season.current_week,
      season_phase:season.current_phase, prescription
    },{onConflict:"athlete_id,trial_number,season_week"});
  }

  const notifications = [];
  if (prescription?.readiness?.state==="OVERREACHED") {
    const { data:notif } = await supabaseAdmin.from("notifications").insert({
      academy_id:academyId, coach_id:coachId, athlete_id:athleteId,
      type:"OVERREACH_ALERT", title:`⚠️ Overreach — ${athlete.name}`, body:`Fatigue ${fatigueIndex}/100`
    }).select().single();
    if (notif) notifications.push(notif);
  }

  writeAuditLog({ academyId, coachId, action:"TRIAL_UPSERT", entityType:"trial_result", entityId:trial.id, after:trialRow });
  return { trial, prescription, notifications };
}

function buildAthleteShape(athlete, latestTrial, trialNumber) {
  const results = {};
  results[`t${trialNumber}`] = { actual:latestTrial.actual_time, date:latestTrial.trial_date, rpe:latestTrial.rpe, context:latestTrial.context, strokeRate:latestTrial.stroke_rate, css:latestTrial.css_at_trial, notes:latestTrial.notes };
  return { id:athlete.id, name:athlete.name, event:athlete.event, category:athlete.category,
    targets:{t1:athlete.target_t1,t2:athlete.target_t2,t3:athlete.target_t3}, results,
    attendance:{planned:athlete.attendance_planned,attended:athlete.attendance_attended} };
}

module.exports = { ingestTrial, buildAthleteShape };
