// netlify/functions/notifications.js — Read and dismiss notifications
"use strict";

const { supabaseAdmin, requireAuth } = require("../../lib/supabase");
const { ok, noContent, error, handleError, handleOptions, parseBody } = require("../../lib/api");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions();

  try {
    const { coach, academy } = await requireAuth(event);

    const rawPath       = event.path.replace(/.*\/notifications/, "").replace(/^\//, "");
    const notificationId = rawPath.split("/")[0] || null;
    const action         = rawPath.split("/")[1] || null;
    const method         = event.httpMethod;

    // ── LIST notifications: GET /notifications ────────────────────
    if (!notificationId && method === "GET") {
      const { unread_only } = event.queryStringParameters || {};

      let query = supabaseAdmin
        .from("notifications")
        .select("*")
        .eq("academy_id", academy.id)
        .eq("coach_id", coach.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (unread_only === "true") query = query.eq("is_read", false);

      const { data: notifications, error: listErr } = await query;
      if (listErr) throw { status: 500, message: listErr.message };

      const unreadCount = notifications.filter(n => !n.is_read).length;

      return ok(notifications, { unread_count: unreadCount });
    }

    // ── MARK ALL READ: POST /notifications/read-all ───────────────
    if (rawPath === "read-all" && method === "POST") {
      await supabaseAdmin
        .from("notifications")
        .update({ is_read: true })
        .eq("coach_id", coach.id)
        .eq("is_read", false);

      return ok({ message: "All notifications marked as read" });
    }

    // ── MARK READ: PATCH /notifications/:id ───────────────────────
    if (notificationId && method === "PATCH") {
      const body = parseBody(event);

      await supabaseAdmin
        .from("notifications")
        .update({ is_read: body.is_read !== false })
        .eq("id", notificationId)
        .eq("coach_id", coach.id);

      return ok({ id: notificationId, is_read: body.is_read !== false });
    }

    // ── DELETE notification: DELETE /notifications/:id ────────────
    if (notificationId && method === "DELETE") {
      await supabaseAdmin
        .from("notifications")
        .delete()
        .eq("id", notificationId)
        .eq("coach_id", coach.id);

      return noContent();
    }

    return error(404, "Notifications endpoint not found");

  } catch (e) {
    return handleError(e);
  }
};
