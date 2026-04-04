"use strict";
const { supabaseAdmin, requireAuth } = require("../../lib/supabase");
const { ok, noContent, error, handleError, handleOptions, parseBody } = require("../../lib/api");
exports.handler = async (event) => {
  if (event.httpMethod==="OPTIONS") return handleOptions();
  try {
    const { coach, academy } = await requireAuth(event);
    const rawPath = event.path.replace(/.*\/notifications/,"").replace(/^\//,"");
    const notifId = rawPath.split("/")[0]||null;
    const method = event.httpMethod;
    if (!notifId && method==="GET") {
      const { unread_only } = event.queryStringParameters||{};
      let q = supabaseAdmin.from("notifications").select("*").eq("academy_id",academy.id).eq("coach_id",coach.id).order("created_at",{ascending:false}).limit(50);
      if (unread_only==="true") q=q.eq("is_read",false);
      const { data:notifications, error:e } = await q;
      if (e) throw {status:500,message:e.message};
      return ok(notifications,{unread_count:notifications.filter(n=>!n.is_read).length});
    }
    if (rawPath==="read-all" && method==="POST") {
      await supabaseAdmin.from("notifications").update({is_read:true}).eq("coach_id",coach.id).eq("is_read",false);
      return ok({message:"All read"});
    }
    if (notifId && method==="PATCH") {
      const body = parseBody(event);
      await supabaseAdmin.from("notifications").update({is_read:body.is_read!==false}).eq("id",notifId).eq("coach_id",coach.id);
      return ok({id:notifId,is_read:body.is_read!==false});
    }
    if (notifId && method==="DELETE") {
      await supabaseAdmin.from("notifications").delete().eq("id",notifId).eq("coach_id",coach.id);
      return noContent();
    }
    return error(404,"Not found");
  } catch(e) { return handleError(e); }
};
