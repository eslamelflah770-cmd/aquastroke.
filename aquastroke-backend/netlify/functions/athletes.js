// netlify/functions/athletes.js — GET list, POST create, GET/:id, PATCH/:id, DELETE/:id
"use strict";

const { supabaseAdmin, requireAuth, writeAuditLog } = require("../../lib/supabase");
const { ok, created, noContent, error, handleError, handleOptions, parseBody, getIP } = require("../../lib/api");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions();

  try {
    const { coach, academy } = await requireAuth(event);

    // Parse path to extract optional athlete ID
    // Paths: /athletes, /athletes/{id}, /athletes/{id}/prescription, /athletes/{id}/prescription/regenerate
    const rawPath = event.path
      .replace(/.*\/athletes/, "")
      .replace(/^\//, "");

    const segments = rawPath.split("/").filter(Boolean);
    const athleteId    = segments[0] || null;
    const subResource  = segments[1] || null;
    const action       = segments[2] || null;
    const method       = event.httpMethod;

    // ── LIST athletes: GET /athletes ──────────────────────────────
    if (!athleteId && method === "GET") {
      const { category, is_active } = event.queryStringParameters || {};

      let query = supabaseAdmin
        .from("athletes")
        .select(`
          id, name, event, category, dob, notes, is_active,
          target_t1, target_t2, target_t3,
          attendance_planned, attendance_attended, added_date,
          trial_results (
            id, trial_number, actual_time, gap_percent, fatigue_index, rpe, context, trial_date
          )
        `)
        .eq("academy_id", academy.id)
        .order("name", { ascending: true });

      if (category) query = query.eq("category", category);
      if (is_active !== undefined) query = query.eq("is_active", is_active !== "false");
      else query = query.eq("is_active", true);

      const { data: athletes, error: listErr } = await query;
      if (listErr) throw { status: 500, message: listErr.message };

      return ok(athletes, { total: athletes.length, plan: academy.plan, quota: academy.athlete_quota });
    }

    // ── CREATE athlete: POST /athletes ────────────────────────────
    if (!athleteId && method === "POST") {
      // Check quota
      const { count } = await supabaseAdmin
        .from("athletes")
        .select("id", { count: "exact", head: true })
        .eq("academy_id", academy.id)
        .eq("is_active", true);

      if (academy.plan === "FREE" && count >= academy.athlete_quota) {
        throw { status: 403, message: `Free plan limit: ${academy.athlete_quota} athletes. Upgrade to add more.` };
      }

      const body = parseBody(event);

      if (!body.name || !body.event) {
        throw { status: 400, message: "Required: name, event" };
      }

      const { data: athlete, error: insertErr } = await supabaseAdmin
        .from("athletes")
        .insert({
          academy_id:  academy.id,
          coach_id:    coach.id,
          name:        body.name.trim(),
          event:       body.event,
          category:    body.category    || "Middle",
          dob:         body.dob         || null,
          notes:       body.notes       || null,
          target_t1:   body.targets?.t1 || null,
          target_t2:   body.targets?.t2 || null,
          target_t3:   body.targets?.t3 || null,
          added_date:  new Date().toISOString().split("T")[0],
        })
        .select()
        .single();

      if (insertErr) throw { status: 500, message: insertErr.message };

      writeAuditLog({
        academyId: academy.id, coachId: coach.id,
        action: "ATHLETE_CREATE", entityType: "athlete", entityId: athlete.id,
        after: athlete, ip: getIP(event),
      });

      return created(athlete);
    }

    // ── From here: single athlete endpoints ───────────────────────
    if (!athleteId) return error(404, "Not found");

    // ── GET /athletes/:id ─────────────────────────────────────────
    if (!subResource && method === "GET") {
      const { data: athlete, error: getErr } = await supabaseAdmin
        .from("athletes")
        .select(`
          *,
          trial_results (*),
          adapt_prescriptions (
            id, trial_number, season_week, season_phase, prescription, engine_version, created_at
          )
        `)
        .eq("id", athleteId)
        .eq("academy_id", academy.id)
        .single();

      if (getErr || !athlete) throw { status: 404, message: "Athlete not found" };

      return ok(athlete);
    }

    // ── PATCH /athletes/:id ───────────────────────────────────────
    if (!subResource && method === "PATCH") {
      const body = parseBody(event);

      const updates = {};
      if (body.name       !== undefined) updates.name       = body.name.trim();
      if (body.event      !== undefined) updates.event      = body.event;
      if (body.category   !== undefined) updates.category   = body.category;
      if (body.dob        !== undefined) updates.dob        = body.dob;
      if (body.notes      !== undefined) updates.notes      = body.notes;
      if (body.css_velocity !== undefined) updates.css_velocity = body.css_velocity;
      if (body.targets) {
        if (body.targets.t1 !== undefined) updates.target_t1 = body.targets.t1;
        if (body.targets.t2 !== undefined) updates.target_t2 = body.targets.t2;
        if (body.targets.t3 !== undefined) updates.target_t3 = body.targets.t3;
      }
      if (body.attendance) {
        if (body.attendance.planned  !== undefined) updates.attendance_planned  = body.attendance.planned;
        if (body.attendance.attended !== undefined) updates.attendance_attended = body.attendance.attended;
      }

      if (Object.keys(updates).length === 0) {
        throw { status: 400, message: "No valid fields to update" };
      }

      const { data: before } = await supabaseAdmin
        .from("athletes").select("*").eq("id", athleteId).eq("academy_id", academy.id).single();

      const { data: athlete, error: updateErr } = await supabaseAdmin
        .from("athletes")
        .update(updates)
        .eq("id", athleteId)
        .eq("academy_id", academy.id)
        .select()
        .single();

      if (updateErr || !athlete) throw { status: 404, message: "Athlete not found or update failed" };

      writeAuditLog({
        academyId: academy.id, coachId: coach.id,
        action: "ATHLETE_UPDATE", entityType: "athlete", entityId: athleteId,
        before, after: athlete, ip: getIP(event),
      });

      return ok(athlete);
    }

    // ── DELETE /athletes/:id ──────────────────────────────────────
    if (!subResource && method === "DELETE") {
      const permanent = (event.queryStringParameters || {}).permanent === "true";

      if (permanent && coach.role !== "ADMIN") {
        throw { status: 403, message: "Only ADMIN can permanently delete athletes" };
      }

      const { data: before } = await supabaseAdmin
        .from("athletes").select("*").eq("id", athleteId).eq("academy_id", academy.id).single();

      if (permanent) {
        await supabaseAdmin.from("athletes").delete().eq("id", athleteId).eq("academy_id", academy.id);
      } else {
        // Soft delete
        await supabaseAdmin.from("athletes")
          .update({ is_active: false })
          .eq("id", athleteId)
          .eq("academy_id", academy.id);
      }

      writeAuditLog({
        academyId: academy.id, coachId: coach.id,
        action: permanent ? "ATHLETE_DELETE_HARD" : "ATHLETE_DELETE_SOFT",
        entityType: "athlete", entityId: athleteId, before, ip: getIP(event),
      });

      return noContent();
    }

    // ── GET /athletes/:id/prescription ────────────────────────────
    if (subResource === "prescription" && !action && method === "GET") {
      const { data: prescription } = await supabaseAdmin
        .from("adapt_prescriptions")
        .select("*")
        .eq("athlete_id", athleteId)
        .eq("academy_id", academy.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!prescription) throw { status: 404, message: "No prescription found. Record a trial result first." };

      return ok(prescription);
    }

    // ── POST /athletes/:id/prescription/regenerate ────────────────
    if (subResource === "prescription" && action === "regenerate" && method === "POST") {
      const { ingestTrial } = require("../../lib/trial-pipeline");

      // Fetch latest trial
      const { data: latestTrial } = await supabaseAdmin
        .from("trial_results")
        .select("*")
        .eq("athlete_id", athleteId)
        .eq("academy_id", academy.id)
        .order("trial_number", { ascending: false })
        .limit(1)
        .single();

      if (!latestTrial) throw { status: 404, message: "No trial results found to regenerate from" };

      // Fetch season
      const { data: season } = await supabaseAdmin
        .from("seasons")
        .select("current_week, current_phase")
        .eq("academy_id", academy.id)
        .eq("is_active", true)
        .single();

      const { generateAdaptation } = require("../../lib/adapt-engine");
      const { buildAthleteShape }  = require("../../lib/trial-pipeline");

      const { data: athlete } = await supabaseAdmin
        .from("athletes").select("*").eq("id", athleteId).eq("academy_id", academy.id).single();

      const athleteShape = buildAthleteShape(athlete, latestTrial, latestTrial.trial_number);
      const prescription = generateAdaptation(
        athleteShape, season.current_week, season.current_phase, latestTrial.trial_number
      );

      // Store
      await supabaseAdmin.from("adapt_prescriptions").upsert({
        athlete_id:   athleteId,
        academy_id:   academy.id,
        trial_number: latestTrial.trial_number,
        season_week:  season.current_week,
        season_phase: season.current_phase,
        prescription,
      }, { onConflict: "athlete_id,trial_number,season_week" });

      return ok({ prescription, regenerated: true });
    }

    return error(404, "Endpoint not found");

  } catch (e) {
    return handleError(e);
  }
};
