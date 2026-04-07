// 🔗 Supabase Connection
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = "PUT_YOUR_URL";
const supabaseKey = "PUT_YOUR_KEY";

export const supabase = createClient(supabaseUrl, supabaseKey);
/* ═══════════════════════════════════════════
   5tars v2 — Core Library
   ═══════════════════════════════════════════ */

// ── Supabase Client ──
let _sb = null;
function getSB() {
  if (_sb) return _sb;
  const { createClient } = window.supabase;
  _sb = createClient(window.FIVEENV.SUPABASE_URL, window.FIVEENV.SUPABASE_ANON_KEY);
  return _sb;
}

// ── Auth helpers ──
async function requireAuth(redirectTo = '/login.html') {
  const sb = getSB();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.href = redirectTo; return null; }
  return session;
}

async function getProfile(userId) {
  const sb = getSB();
  const { data } = await sb.from('profiles').select('*').eq('id', userId).single();
  return data;
}

async function signOut() {
  await getSB().auth.signOut();
  window.location.href = '/login.html';
}

// ── Edge Function caller ──
async function callEdge(fn, payload) {
  const sb = getSB();
  const { data: { session } } = await sb.auth.getSession();
  try {
    const res = await fetch(`${window.FIVEENV.SUPABASE_URL}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': window.FIVEENV.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${session?.access_token || window.FIVEENV.SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
    return await res.json();
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Toast ──
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  const colors = { success: '#16A34A', error: '#DC2626', info: '#2251D3', warn: '#D97706' };
  el.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:${colors[type]||colors.success};color:#fff;padding:12px 24px;
    border-radius:12px;font-family:Cairo,sans-serif;font-size:13px;font-weight:700;
    z-index:99999;box-shadow:0 8px 32px rgba(0,0,0,0.25);
    animation:toastIn .3s ease;white-space:nowrap;max-width:90vw;`;
  el.textContent = msg;
  if (!document.getElementById('_toastStyle')) {
    const s = document.createElement('style');
    s.id = '_toastStyle';
    s.textContent = '@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
    document.head.appendChild(s);
  }
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity='0'; el.style.transition='opacity .3s'; setTimeout(()=>el.remove(), 300); }, 3000);
}

// ── Format numbers ──
function fmtNum(n) {
  if (n == null) return '—';
  if (n >= 1000000) return (n/1000000).toFixed(1) + 'م';
  if (n >= 1000) return (n/1000).toFixed(1) + 'ك';
  return String(n);
}

function fmtMoney(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('ar-SA') + ' ر.س';
}

// ── Date ──
function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('ar-SA', { year:'numeric', month:'short', day:'numeric' });
}

window.FIVE = { getSB, requireAuth, getProfile, signOut, callEdge, toast, fmtNum, fmtMoney, fmtDate };
