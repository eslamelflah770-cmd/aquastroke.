// lib/trial-pipeline.js — Server-side trial ingestion and computation
"use strict";

const { generateAdaptation, calculateFatigueIndex } = require("./adapt-engine");
const { supabaseAdmin, writeAuditLog } = require("./supabase");

/**
 * Full trial ingestion pipeline:
 * 1. Validate athlete ownership
 * 2. Compute gap_percent and fatigue_index
 * 3. Persist trial_result
 * 4. Regenerate adapt prescription
 * 5. Check for alerts (overreach, taper)
 * 6. Create notifications if needed
 * 7. Write audit log
 *
 * @returns { trial, prescription, notifications[] }
 */
async function ingestTrial({ athleteId, academyId, coachId, trialData, season }) {
  // ── 1. Fetch athlete with targets ────────────────────────────────
  const { data: athlete, error: athErr } = await supabaseAdmin
    .from("athletes")
    .select("*")
    .eq("id", athleteId)
    .eq("academy_id", academyId)
    .single();

  if (athErr || !athlete) throw { status: 404, message: "Athlete not found" };

  // ── 2. Compute gap_percent ────────────────────────────────────────
  const targetKey   = `target_t${trialData.trial_number}`;
  const targetValue = athlete[targetKey];

  let gapPercent = null;
  if (targetValue && trialData.actual_time) {
    gapPercent = parseFloat(
      ((trialData.actual_time - targetValue) / targetValue * 100).toFixed(2)
    );
  }

  // ── 3. Compute fatigue_index ──────────────────────────────────────
  const attendancePercent = athlete.attendance_planned > 0
    ? Math.round((athlete.attendance_attended / athlete.attendance_planned) * 100)
    : 100;

  let fatigueIndex = null;
  if (trialData.rpe) {
    fatigueIndex = calculateFatigueIndex({
      gapPercent:        gapPercent ?? 0,
      rpe:               trialData.rpe,
      attendancePercent,
      context:           trialData.context || "Normal",
    });
  }

  // ── 4. Upsert trial_result ────────────────────────────────────────
  const trialRow = {
    athlete_id:    athleteId,
    academy_id:    academyId,
    trial_number:  trialData.trial_number,
    actual_time:   trialData.actual_time,
    trial_date:    trialData.trial_date || new Date().toISOString().split("T")[0],
    rpe:           trialData.rpe         || null,
    context:       trialData.context     || "Normal",
    stroke_rate:   trialData.stroke_rate || null,
    css_at_trial:  trialData.css_at_trial || null,
    notes:         trialData.notes       || null,
    gap_percent:   gapPercent,
    fatigue_index: fatigueIndex,
    created_by:    coachId,
  };

  const { data: trial, error: trialErr } = await supabaseAdmin
    .from("trial_results")
    .upsert(trialRow, { onConflict: "athlete_id,trial_number" })
    .select()
    .single();

  if (trialErr) throw { status: 500, message: `Trial save failed: ${trialErr.message}` };

  // ── 5. Build athlete shape for adapt engine ───────────────────────
  // Adapt engine expects the frontend athlete shape
  const athleteForEngine = buildAthleteShape(athlete, trial, trialData.trial_number);

  // ── 6. Run adapt engine server-side ──────────────────────────────
  let prescription = null;
  try {
    prescription = generateAdaptation(
      athleteForEngine,
      season.current_week,
      season.current_phase,
      trialData.trial_number
    );
  } catch (e) {
    console.error("Adapt engine error:", e);
  }

  // ── 7. Persist prescription ───────────────────────────────────────
  if (prescription && !prescription.error) {
    await supabaseAdmin
      .from("adapt_prescriptions")
      .upsert({
        athlete_id:   athleteId,
        academy_id:   academyId,
        trial_number: trialData.trial_number,
        season_week:  season.current_week,
        season_phase: season.current_phase,
        prescription: prescription,
      }, { onConflict: "athlete_id,trial_number,season_week" });
  }

  // ── 8. Check alerts and create notifications ──────────────────────
  const newNotifications = [];

  if (prescription) {
    // Overreach alert
    if (prescription.readiness?.state === "OVERREACHED") {
      const notif = await createNotification({
        academyId, coachId, athleteId,
        type:  "OVERREACH_ALERT",
        title: `⚠️ Overreach Alert — ${athlete.name}`,
        body:  `Fatigue index ${fatigueIndex}/100. ${prescription.readiness.action}`,
      });
      newNotifications.push(notif);
    }

    // Taper signal
    if (prescription.taperSignal?.signal === true) {
      const notif = await createNotification({
        academyId, coachId, athleteId,
        type:  "TAPER_SIGNAL",
        title: `🏁 Taper Signal — ${athlete.name}`,
        body:  prescription.taperSignal.recommendation,
      });
      newNotifications.push(notif);
    }
  }

  // ── 9. Audit log ─────────────────────────────────────────────────
  writeAuditLog({
    academyId, coachId,
    action:     "TRIAL_UPSERT",
    entityType: "trial_result",
    entityId:   trial.id,
    after:      trialRow,
  });

  return { trial, prescription, notifications: newNotifications };
}

/**
 * Build the athlete shape the adapt engine expects from DB rows
 */
function buildAthleteShape(athlete, latestTrial, trialNumber) {
  const results = {};

  // We only have the one trial here — engine only needs the relevant one
  const trialKey = `t${trialNumber}`;
  results[trialKey] = {
    actual:      latestTrial.actual_time,
    date:        latestTrial.trial_date,
    rpe:         latestTrial.rpe,
    context:     latestTrial.context,
    strokeRate:  latestTrial.stroke_rate,
    css:         latestTrial.css_at_trial,
    notes:       latestTrial.notes,
  };

  return {
    id:       athlete.id,
    name:     athlete.name,
    event:    athlete.event,
    category: athlete.category,
    targets: {
      t1: athlete.target_t1,
      t2: athlete.target_t2,
      t3: athlete.target_t3,
    },
    results,
    attendance: {
      planned:  athlete.attendance_planned,
      attended: athlete.attendance_attended,
    },
  };
}

/**
 * Create notification in DB
 */
async function createNotification({ academyId, coachId, athleteId, type, title, body }) {
  const { data } = await supabaseAdmin
    .from("notifications")
    .insert({ academy_id: academyId, coach_id: coachId, athlete_id: athleteId, type, title, body })
    .select()
    .single();
  return data;
}

/**
 * Get latest prescription for an athlete
 */
async function getLatestPrescription(athleteId) {
  const { data } = await supabaseAdmin
    .from("adapt_prescriptions")
    .select("*")
    .eq("athlete_id", athleteId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  return data;
}

module.exports = { ingestTrial, buildAthleteShape, getLatestPrescription };
