"use strict";
const https = require("https");
const { supabaseAdmin } = require("../../lib/supabase");
const { analyzeSquad } = require("../../lib/adapt-engine");
exports.handler = async (event) => {
  if (event.httpMethod==="GET") {
    const p = event.queryStringParameters||{};
    if (p["hub.mode"]==="subscribe" && p["hub.verify_token"]===process.env.META_VERIFY_TOKEN)
      return { statusCode:200, body:p["hub.challenge"] };
    return { statusCode:403, body:"Forbidden" };
  }
  if (event.httpMethod!=="POST") return { statusCode:405, body:"Method Not Allowed" };
  let body;
  try { body = typeof event.body==="string"?JSON.parse(event.body):event.body; } catch { return { statusCode:200, body:"ok" }; }
  if (!body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) return { statusCode:200, body:"ok" };
  const msg = body.entry[0].changes[0].value.messages[0];
  const from = msg.from, text = msg.text?.body;
  if (!text) return { statusCode:200, body:"ok" };
  try {
    const { data:coach } = await supabaseAdmin.from("coaches").select("id,academy_id,display_name,role").eq("phone",from).single();
    const systemPrompt = coach ? await buildPrompt(coach) : "You are AQUASTROKE Coach Assistant. Register your phone in AQUASTROKE Settings to get live data.";
    if (!global._waCons) global._waCons={};
    const history = global._waCons[from]||[];
    history.push({role:"user",content:text});
    if (history.length>20) history.splice(0,history.length-20);
    const reply = await callClaude(systemPrompt,history);
    history.push({role:"assistant",content:reply});
    global._waCons[from]=history;
    await sendMsg(from,reply);
  } catch(e) { console.error("WhatsApp error:",e.message); }
  return { statusCode:200, body:"ok" };
};
async function buildPrompt(coach) {
  const { data:season } = await supabaseAdmin.from("seasons").select("current_week,current_phase,label").eq("academy_id",coach.academy_id).eq("is_active",true).single();
  const { data:athletes } = await supabaseAdmin.from("athletes").select("id,name,event,category,target_t1,target_t2,target_t3,trial_results(trial_number,actual_time,gap_percent,fatigue_index,rpe)").eq("academy_id",coach.academy_id).eq("is_active",true);
  const summary = (athletes||[]).map(a => {
    const t = (a.trial_results||[]).sort((x,y)=>y.trial_number-x.trial_number)[0];
    return `• ${a.name} | ${a.event} | ${t?`T${t.trial_number}: ${t.actual_time}s gap:${t.gap_percent??'N/A'}% fatigue:${t.fatigue_index??'N/A'}`:'No trials'}`;
  }).join("\n");
  return `You are AQUASTROKE Coach Assistant with live DB access.\nCoach: ${coach.display_name} | Season: ${season?.label||'2025/2026'} Week ${season?.current_week||1} ${season?.current_phase||'GPP'}\nAthletes:\n${summary||'None yet'}\nKeep replies under 5 lines. Respond in the same language as the coach.`;
}
function callClaude(system,messages) {
  const payload = JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:400,system,messages});
  return new Promise((res,rej) => {
    const req = https.request({hostname:"api.anthropic.com",path:"/v1/messages",method:"POST",headers:{"Content-Type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01","Content-Length":Buffer.byteLength(payload)}},(r)=>{
      let d=""; r.on("data",c=>d+=c); r.on("end",()=>{ try{res(JSON.parse(d).content?.[0]?.text||"Sorry.")}catch{rej(new Error("Parse error"))}; });
    });
    req.on("error",rej); req.write(payload); req.end();
  });
}
function sendMsg(to,text) {
  const payload = JSON.stringify({messaging_product:"whatsapp",to,type:"text",text:{body:text}});
  return new Promise((res,rej) => {
    const req = https.request({hostname:"graph.facebook.com",path:`/v19.0/${process.env.META_PHONE_NUMBER_ID}/messages`,method:"POST",headers:{"Authorization":`Bearer ${process.env.META_ACCESS_TOKEN}`,"Content-Type":"application/json","Content-Length":Buffer.byteLength(payload)}},(r)=>{
      let d=""; r.on("data",c=>d+=c); r.on("end",()=>res(JSON.parse(d)));
    });
    req.on("error",rej); req.write(payload); req.end();
  });
}
