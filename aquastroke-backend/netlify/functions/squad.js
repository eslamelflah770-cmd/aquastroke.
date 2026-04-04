// netlify/functions/squad.js — Squad analysis, auto-adapt, export
"use strict";

const { supabaseAdmin, requireAuth } = require("../../lib/supabase");
const { ok, error, handleError, handleOptions } = require("../../lib/api");
const { analyzeSquad, generateAdaptation } = require("../../lib/adapt-engine");
const { buildAthleteShape } = require("../../lib/trial-pipeline");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions();

  try {
    const { coach, academy } = await requireAuth(event);

    const rawPath = event.path.replace(/.*\/squad/, "").replace(/^\//, "");
    const action  = rawPath.split("/")[0];
    const method  = event.httpMethod;

    // ── Fetch season (shared by all squad operations) ─────────────
    const { data: season } = await supabaseAdmin
      .from("seasons")
      .select("*")
      .eq("academy_id", academy.id)
      .eq("is_active", true)
      .single();

    const currentWeek  = season?.current_week  || 1;
    const currentPhase = season?.current_phase || "GPP";

    // ── GET /squad/analysis ───────────────────────────────────────
    if (action === "analysis" && method === "GET") {
      const athletes = await fetchAthletesForEngine(academy.id);

      if (!athletes.length) {
        return ok({
          currentPhase, currentWeek,
          totalAthletes: 0, analyzed: 0,
          flaggedAthletes: [], onTrackAthletes: [], taperCandidates: [],
          squadPhaseRecommendation: "No athletes with trial results yet.",
          individualReports: [],
        });
      }

      const report = analyzeSquad(athletes, currentWeek, currentPhase);
      return ok(report);
    }

    // ── POST /squad/adapt ─────────────────────────────────────────
    if (action === "adapt" && method === "POST") {
      if (!["ADMIN", "HEAD_COACH"].includes(coach.role)) {
        throw { status: 403, message: "Only HEAD_COACH or ADMIN can run Auto-Adapt" };
      }

      const athletes = await fetchAthletesForEngine(academy.id);

      if (!athletes.length) {
        return ok({ adapted: 0, message: "No athletes with trial results found." });
      }

      const report   = analyzeSquad(athletes, currentWeek, currentPhase);
      const upserts  = [];
      const adapted  = [];

      for (const athleteReport of report.individualReports) {
        if (!athleteReport.trial || !athleteReport.athlete) continue;

        // Find athlete ID from name match
        const matchingAthlete = athletes.find(a => a.name === athleteReport.athlete.name);
        if (!matchingAthlete) continue;

        upserts.push({
          athlete_id:   matchingAthlete.id,
          academy_id:   academy.id,
          trial_number: athleteReport.trial.number,
          season_week:  currentWeek,
          season_phase: currentPhase,
          prescription: athleteReport,
          engine_version: "3.0",
        });

        adapted.push({
          name:     athleteReport.athlete.name,
          severity: athleteReport.loadPrescription?.severity,
          urgency:  athleteReport.loadPrescription?.urgency,
        });
      }

      if (upserts.length > 0) {
        await supabaseAdmin
          .from("adapt_prescriptions")
          .upsert(upserts, { onConflict: "athlete_id,trial_number,season_week" });
      }

      return ok({
        adapted:    adapted.length,
        summary:    adapted,
        squadReport: {
          averageGap:             report.squadAverageGap,
          phaseRecommendation:    report.squadPhaseRecommendation,
          flaggedCount:           report.flaggedAthletes.length,
          taperCandidatesCount:   report.taperCandidates.length,
        },
      });
    }

    // ── GET /squad/export ─────────────────────────────────────────
    if (action === "export" && method === "GET") {
      const { data: athletes, error: athErr } = await supabaseAdmin
        .from("athletes")
        .select(`*, trial_results(*)`)
        .eq("academy_id", academy.id)
        .eq("is_active", true);

      if (athErr) throw { status: 500, message: athErr.message };

      const format = (event.queryStringParameters || {}).format || "csv";

      if (format === "csv") {
        const rows = [
          ["Name", "Event", "Category", "DOB",
           "T1 Target", "T1 Actual", "T1 Gap%", "T1 RPE", "T1 Date",
           "T2 Target", "T2 Actual", "T2 Gap%", "T2 RPE", "T2 Date",
           "T3 Target", "T3 Actual", "T3 Gap%", "T3 RPE", "T3 Date",
           "Attendance %", "Notes"],
        ];

        athletes.forEach(a => {
          const trialMap = {};
          (a.trial_results || []).forEach(t => { trialMap[t.trial_number] = t; });

          const g = (n) => {
            const t = a[`target_t${n}`];
            const r = trialMap[n];
            if (!r || !t) return "";
            return ((r.actual_time - t) / t * 100).toFixed(1) + "%";
          };

          const attendPct = a.attendance_planned > 0
            ? Math.round((a.attendance_attended / a.attendance_planned) * 100) + "%"
            : "N/A";

          rows.push([
            a.name, a.event, a.category, a.dob || "",
            a.target_t1 || "", trialMap[1]?.actual_time || "", g(1), trialMap[1]?.rpe || "", trialMap[1]?.trial_date || "",
            a.target_t2 || "", trialMap[2]?.actual_time || "", g(2), trialMap[2]?.rpe || "", trialMap[2]?.trial_date || "",
            a.target_t3 || "", trialMap[3]?.actual_time || "", g(3), trialMap[3]?.rpe || "", trialMap[3]?.trial_date || "",
            attendPct,
            a.notes || "",
          ]);
        });

        const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
        const filename = `AQUASTROKE_${academy.name.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`;

        return {
          statusCode: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Access-Control-Allow-Origin": process.env.APP_URL || "*",
          },
          body: "\uFEFF" + csv, // BOM for Excel UTF-8 compatibility
        };
      }

      // JSON export
      return ok({ athletes, season, exported_at: new Date().toISOString() });
    }

    return error(404, "Squad endpoint not found");

  } catch (e) {
    return handleError(e);
  }
};

// ── Helper: fetch athletes in adapt-engine shape ─────────────────────
async function fetchAthletesForEngine(academyId) {
  const { data: athletes } = await supabaseAdmin
    .from("athletes")
    .select(`*, trial_results(*)`)
    .eq("academy_id", academyId)
    .eq("is_active", true);

  if (!athletes?.length) return [];

  // Transform to adapt engine shape
  return athletes
    .filter(a => a.trial_results?.length > 0)
    .map(a => {
      const trialMap = {};
      a.trial_results.forEach(t => {
        trialMap[`t${t.trial_number}`] = {
          actual:     t.actual_time,
          date:       t.trial_date,
          rpe:        t.rpe,
          context:    t.context,
          strokeRate: t.stroke_rate,
          css:        t.css_at_trial,
          notes:      t.notes,
        };
      });

      return {
        id:       a.id,
        name:     a.name,
        event:    a.event,
        category: a.category,
        targets: { t1: a.target_t1, t2: a.target_t2, t3: a.target_t3 },
        results:  trialMap,
        attendance: { planned: a.attendance_planned, attended: a.attendance_attended },
      };
    });
}
