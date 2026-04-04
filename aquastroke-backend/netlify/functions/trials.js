// netlify/functions/trials.js — Record and manage trial results
"use strict";

const { supabaseAdmin, requireAuth, writeAuditLog } = require("../../lib/supabase");
const { ok, created, noContent, error, handleError, handleOptions, parseBody, getIP } = require("../../lib/api");
const { ingestTrial } = require("../../lib/trial-pipeline");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions();

  try {
    const { coach, academy } = await requireAuth(event);

    const rawPath   = event.path.replace(/.*\/trials/, "").replace(/^\//, "");
    const trialId   = rawPath.split("/")[0] || null;
    const method    = event.httpMethod;

    // ── LIST trials: GET /trials ──────────────────────────────────
    if (!trialId && method === "GET") {
      const { athlete_id, trial_number, phase } = event.queryStringParameters || {};

      let query = supabaseAdmin
        .from("trial_results")
        .select(`
          *,
          athletes (id, name, event, category, target_t1, target_t2, target_t3)
        `)
        .eq("academy_id", academy.id)
        .order("created_at", { ascending: false });

      if (athlete_id)   query = query.eq("athlete_id", athlete_id);
      if (trial_number) query = query.eq("trial_number", parseInt(trial_number));

      const { data: trials, error: listErr } = await query;
      if (listErr) throw { status: 500, message: listErr.message };

      return ok(trials, { total: trials.length });
    }

    // ── CREATE trial: POST /trials ────────────────────────────────
    if (!trialId && method === "POST") {
      const body = parseBody(event);

      // Validate required fields
      if (!body.athlete_id)   throw { status: 400, message: "Required: athlete_id" };
      if (!body.trial_number) throw { status: 400, message: "Required: trial_number (1, 2, or 3)" };
      if (!body.actual_time)  throw { status: 400, message: "Required: actual_time (seconds)" };

      if (![1, 2, 3].includes(parseInt(body.trial_number))) {
        throw { status: 400, message: "trial_number must be 1, 2, or 3" };
      }

      if (body.rpe && (body.rpe < 1 || body.rpe > 10)) {
        throw { status: 400, message: "rpe must be between 1 and 10" };
      }

      // Verify athlete belongs to this academy
      const { data: athlete } = await supabaseAdmin
        .from("athletes")
        .select("id")
        .eq("id", body.athlete_id)
        .eq("academy_id", academy.id)
        .single();

      if (!athlete) throw { status: 404, message: "Athlete not found in your academy" };

      // Get active season
      const { data: season } = await supabaseAdmin
        .from("seasons")
        .select("current_week, current_phase")
        .eq("academy_id", academy.id)
        .eq("is_active", true)
        .single();

      if (!season) throw { status: 404, message: "No active season found. Create a season first." };

      // Run full ingestion pipeline
      const result = await ingestTrial({
        athleteId:  body.athlete_id,
        academyId:  academy.id,
        coachId:    coach.id,
        trialData: {
          trial_number:  parseInt(body.trial_number),
          actual_time:   parseFloat(body.actual_time),
          trial_date:    body.trial_date    || null,
          rpe:           body.rpe           ? parseInt(body.rpe) : null,
          context:       body.context       || "Normal",
          stroke_rate:   body.stroke_rate   ? parseFloat(body.stroke_rate) : null,
          css_at_trial:  body.css_at_trial  ? parseFloat(body.css_at_trial) : null,
          notes:         body.notes         || null,
        },
        season,
      });

      return created(result);
    }

    // ── GET single trial: GET /trials/:id ─────────────────────────
    if (trialId && method === "GET") {
      const { data: trial, error: getErr } = await supabaseAdmin
        .from("trial_results")
        .select(`
          *,
          athletes (id, name, event, category, target_t1, target_t2, target_t3, attendance_planned, attendance_attended),
          adapt_prescriptions (prescription, season_phase, season_week, engine_version)
        `)
        .eq("id", trialId)
        .eq("academy_id", academy.id)
        .single();

      if (getErr || !trial) throw { status: 404, message: "Trial not found" };

      return ok(trial);
    }

    // ── UPDATE trial: PATCH /trials/:id ───────────────────────────
    if (trialId && method === "PATCH") {
      const body = parseBody(event);

      const { data: existing } = await supabaseAdmin
        .from("trial_results")
        .select("*")
        .eq("id", trialId)
        .eq("academy_id", academy.id)
        .single();

      if (!existing) throw { status: 404, message: "Trial not found" };

      // Build updates
      const trialData = {
        trial_number:  existing.trial_number,
        actual_time:   body.actual_time  !== undefined ? parseFloat(body.actual_time) : existing.actual_time,
        trial_date:    body.trial_date   !== undefined ? body.trial_date   : existing.trial_date,
        rpe:           body.rpe          !== undefined ? parseInt(body.rpe) : existing.rpe,
        context:       body.context      !== undefined ? body.context       : existing.context,
        stroke_rate:   body.stroke_rate  !== undefined ? parseFloat(body.stroke_rate) : existing.stroke_rate,
        css_at_trial:  body.css_at_trial !== undefined ? parseFloat(body.css_at_trial) : existing.css_at_trial,
        notes:         body.notes        !== undefined ? body.notes         : existing.notes,
      };

      // Get season for re-computation
      const { data: season } = await supabaseAdmin
        .from("seasons")
        .select("current_week, current_phase")
        .eq("academy_id", academy.id)
        .eq("is_active", true)
        .single();

      // Re-run pipeline to recompute gap, fatigue, prescription
      const result = await ingestTrial({
        athleteId: existing.athlete_id,
        academyId: academy.id,
        coachId:   coach.id,
        trialData,
        season:    season || { current_week: 1, current_phase: "GPP" },
      });

      writeAuditLog({
        academyId: academy.id, coachId: coach.id,
        action: "TRIAL_UPDATE", entityType: "trial_result", entityId: trialId,
        before: existing, after: trialData, ip: getIP(event),
      });

      return ok(result.trial);
    }

    // ── DELETE trial: DELETE /trials/:id ──────────────────────────
    if (trialId && method === "DELETE") {
      if (!["ADMIN", "HEAD_COACH"].includes(coach.role)) {
        throw { status: 403, message: "Only HEAD_COACH or ADMIN can delete trial results" };
      }

      const { data: existing } = await supabaseAdmin
        .from("trial_results")
        .select("*")
        .eq("id", trialId)
        .eq("academy_id", academy.id)
        .single();

      if (!existing) throw { status: 404, message: "Trial not found" };

      // Delete trial and its prescription
      await supabaseAdmin.from("adapt_prescriptions")
        .delete()
        .eq("athlete_id", existing.athlete_id)
        .eq("trial_number", existing.trial_number);

      await supabaseAdmin.from("trial_results")
        .delete()
        .eq("id", trialId)
        .eq("academy_id", academy.id);

      writeAuditLog({
        academyId: academy.id, coachId: coach.id,
        action: "TRIAL_DELETE", entityType: "trial_result", entityId: trialId,
        before: existing, ip: getIP(event),
      });

      return noContent();
    }

    return error(404, "Endpoint not found");

  } catch (e) {
    return handleError(e);
  }
};
