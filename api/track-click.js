export const config = { runtime: 'edge' };

export default async function handler(req) {
  const h = { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const { uid, type } = await req.json();
    if (!uid || !type) return new Response(JSON.stringify({ success: false, error: 'uid and type required' }), { status: 400, headers: h });
    if (!['positive','negative'].includes(type)) return new Response(JSON.stringify({ success: false, error: 'type must be positive or negative' }), { status: 400, headers: h });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase not configured');

    const res = await fetch(`${SUPABASE_URL}/rest/v1/clicks`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ uid, type, created_at: new Date().toISOString() })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(err);
    }

    return new Response(JSON.stringify({ success: true }), { headers: h });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: h });
  }
}
