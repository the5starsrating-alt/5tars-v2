export const config = { runtime: 'edge' };

export default async function handler(req) {
  const h = { 'Content-Type': 'application/json' };
  
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
  
  const sqls = [
    `CREATE TABLE IF NOT EXISTS clicks (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      uid UUID NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('positive','negative')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `ALTER TABLE clicks ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS "service_only" ON clicks`,
    `CREATE POLICY "service_only" ON clicks FOR ALL USING (false)`
  ];

  const results = [];
  for (const sql of sqls) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        method: 'GET',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      // نستخدم pg endpoint
      const r = await fetch(`${SUPABASE_URL}/pg/query`, {
        method: 'POST',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql })
      });
      const txt = await r.text();
      results.push({ sql: sql.slice(0,40), status: r.status, ok: r.ok });
    } catch(e) {
      results.push({ sql: sql.slice(0,40), error: e.message });
    }
  }

  return new Response(JSON.stringify({ results }), { headers: h });
}
