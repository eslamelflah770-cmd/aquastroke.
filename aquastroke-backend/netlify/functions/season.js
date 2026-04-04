// netlify/functions/season.js — GET and PATCH season config
"use strict";

const { supabaseAdmin, requireAuth, writeAuditLog } = require("../../lib/supabase");
const { ok, error, handleError, handleOptions, parseBody, getIP } = require("../../lib/api");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions();

  try {
    const { coach, academy } = await requireAuth(event);
    const method = event.httpMethod;

    // ── GET /season ───────────────────────────────────────────────
    if (method === "GET") {
      const { data: season, error: seasonErr } = await supabaseAdmin
        .from("seasons")
        .select("*")
        .eq("academy_id", academy.id)
        .eq("is_active", true)
        .single();

      if (seasonErr || !season) {
        // Return defaults if no season exists
        return ok({
          current_week:  1,
          current_phase: "GPP",
          label:         "2025/2026",
          volume_gpp:    null,
          volume_spp1:   null,
          volume_spp2:   null,
          volume_comp:   null,
          volume_taper:  null,
          start_date:    null,
        });
      }

      return ok(season);
    }

    // ── PATCH /season ─────────────────────────────────────────────
    if (method === "PATCH") {
      if (!["ADMIN", "HEAD_COACH"].includes(coach.role)) {
        throw { status: 403, message: "Only HEAD_COACH or ADMIN can modify the season plan" };
      }

      const body = parseBody(event);

      const updates = {};
      const allowed = [
        "current_week", "current_phase", "label", "start_date",
        "volume_gpp", "volume_spp1", "volume_spp2", "volume_comp", "volume_taper",
      ];

      allowed.forEach(field => {
        if (body[field] !== undefined) updates[field] = body[field];
      });

      // Validate phase
      const validPhases = ["GPP", "SPP1", "SPP2", "COMP", "TAPER", "CHAMP"];
      if (updates.current_phase && !validPhases.includes(updates.current_phase)) {
        throw { status: 400, message: `current_phase must be one of: ${validPhases.join(", ")}` };
      }

      // Validate week
      if (updates.current_week && (updates.current_week < 1 || updates.current_week > 36)) {
        throw { status: 400, message: "current_week must be between 1 and 36" };
      }

      if (Object.keys(updates).length === 0) {
        throw { status: 400, message: "No valid fields provided" };
      }

      // Upsert season
      const { data: existingSeason } = await supabaseAdmin
        .from("seasons")
        .select("id")
        .eq("academy_id", academy.id)
        .eq("is_active", true)
        .single();

      let season;

      if (existingSeason) {
        const { data, error: updateErr } = await supabaseAdmin
          .from("seasons")
          .update(updates)
          .eq("id", existingSeason.id)
          .select()
          .single();
        if (updateErr) throw { status: 500, message: updateErr.message };
        season = data;
      } else {
        const { data, error: insertErr } = await supabaseAdmin
          .from("seasons")
          .insert({
            academy_id:    academy.id,
            current_week:  1,
            current_phase: "GPP",
            start_date:    new Date().toISOString().split("T")[0],
            ...updates,
          })
          .select()
          .single();
        if (insertErr) throw { status: 500, message: insertErr.message };
        season = data;
      }

      writeAuditLog({
        academyId: academy.id, coachId: coach.id,
        action: "SEASON_UPDATE", entityType: "season", entityId: season.id,
        after: updates, ip: getIP(event),
      });

      return ok(season);
    }

    return error(405, "Method not allowed");

  } catch (e) {
    return handleError(e);
  }
};
