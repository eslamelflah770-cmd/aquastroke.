"use strict";
const { supabaseAdmin, requireAuth } = require("../../lib/supabase");
const { ok, created, noContent, error, handleError, handleOptions, parseBody } = require("../../lib/api");
const BUCKET = "athlete-files";
exports.handler = async (event) => {
  if (event.httpMethod==="OPTIONS") return handleOptions();
  try {
    const { coach, academy } = await requireAuth(event);
    const rawPath = event.path.replace(/.*\/files/,"").replace(/^\//,"");
    const segs = rawPath.split("/").filter(Boolean);
    const fileId = segs[0]||null, action = segs[1]||null, method = event.httpMethod;

    if (!fileId && method==="GET") {
      const { athlete_id } = event.queryStringParameters||{};
      let q = supabaseAdmin.from("files").select("id,name,size_bytes,mime_type,file_type,athlete_id,created_at").eq("academy_id",academy.id).order("created_at",{ascending:false});
      if (athlete_id) q=q.eq("athlete_id",athlete_id);
      const { data:files, error:e } = await q;
      if (e) throw {status:500,message:e.message};
      return ok(files);
    }

    if (rawPath==="upload" && method==="POST") {
      const body = parseBody(event);
      if (!body.filename||!body.content_type) throw {status:400,message:"Required: filename, content_type"};
      const storagePath = `${academy.id}/${Date.now()}-${body.filename.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
      const { data:uploadData, error:uploadErr } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(storagePath);
      if (uploadErr) throw {status:503,message:"Storage bucket not configured. Create 'athlete-files' bucket in Supabase Storage."};
      const { data:fileRecord } = await supabaseAdmin.from("files").insert({academy_id:academy.id,athlete_id:body.athlete_id||null,name:body.filename,size_bytes:body.size_bytes||null,mime_type:body.content_type,file_type:body.filename.split(".").pop().toUpperCase(),storage_path:storagePath,uploaded_by:coach.id}).select().single();
      return created({file_id:fileRecord.id,upload_url:uploadData.signedUrl,path:storagePath,expires_in:3600});
    }

    if (fileId && action==="download" && method==="GET") {
      const { data:file } = await supabaseAdmin.from("files").select("storage_path,name").eq("id",fileId).eq("academy_id",academy.id).single();
      if (!file) throw {status:404,message:"File not found"};
      const { data:signed } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(file.storage_path,900);
      return ok({download_url:signed.signedUrl,filename:file.name,expires_in:900});
    }

    if (fileId && method==="DELETE") {
      const { data:file } = await supabaseAdmin.from("files").select("*").eq("id",fileId).eq("academy_id",academy.id).single();
      if (!file) throw {status:404,message:"File not found"};
      await supabaseAdmin.storage.from(BUCKET).remove([file.storage_path]);
      await supabaseAdmin.from("files").delete().eq("id",fileId);
      return noContent();
    }

    return error(404,"Files endpoint not found");
  } catch(e) { return handleError(e); }
};
