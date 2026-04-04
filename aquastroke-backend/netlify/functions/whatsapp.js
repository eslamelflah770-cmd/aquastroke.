// netlify/functions/whatsapp.js — WhatsApp Bot with live DB context
// Stack: Meta Cloud API + Anthropic Claude + Supabase (live data)
"use strict";

const https     = require("https");
const { supabaseAdmin } = require("../../lib/supabase");
const { analyzeSquad }  = require("../../lib/adapt-engine");

// ── ENV VARIABLES (set in Netlify dashboard → Environment variables) ──
// ANTHROPIC_API_KEY      → from console.anthropic.com
// META_VERIFY_TOKEN      → any secret string you choose
// META_ACCESS_TOKEN      → Meta App Dashboard → WhatsApp → API Setup
// META_PHONE_NUMBER_ID   → Meta App Dashboard → WhatsApp → API Setup

exports.handler = async (event) => {

  // ── STEP 1: Webhook Verification (Meta GET on first setup) ────────
  if (event.httpMethod === "GET") {
    const params    = event.queryStringParameters || {};
    const mode      = params["hub.mode"];
    const token     = params["hub.verify_token"];
    const challenge = params["hub.challenge"];

    if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
      console.log("✅ WhatsApp webhook verified");
      return { statusCode: 200, body: challenge };
    }
    return { statusCode: 403, body: "Forbidden" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // ── STEP 2: Receive Message ───────────────────────────────────────
  let body;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch {
    return { statusCode: 200, body: "ok" }; // Always return 200 to Meta
  }

  // Verify Meta webhook signature (HMAC-SHA256)
  // In production: validate X-Hub-Signature-256 header
  // For now we check Meta's object structure
  if (!body?.object || !body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
    return { statusCode: 200, body: "ok" };
  }

  const message     = body.entry[0].changes[0].value.messages[0];
  const from        = message.from; // Coach's WhatsApp phone number
  const messageText = message.text?.body;

  if (!messageText) return { statusCode: 200, body: "ok" };

  console.log(`📨 WhatsApp from ${from}: ${messageText}`);

  try {
    // ── STEP 3: Find coach by phone number ──────────────────────────
    const { data: coach } = await supabaseAdmin
      .from("coaches")
      .select("id, academy_id, display_name, role")
      .eq("phone", from)
      .single();

    // ── STEP 4: Build live context from DB ───────────────────────────
    const systemPrompt = coach
      ? await buildLiveSystemPrompt(coach)
      : buildStaticSystemPrompt();

    // ── STEP 5: Retrieve conversation history ────────────────────────
    // Simple in-memory store keyed by phone number (resets on cold start)
    // For persistence: store in Supabase notifications or a conversations table
    if (!global._whatsappConversations) global._whatsappConversations = {};
    const history = global._whatsappConversations[from] || [];

    history.push({ role: "user", content: messageText });
    if (history.length > 20) history.splice(0, history.length - 20);

    // ── STEP 6: Call Claude API ──────────────────────────────────────
    const reply = await callClaude(systemPrompt, history);

    history.push({ role: "assistant", content: reply });
    global._whatsappConversations[from] = history;

    // ── STEP 7: Send reply via Meta API ─────────────────────────────
    await sendWhatsAppMessage(from, reply);

    // ── STEP 8: Check for trial recording intent ─────────────────────
    // If message contains a time (e.g. "Ahmed swam 58.3"), flag for structured input
    // This is handled conversationally by Claude — no separate parsing needed

    return { statusCode: 200, body: "ok" };

  } catch (err) {
    console.error("❌ WhatsApp handler error:", err.message);
    // Don't fail — return 200 to prevent Meta from retrying
    return { statusCode: 200, body: "ok" };
  }
};

// ── BUILD LIVE SYSTEM PROMPT ────────────────────────────────────────
async function buildLiveSystemPrompt(coach) {

  // Fetch season
  const { data: season } = await supabaseAdmin
    .from("seasons")
    .select("current_week, current_phase, label")
    .eq("academy_id", coach.academy_id)
    .eq("is_active", true)
    .single();

  const currentWeek  = season?.current_week  || 1;
  const currentPhase = season?.current_phase || "GPP";

  // Fetch all active athletes with trial results
  const { data: athletes } = await supabaseAdmin
    .from("athletes")
    .select(`
      id, name, event, category, target_t1, target_t2, target_t3,
      attendance_planned, attendance_attended,
      trial_results (trial_number, actual_time, gap_percent, fatigue_index, rpe, context, trial_date)
    `)
    .eq("academy_id", coach.academy_id)
    .eq("is_active", true);

  // Unread notifications (alerts)
  const { data: alerts } = await supabaseAdmin
    .from("notifications")
    .select("type, title, body")
    .eq("coach_id", coach.id)
    .eq("is_read", false)
    .order("created_at", { ascending: false })
    .limit(5);

  // Build athlete summaries for prompt
  const athleteSummaries = (athletes || []).map(a => {
    const trials = a.trial_results || [];
    const latestTrial = trials.sort((x, y) => y.trial_number - x.trial_number)[0];
    const trialInfo = latestTrial
      ? `T${latestTrial.trial_number}: ${latestTrial.actual_time}s (gap: ${latestTrial.gap_percent > 0 ? "+" : ""}${latestTrial.gap_percent ?? "N/A"}%, RPE: ${latestTrial.rpe ?? "N/A"}, fatigue: ${latestTrial.fatigue_index ?? "N/A"})`
      : "No trials recorded";
    return `• ${a.name} | ${a.event} | ${a.category} | ${trialInfo}`;
  }).join("\n");

  // Squad analysis
  let squadSummary = "";
  try {
    const athleteShapes = (athletes || []).filter(a => a.trial_results?.length > 0).map(a => {
      const trialMap = {};
      a.trial_results.forEach(t => {
        trialMap[`t${t.trial_number}`] = { actual: t.actual_time, rpe: t.rpe, context: t.context };
      });
      return {
        id: a.id, name: a.name, event: a.event, category: a.category,
        targets: { t1: a.target_t1, t2: a.target_t2, t3: a.target_t3 },
        results: trialMap,
        attendance: { planned: a.attendance_planned, attended: a.attendance_attended },
      };
    });

    if (athleteShapes.length > 0) {
      const report = analyzeSquad(athleteShapes, currentWeek, currentPhase);
      const flaggedNames = report.flaggedAthletes.map(f => `${f.name} (+${f.gap?.toFixed(1)}%)`).join(", ");
      const taperNames   = report.taperCandidates.map(t => t.name).join(", ");
      squadSummary = `\nSQUAD SUMMARY:
- Average gap: ${report.squadAverageGap > 0 ? "+" : ""}${report.squadAverageGap}%
- Flagged (needs attention): ${flaggedNames || "None"}
- Taper candidates: ${taperNames || "None"}
- Recommendation: ${report.squadPhaseRecommendation}`;
    }
  } catch (e) {
    squadSummary = "\n(Squad analysis unavailable)";
  }

  const alertsText = (alerts || []).length > 0
    ? "\nACTIVE ALERTS:\n" + alerts.map(a => `⚠️ ${a.title}: ${a.body}`).join("\n")
    : "";

  return `You are AQUASTROKE Coach Assistant — a professional swim coaching AI with LIVE access to the academy database.

COACH: ${coach.display_name} (${coach.role})
SEASON: ${season?.label || "2025/2026"} | Week ${currentWeek}/36 | Phase: ${currentPhase}
${alertsText}

ATHLETES (${(athletes || []).length} active):
${athleteSummaries || "No athletes yet"}
${squadSummary}

YOUR CAPABILITIES:
1. SESSION DETAILS — Give full session info for any day this week
2. TRIAL RESULTS — When coach gives athlete name + time, note it and explain implications
3. ATHLETE STATUS — Look up any athlete's gap, fatigue, readiness state from the data above
4. SQUAD OVERVIEW — Summarize who needs attention, who is on track, taper candidates
5. PRESCRIPTIONS — Explain adaptation recommendations for any athlete
6. PLAN GUIDANCE — Advise on volume/intensity changes based on results

IMPORTANT: You have REAL-TIME data. Do not say you "don't have access" — you do.

When a coach says "Ahmed swam 58.3s in T1", ALWAYS:
1. Calculate gap vs target (target_t1 for Ahmed)
2. Explain whether it's positive or negative
3. Summarize the coaching implication in 2-3 lines

RESPONSE FORMAT (WhatsApp — keep SHORT):
- Max 5 lines per response
- Use emojis sparingly: ✅ ⚠️ 🔴 🎯 📋
- Numbers and facts only — no vague statements
- End with a clear next action when relevant

LANGUAGE: Always respond in the same language the coach writes in.
Arabic → reply in Arabic. English → reply in English.

If asked something outside coaching scope, say: "Outside my scope. Ask about sessions, trials, or athlete status."`;
}

// ── STATIC FALLBACK PROMPT (no coach account found) ─────────────────
function buildStaticSystemPrompt() {
  return `You are AQUASTROKE Coach Assistant. Your phone number is not registered in AQUASTROKE.

To get live coaching data, ask your head coach to add your phone number in Settings.

I can answer general questions about swim training, periodization, and the Maglischo methodology.

Keep responses under 5 lines.`;
}

// ── CALL CLAUDE API ──────────────────────────────────────────────────
async function callClaude(systemPrompt, messages) {
  const payload = JSON.stringify({
    model:      "claude-sonnet-4-20250514",
    max_tokens: 400,
    system:     systemPrompt,
    messages,
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.anthropic.com",
      path:     "/v1/messages",
      method:   "POST",
      headers: {
        "Content-Type":       "application/json",
        "x-api-key":          process.env.ANTHROPIC_API_KEY,
        "anthropic-version":  "2023-06-01",
        "Content-Length":     Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.content?.[0]?.text || "Sorry, I couldn't process that.");
        } catch {
          reject(new Error("Claude API parse error"));
        }
      });
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ── SEND WHATSAPP MESSAGE ────────────────────────────────────────────
async function sendWhatsAppMessage(to, text) {
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const accessToken   = process.env.META_ACCESS_TOKEN;

  const payload = JSON.stringify({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "graph.facebook.com",
      path:     `/v19.0/${phoneNumberId}/messages`,
      method:   "POST",
      headers: {
        "Authorization":  `Bearer ${accessToken}`,
        "Content-Type":   "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        const resp = JSON.parse(data);
        if (!resp.messages) console.error("Meta send error:", data);
        else console.log(`✅ WhatsApp sent to ${to}`);
        resolve(resp);
      });
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}
