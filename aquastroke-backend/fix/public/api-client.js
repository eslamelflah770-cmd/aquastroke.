"use strict";
const API_BASE = "/api";
let _accessToken = null;
function restoreSession() {
  _accessToken = sessionStorage.getItem("aq_token");
  return !!_accessToken;
}
function clearSession() {
  _accessToken = null;
  sessionStorage.removeItem("aq_token");
}
function getHeaders(extra={}) {
  const h = {"Content-Type":"application/json",...extra};
  if (_accessToken) h["Authorization"] = `Bearer ${_accessToken}`;
  return h;
}
async function apiFetch(path, options={}) {
  const res = await fetch(`${API_BASE}${path}`, {...options, headers:getHeaders(options.headers)});
  if (res.status === 204) return null;
  const body = await res.json();
  if (!res.ok) throw new Error(body?.title || body?.message || `API error ${res.status}`);
  return body.data !== undefined ? body.data : body;
}
const Auth = {
  async logout() { if(window._supabaseClient) await window._supabaseClient.auth.signOut().catch(()=>{}); clearSession(); }
};
const Athletes = {
  list: () => apiFetch("/athletes"),
  get: id => apiFetch(`/athletes/${id}`),
  create: d => apiFetch("/athletes",{method:"POST",body:JSON.stringify(d)}),
  update: (id,d) => apiFetch(`/athletes/${id}`,{method:"PATCH",body:JSON.stringify(d)}),
  delete: (id,p=false) => apiFetch(`/athletes/${id}?permanent=${p}`,{method:"DELETE"}),
  getPrescription: id => apiFetch(`/athletes/${id}/prescription`),
  regeneratePrescription: id => apiFetch(`/athletes/${id}/prescription/regenerate`,{method:"POST"}),
};
const Trials = {
  list: (f={}) => apiFetch(`/trials${new URLSearchParams(f).toString()?"?"+new URLSearchParams(f).toString():""}`),
  create: d => apiFetch("/trials",{method:"POST",body:JSON.stringify({athlete_id:d.athleteId,trial_number:d.trialNumber,actual_time:d.actualTime,trial_date:d.date,rpe:d.rpe,context:d.context,stroke_rate:d.strokeRate,notes:d.notes})}),
  update: (id,d) => apiFetch(`/trials/${id}`,{method:"PATCH",body:JSON.stringify(d)}),
  delete: id => apiFetch(`/trials/${id}`,{method:"DELETE"}),
};
const Season = {
  get: () => apiFetch("/season"),
  update: d => apiFetch("/season",{method:"PATCH",body:JSON.stringify(d)}),
};
const Squad = {
  analysis: () => apiFetch("/squad/analysis"),
  adapt: () => apiFetch("/squad/adapt",{method:"POST"}),
  async export(format="csv") {
    const res = await fetch(`${API_BASE}/squad/export?format=${format}`,{headers:getHeaders()});
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `AQUASTROKE_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  },
};
const Files = {
  list: (id=null) => apiFetch(`/files${id?"?athlete_id="+id:""}`),
  delete: id => apiFetch(`/files/${id}`,{method:"DELETE"}),
};
const Notifications = {
  list: (u=false) => apiFetch(`/notifications${u?"?unread_only=true":""}`),
  markRead: id => apiFetch(`/notifications/${id}`,{method:"PATCH",body:JSON.stringify({is_read:true})}),
  markAllRead: () => apiFetch("/notifications/read-all",{method:"POST"}),
};
function initAQUASTROKEAuth(supabaseUrl, supabaseAnonKey) {
  if (!window.supabase) { window._backendMode=false; return; }
  window._supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
  window._supabaseClient.auth.onAuthStateChange((event,session) => {
    if (event==="SIGNED_IN"&&session) { _accessToken=session.access_token; sessionStorage.setItem("aq_token",_accessToken); window._backendMode=true; }
    else if (event==="SIGNED_OUT") { clearSession(); window._backendMode=false; }
    else if (event==="TOKEN_REFRESHED"&&session) { _accessToken=session.access_token; sessionStorage.setItem("aq_token",_accessToken); }
  });
  window._supabaseClient.auth.getSession().then(({data:{session}}) => {
    if (session) { _accessToken=session.access_token; window._backendMode=true; sessionStorage.setItem("aq_token",_accessToken); }
  });
  window._backendMode=true;
  console.log("✓ AQUASTROKE: Backend API mode active");
}
async function apiLoadDashboard() {
  if (!window._backendMode) return null;
  try { const [athletes,season] = await Promise.all([Athletes.list(),Season.get()]); return {athletes,season}; }
  catch(e) { console.error("apiLoadDashboard:",e.message); return null; }
}
window.AQ = {
  Auth, Athletes, Trials, Season, Squad, Files, Notifications,
  initAQUASTROKEAuth, restoreSession, clearSession, apiLoadDashboard,
  isBackendMode: () => !!window._backendMode && !!_accessToken,
};
console.log("✓ AQUASTROKE API client loaded");
