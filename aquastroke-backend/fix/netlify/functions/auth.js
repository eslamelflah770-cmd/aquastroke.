"use strict";
const { supabaseAdmin } = require("../../lib/supabase");
const { ok, created, error, handleError, handleOptions, parseBody } = require("../../lib/api");
exports.handler = async (event) => {
  if (event.httpMethod==="OPTIONS") return handleOptions();
  const path = event.path.replace(/.*\/auth\/?/,"").replace(/^\//,"");
  const method = event.httpMethod;
  try {
    if (path==="signup" && method==="POST") {
      const { email, password, display_name, academy_name } = parseBody(event);
      if (!email||!password||!display_name||!academy_name) throw {status:400,message:"Required: email, password, display_name, academy_name"};
      if (password.length<8) throw {status:400,message:"Password must be at least 8 characters"};
      const { data:authData, error:authErr } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm:true });
      if (authErr) throw {status:400,message:authErr.message};
      const userId = authData.user.id;
      const slug = academy_name.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,40)+"-"+userId.slice(0,8);
      const { data:academy } = await supabaseAdmin.from("academies").insert({name:academy_name,slug,owner_id:userId}).select().single();
      await supabaseAdmin.from("seasons").insert({academy_id:academy.id,label:"2025/2026",current_week:1,current_phase:"GPP",start_date:new Date().toISOString().split("T")[0]});
      const { data:coach } = await supabaseAdmin.from("coaches").insert({user_id:userId,academy_id:academy.id,display_name,role:"ADMIN"}).select().single();
      return created({message:"Account created",coach_id:coach.id,academy_id:academy.id});
    }
    if (path==="logout" && method==="POST") {
      const token = (event.headers["authorization"]||"").replace("Bearer ","");
      if (token) await supabaseAdmin.auth.admin.signOut(token).catch(()=>{});
      return ok({message:"Logged out"});
    }
    return error(404,"Auth endpoint not found");
  } catch(e) { return handleError(e); }
};
