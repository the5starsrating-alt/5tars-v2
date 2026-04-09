export const config = { runtime: 'edge' };

export default async function handler(req) {
  const h = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS'
  };

  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');
    const days = parseInt(url.searchParams.get('days') || '30');

    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: 'userId required' }), { status: 400, headers: h });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Missing env vars');

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/clicks?user_id=eq.${userId}&created_at=gte.${since}&order=created_at.asc`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Accept: 'application/json'
        }
      }
    );

    if (!res.ok) throw new Error('DB query failed');
    const rows = await res.json();

    // Aggregate
    const totals = { scan: 0, positive_click: 0, negative_click: 0, google_redirect: 0, whatsapp_redirect: 0 };
    const byDay = {};

    for (const row of rows) {
      totals[row.type] = (totals[row.type] || 0) + 1;
      const day = row.created_at.slice(0, 10);
      if (!byDay[day]) byDay[day] = { scan: 0, positive_click: 0, negative_click: 0 };
      if (byDay[day][row.type] !== undefined) byDay[day][row.type]++;
    }

    const conversionRate = totals.scan > 0
      ? Math.round((totals.positive_click / totals.scan) * 100)
      : 0;

    return new Response(JSON.stringify({
      success: true,
      period: { days, since },
      totals,
      conversionRate,
      byDay: Object.entries(byDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, counts]) => ({ date, ...counts }))
    }), { headers: h });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: h });
  }
}
