-- ═══════════════════════════════════════════════════════════════
-- 5tars v2 — Database Patch 4
-- Adds: recurring_costs (fixed monthly expenses like API keys, WhatsApp, hosting)
--        free_grants (tracking for complimentary subscriptions given to users)
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Recurring Costs (تكاليف ثابتة شهرية) ──
CREATE TABLE IF NOT EXISTS recurring_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                    -- مثال: "OpenAI API", "UltraMsg WhatsApp"
  category TEXT NOT NULL,                -- hosting | ai | whatsapp | domain | payment | other
  amount NUMERIC(12,2) NOT NULL,         -- المبلغ
  currency TEXT NOT NULL DEFAULT 'SAR',  -- SAR | USD
  billing_cycle TEXT NOT NULL DEFAULT 'monthly', -- monthly | yearly
  provider TEXT,                         -- Vercel | OpenAI | UltraMsg | ...
  notes TEXT,                            -- ملاحظات
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_charged_date DATE,                -- آخر شهر تم ترحيله إلى expenses
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_costs_active ON recurring_costs(is_active);

-- Enable RLS
ALTER TABLE recurring_costs ENABLE ROW LEVEL SECURITY;

-- Only owner can read/write
DROP POLICY IF EXISTS "Owner read recurring_costs" ON recurring_costs;
CREATE POLICY "Owner read recurring_costs" ON recurring_costs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
  );

DROP POLICY IF EXISTS "Owner write recurring_costs" ON recurring_costs;
CREATE POLICY "Owner write recurring_costs" ON recurring_costs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
  );

-- ── 2. Free Grants (سجل الاشتراكات المجانية الممنوحة) ──
-- هذا جدول للتتبع فقط — الاشتراك الفعلي يُسجّل في subscriptions بمبلغ 0
CREATE TABLE IF NOT EXISTS free_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  plan TEXT NOT NULL,
  duration_days INTEGER NOT NULL,
  reason TEXT,                            -- سبب المنح (تعويض, مؤثر, اختبار, ...)
  granted_by UUID REFERENCES profiles(id),-- معرف المالك الذي منح
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_free_grants_user ON free_grants(user_id);

ALTER TABLE free_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner read free_grants" ON free_grants;
CREATE POLICY "Owner read free_grants" ON free_grants
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
  );

DROP POLICY IF EXISTS "Owner write free_grants" ON free_grants;
CREATE POLICY "Owner write free_grants" ON free_grants
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
  );

-- ── 3. Seed default recurring costs (البيانات الأولية) ──
-- نضيف التكاليف المعروفة فقط إذا الجدول فارغ
INSERT INTO recurring_costs (name, category, amount, currency, billing_cycle, provider, notes, is_active)
SELECT * FROM (VALUES
  ('Vercel Hobby',          'hosting',  0.00,  'USD', 'monthly', 'Vercel',       'خطة مجانية — قابلة للترقية', true),
  ('Supabase Free',         'hosting',  0.00,  'USD', 'monthly', 'Supabase',     'خطة مجانية — حد 500MB', true),
  ('OpenAI GPT-4o-mini',    'ai',       50.00, 'USD', 'monthly', 'OpenAI',       'تكلفة متغيرة — عدّل حسب الاستهلاك الفعلي', true),
  ('Google Places API',     'ai',       30.00, 'USD', 'monthly', 'Google Cloud', 'تكلفة متغيرة حسب عدد الطلبات', true),
  ('UltraMsg WhatsApp',     'whatsapp', 50.00, 'SAR', 'monthly', 'UltraMsg',     'رسائل WhatsApp', true),
  ('Stripe (رسوم معالجة)',  'payment',  0.00,  'SAR', 'monthly', 'Stripe',       '2.9% + 1 ريال لكل عملية', true),
  ('Domain .com',           'domain',   60.00, 'SAR', 'yearly',  'Namecheap',    'تجديد سنوي', true)
) AS t(name, category, amount, currency, billing_cycle, provider, notes, is_active)
WHERE NOT EXISTS (SELECT 1 FROM recurring_costs);

SELECT '✅ Patch 4 applied: recurring_costs + free_grants tables created' AS status;
