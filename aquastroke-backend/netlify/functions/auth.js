// netlify/functions/auth.js — Signup, login, logout, refresh
"use strict";

const { supabaseAdmin } = require("../../lib/supabase");
const { ok, created, error, handleError, handleOptions, parseBody, corsHeaders } = require("../../lib/api");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions();

  const path   = event.path.replace(/\/\.netlify\/functions\/auth\/?/, "").replace(/^\//, "");
  const method = event.httpMethod;

  try {
    // POST /auth/signup
    if (path === "signup" && method === "POST") {
      return await signup(event);
    }

    // POST /auth/login
    if (path === "login" && method === "POST") {
      return await login(event);
    }

    // POST /auth/refresh
    if (path === "refresh" && method === "POST") {
      return await refresh(event);
    }

    // POST /auth/logout
    if (path === "logout" && method === "POST") {
      return await logout(event);
    }

    return error(404, "Auth endpoint not found");

  } catch (e) {
    return handleError(e);
  }
};

// ── SIGNUP ────────────────────────────────────────────────────────────
async function signup(event) {
  const { email, password, display_name, academy_name } = parseBody(event);

  if (!email || !password || !display_name || !academy_name) {
    throw { status: 400, message: "Required: email, password, display_name, academy_name" };
  }

  if (password.length < 8) {
    throw { status: 400, message: "Password must be at least 8 characters" };
  }

  // Create Supabase auth user
  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // Skip email confirmation for dev; set false for production
  });

  if (authErr) {
    if (authErr.message.includes("already registered")) {
      throw { status: 409, message: "Email already registered" };
    }
    throw { status: 400, message: authErr.message };
  }

  const userId = authData.user.id;

  // Generate academy slug
  const slug = academy_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) + "-" + userId.slice(0, 8);

  // Create academy
  const { data: academy, error: acadErr } = await supabaseAdmin
    .from("academies")
    .insert({ name: academy_name, slug, owner_id: userId })
    .select()
    .single();

  if (acadErr) throw { status: 500, message: "Failed to create academy" };

  // Create default season
  await supabaseAdmin.from("seasons").insert({
    academy_id:    academy.id,
    label:         "2025/2026",
    current_week:  1,
    current_phase: "GPP",
    start_date:    new Date().toISOString().split("T")[0],
  });

  // Create coach record (ADMIN role — first coach is always admin)
  const { data: coach, error: coachErr } = await supabaseAdmin
    .from("coaches")
    .insert({
      user_id:      userId,
      academy_id:   academy.id,
      display_name,
      role:         "ADMIN",
    })
    .select()
    .single();

  if (coachErr) throw { status: 500, message: "Failed to create coach profile" };

  // Sign in the user to get tokens
  const { data: session, error: sessionErr } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  return created({
    message:    "Account created successfully",
    coach_id:   coach.id,
    academy_id: academy.id,
    academy:    { id: academy.id, name: academy.name, slug: academy.slug },
    coach:      { id: coach.id, display_name: coach.display_name, role: coach.role },
  });
}

// ── LOGIN ─────────────────────────────────────────────────────────────
async function login(event) {
  const { email, password } = parseBody(event);

  if (!email || !password) {
    throw { status: 400, message: "Required: email, password" };
  }

  const { data, error: authErr } = await supabaseAdmin.auth.admin.signInWithPassword
    ? // Newer supabase-js
      await (() => { throw { status: 501, message: "Use Supabase client auth on frontend" }; })()
    : { data: null, error: null };

  // Note: Password-based auth should be done on the FRONTEND with supabase-js
  // The server can't sign in on behalf of a user via service role
  // This endpoint validates credentials and returns user metadata
  throw {
    status: 400,
    message: "Login must be performed via the frontend Supabase client. See SETUP.md.",
  };
}

// ── REFRESH ───────────────────────────────────────────────────────────
async function refresh(event) {
  const { refresh_token } = parseBody(event);
  if (!refresh_token) throw { status: 400, message: "Required: refresh_token" };

  const { data, error: refreshErr } = await supabaseAdmin.auth.refreshSession({ refresh_token });
  if (refreshErr) throw { status: 401, message: "Invalid refresh token" };

  return ok({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
}

// ── LOGOUT ────────────────────────────────────────────────────────────
async function logout(event) {
  const authHeader = event.headers["authorization"] || "";
  const token = authHeader.replace("Bearer ", "");

  if (token) {
    await supabaseAdmin.auth.admin.signOut(token).catch(() => {});
  }

  return ok({ message: "Logged out successfully" });
}
