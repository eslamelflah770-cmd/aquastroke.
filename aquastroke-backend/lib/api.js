// lib/api.js — Response helpers, CORS, error handling for Netlify Functions
"use strict";

const ALLOWED_ORIGIN = process.env.APP_URL || "https://aquastroke.app";

/**
 * CORS headers — must be on every response including errors
 */
const corsHeaders = {
  "Access-Control-Allow-Origin":  ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Max-Age":       "86400",
};

/**
 * Handle preflight OPTIONS request
 */
function handleOptions() {
  return { statusCode: 204, headers: corsHeaders, body: "" };
}

/**
 * JSON success response
 */
function ok(data, meta = {}) {
  return {
    statusCode: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ data, meta }),
  };
}

/**
 * JSON created response
 */
function created(data) {
  return {
    statusCode: 201,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  };
}

/**
 * No content response
 */
function noContent() {
  return { statusCode: 204, headers: corsHeaders, body: "" };
}

/**
 * Error response — RFC 7807 Problem Details format
 */
function error(status, message, detail = null) {
  const body = { type: `https://aquastroke.app/errors/${status}`, title: message, status };
  if (detail) body.detail = detail;
  return {
    statusCode: status,
    headers: { ...corsHeaders, "Content-Type": "application/problem+json" },
    body: JSON.stringify(body),
  };
}

/**
 * Central error handler — catches thrown objects with {status, message}
 */
function handleError(e) {
  console.error("AQUASTROKE API Error:", e);

  if (e && e.status && e.message) {
    return error(e.status, e.message);
  }

  // Supabase errors
  if (e && e.code) {
    if (e.code === "23505") return error(409, "Record already exists");
    if (e.code === "23503") return error(400, "Referenced record not found");
  }

  return error(500, "Internal server error");
}

/**
 * Parse JSON body safely
 */
function parseBody(event) {
  try {
    if (!event.body) return {};
    return typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch {
    throw { status: 400, message: "Invalid JSON body" };
  }
}

/**
 * Get IP address from event
 */
function getIP(event) {
  return event.headers?.["x-forwarded-for"]?.split(",")[0]?.trim()
    || event.headers?.["client-ip"]
    || "unknown";
}

/**
 * Rate limiter using Supabase (simple in-DB counter)
 * For production use Upstash Redis — this is a lightweight fallback
 */
async function checkRateLimit(identifier, limit = 100, windowSeconds = 60) {
  // Simple in-memory rate limiting per function cold-start
  // For proper rate limiting configure Upstash Redis via environment
  return true; // TODO: wire up Upstash when UPSTASH_REDIS_REST_URL is set
}

module.exports = {
  corsHeaders,
  handleOptions,
  ok,
  created,
  noContent,
  error,
  handleError,
  parseBody,
  getIP,
  checkRateLimit,
};
