// netlify/functions/files.js — File metadata, upload URLs, download URLs
"use strict";

const { supabaseAdmin, requireAuth, writeAuditLog } = require("../../lib/supabase");
const { ok, created, noContent, error, handleError, handleOptions, parseBody, getIP } = require("../../lib/api");

const BUCKET = "athlete-files";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions();

  try {
    const { coach, academy } = await requireAuth(event);

    const rawPath  = event.path.replace(/.*\/files/, "").replace(/^\//, "");
    const segments = rawPath.split("/").filter(Boolean);
    const fileId   = segments[0] || null;
    const action   = segments[1] || null;
    const method   = event.httpMethod;

    // ── LIST files: GET /files ────────────────────────────────────
    if (!fileId && method === "GET") {
      const { athlete_id } = event.queryStringParameters || {};

      let query = supabaseAdmin
        .from("files")
        .select("id, name, size_bytes, mime_type, file_type, athlete_id, created_at, uploaded_by")
        .eq("academy_id", academy.id)
        .order("created_at", { ascending: false });

      if (athlete_id) query = query.eq("athlete_id", athlete_id);

      const { data: files, error: listErr } = await query;
      if (listErr) throw { status: 500, message: listErr.message };

      return ok(files);
    }

    // ── REQUEST UPLOAD URL: POST /files/upload ────────────────────
    if (!fileId && action !== "upload" && rawPath === "upload" && method === "POST") {
      const body = parseBody(event);

      if (!body.filename)     throw { status: 400, message: "Required: filename" };
      if (!body.content_type) throw { status: 400, message: "Required: content_type" };

      const fileExt    = body.filename.split(".").pop().toUpperCase();
      const storagePath = `${academy.id}/${Date.now()}-${body.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

      // Create signed upload URL via Supabase Storage
      const { data: uploadData, error: uploadErr } = await supabaseAdmin
        .storage
        .from(BUCKET)
        .createSignedUploadUrl(storagePath);

      if (uploadErr) {
        // Bucket may not exist yet — provide friendly error
        if (uploadErr.message.includes("Bucket not found")) {
          throw {
            status: 503,
            message: "Storage bucket not configured. See SETUP.md: create 'athlete-files' bucket in Supabase Storage.",
          };
        }
        throw { status: 500, message: uploadErr.message };
      }

      // Pre-register file metadata (will be confirmed after upload)
      const { data: fileRecord, error: fileErr } = await supabaseAdmin
        .from("files")
        .insert({
          academy_id:   academy.id,
          athlete_id:   body.athlete_id || null,
          name:         body.filename,
          size_bytes:   body.size_bytes  || null,
          mime_type:    body.content_type,
          file_type:    fileExt,
          storage_path: storagePath,
          uploaded_by:  coach.id,
        })
        .select()
        .single();

      if (fileErr) throw { status: 500, message: fileErr.message };

      return created({
        file_id:    fileRecord.id,
        upload_url: uploadData.signedUrl,
        token:      uploadData.token,
        path:       storagePath,
        expires_in: 3600,
      });
    }

    // ── GET DOWNLOAD URL: GET /files/:id/download ─────────────────
    if (fileId && action === "download" && method === "GET") {
      const { data: file } = await supabaseAdmin
        .from("files")
        .select("storage_path, name")
        .eq("id", fileId)
        .eq("academy_id", academy.id)
        .single();

      if (!file) throw { status: 404, message: "File not found" };

      const { data: signedData, error: signErr } = await supabaseAdmin
        .storage
        .from(BUCKET)
        .createSignedUrl(file.storage_path, 900); // 15 minute expiry

      if (signErr) throw { status: 500, message: "Could not generate download URL" };

      return ok({ download_url: signedData.signedUrl, filename: file.name, expires_in: 900 });
    }

    // ── DELETE file: DELETE /files/:id ────────────────────────────
    if (fileId && !action && method === "DELETE") {
      const { data: file } = await supabaseAdmin
        .from("files")
        .select("*")
        .eq("id", fileId)
        .eq("academy_id", academy.id)
        .single();

      if (!file) throw { status: 404, message: "File not found" };

      // Delete from storage
      await supabaseAdmin.storage.from(BUCKET).remove([file.storage_path]);

      // Delete metadata
      await supabaseAdmin.from("files").delete().eq("id", fileId).eq("academy_id", academy.id);

      writeAuditLog({
        academyId: academy.id, coachId: coach.id,
        action: "FILE_DELETE", entityType: "file", entityId: fileId,
        before: { name: file.name, path: file.storage_path }, ip: getIP(event),
      });

      return noContent();
    }

    return error(404, "Files endpoint not found");

  } catch (e) {
    return handleError(e);
  }
};
