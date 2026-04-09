export const config = { runtime: 'edge' };

export default async function handler(req) {
  const h = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  const URL  = process.env.SUPABASE_URL;
  const KEY  = process.env.SUPABASE_SERVICE_KEY;
  if (!URL || !KEY) return new Response(JSON.stringify({error:'not configured'}), {status:500, headers:h});

  // Supabase Management API - تشغيل SQL
  const PROJECT = 'bxlvcdfqpkxyrqjdnchi';

  const sqls = [
    `CREATE TABLE IF NOT EXISTS clicks (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, uid UUID NOT NULL, type TEXT NOT NULL CHECK (type IN ('positive','negative')), created_at TIMESTAMPTZ DEFAULT NOW())`,
    `ALTER TABLE clicks ENABLE ROW LEVEL SECURITY`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clicks' AND policyname='service_only') THEN CREATE POLICY "service_only" ON clicks FOR ALL USING (false); END IF; END $$`
  ];

  const results = [];
  for (const sql of sqls) {
    // Supabase db/query endpoint
    const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql })
    });
    const txt = await r.text();
    results.push({ ok: r.ok, status: r.status, snippet: sql.slice(0,35), response: txt.slice(0,80) });
  }

  return new Response(JSON.stringify({ results }), { headers: h });
}
