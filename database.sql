-- ═══════════════════════════════════════════════════
-- 5tars v2 — Full Migration (Run in Supabase SQL Editor)
-- ═══════════════════════════════════════════════════

-- ── STEP 1: Drop old tables ──
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS businesses CASCADE;

-- ── STEP 2: Extensions ──
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── STEP 3: profiles (أولاً دائماً) ──
CREATE TABLE IF NOT EXISTS profiles (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email            TEXT,
  full_name        TEXT,
  phone            TEXT,
  business_type    TEXT,
  role             TEXT DEFAULT 'user' CHECK (role IN ('user','owner')),
  plan             TEXT DEFAULT 'trial' CHECK (plan IN ('trial','free','basic','pro','advanced')),
  status           TEXT DEFAULT 'active' CHECK (status IN ('active','suspended','cancelled')),
  google_place_id  TEXT,
  google_connected BOOLEAN DEFAULT false,
  trial_ends       TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "self" ON profiles;
CREATE POLICY "self" ON profiles FOR ALL USING (auth.uid() = id);

-- ── STEP 4: is_owner() — بعد profiles ──
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner');
$$;

DROP POLICY IF EXISTS "owner_all" ON profiles;
CREATE POLICY "owner_all" ON profiles FOR ALL USING (public.is_owner());

-- ── STEP 5: reviews ──
CREATE TABLE IF NOT EXISTS reviews (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES profiles(id) ON DELETE CASCADE,
  author_name TEXT,
  review_text TEXT,
  stars       INTEGER NOT NULL DEFAULT 3 CHECK (stars BETWEEN 1 AND 5),
  review_date DATE,
  replied     BOOLEAN DEFAULT false,
  reply_text  TEXT,
  source      TEXT DEFAULT 'manual' CHECK (source IN ('manual','google','qr')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "self_rev" ON reviews;
CREATE POLICY "self_rev" ON reviews FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "owner_rev" ON reviews;
CREATE POLICY "owner_rev" ON reviews FOR ALL USING (public.is_owner());

-- ── STEP 6: business_info ──
CREATE TABLE IF NOT EXISTS business_info (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id            UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  display_name       TEXT,
  google_review_url  TEXT,
  avg_rating         NUMERIC(3,1),
  total_review_count INTEGER DEFAULT 0,
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE business_info ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "self_bi" ON business_info;
CREATE POLICY "self_bi" ON business_info FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "owner_bi" ON business_info;
CREATE POLICY "owner_bi" ON business_info FOR ALL USING (public.is_owner());

-- ── STEP 7: subscriptions ──
CREATE TABLE IF NOT EXISTS subscriptions (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE,
  plan       TEXT NOT NULL CHECK (plan IN ('trial','free','basic','pro','advanced')),
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','expired')),
  amount     NUMERIC(10,2) DEFAULT 0,
  currency   TEXT DEFAULT 'SAR',
  start_date TIMESTAMPTZ DEFAULT NOW(),
  end_date   TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_subs" ON subscriptions;
CREATE POLICY "owner_subs" ON subscriptions FOR ALL USING (public.is_owner());
DROP POLICY IF EXISTS "self_subs" ON subscriptions;
CREATE POLICY "self_subs" ON subscriptions FOR SELECT USING (auth.uid() = user_id);

-- ── STEP 8: ai_usage ──
CREATE TABLE IF NOT EXISTS ai_usage (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE,
  feature    TEXT CHECK (feature IN ('reply','diagnostic','translate','summary')),
  model      TEXT DEFAULT 'gpt-4o-mini',
  tokens_in  INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  cost_usd   NUMERIC(10,6) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "self_ai" ON ai_usage;
CREATE POLICY "self_ai" ON ai_usage FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "owner_ai" ON ai_usage;
CREATE POLICY "owner_ai" ON ai_usage FOR ALL USING (public.is_owner());

-- ── STEP 9: expenses ──
CREATE TABLE IF NOT EXISTS expenses (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category     TEXT CHECK (category IN ('hosting','ai','whatsapp','domain','other')),
  description  TEXT,
  amount       NUMERIC(10,2) NOT NULL,
  currency     TEXT DEFAULT 'SAR',
  expense_date DATE DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_exp" ON expenses;
CREATE POLICY "owner_exp" ON expenses FOR ALL USING (public.is_owner());

-- ── STEP 10: ads ──
CREATE TABLE IF NOT EXISTS ads (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  target_plan TEXT DEFAULT 'all',
  placement   TEXT DEFAULT 'dashboard',
  impressions INTEGER DEFAULT 0,
  clicks      INTEGER DEFAULT 0,
  revenue     NUMERIC(10,2) DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  start_date  DATE,
  end_date    DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_ads" ON ads;
CREATE POLICY "owner_ads" ON ads FOR ALL USING (public.is_owner());
DROP POLICY IF EXISTS "users_view_ads" ON ads;
CREATE POLICY "users_view_ads" ON ads FOR SELECT USING (is_active = true);

-- ── STEP 11: coupons ──
CREATE TABLE IF NOT EXISTS coupons (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code             TEXT UNIQUE NOT NULL,
  discount_percent INTEGER CHECK (discount_percent BETWEEN 1 AND 100),
  max_uses         INTEGER DEFAULT 1,
  used_count       INTEGER DEFAULT 0,
  expires_at       TIMESTAMPTZ,
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_coupons" ON coupons;
CREATE POLICY "owner_coupons" ON coupons FOR ALL USING (public.is_owner());

-- ── STEP 12: review_requests ──
CREATE TABLE IF NOT EXISTS review_requests (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id       UUID REFERENCES profiles(id) ON DELETE CASCADE,
  customer_name  TEXT,
  customer_phone TEXT,
  service_type   TEXT,
  google_link    TEXT,
  status         TEXT DEFAULT 'sent' CHECK (status IN ('sent','viewed','reviewed','expired')),
  sent_at        TIMESTAMPTZ DEFAULT NOW(),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE review_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "self_rr" ON review_requests;
CREATE POLICY "self_rr" ON review_requests FOR ALL USING (auth.uid() = owner_id);
DROP POLICY IF EXISTS "owner_rr" ON review_requests;
CREATE POLICY "owner_rr" ON review_requests FOR ALL USING (public.is_owner());

-- ── STEP 13: site_settings ──
CREATE TABLE IF NOT EXISTS site_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_settings" ON site_settings;
CREATE POLICY "read_settings" ON site_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "owner_settings" ON site_settings;
CREATE POLICY "owner_settings" ON site_settings FOR ALL USING (public.is_owner());

INSERT INTO site_settings (key, value) VALUES
  ('maintenance_mode',    'false'),
  ('ai_replies_enabled',  'true'),
  ('whatsapp_enabled',    'true'),
  ('new_signups_enabled', 'true'),
  ('announcement',        ''),
  ('announcement_active', 'false'),
  ('price_basic',         '49'),
  ('price_pro',           '99'),
  ('price_advanced',      '199')
ON CONFLICT (key) DO NOTHING;

-- ── STEP 14: diagnostic_results ──
CREATE TABLE IF NOT EXISTS diagnostic_results (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE,
  score      INTEGER CHECK (score BETWEEN 0 AND 100),
  strengths  TEXT[],
  weaknesses TEXT[],
  raw_data   JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE diagnostic_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "self_diag" ON diagnostic_results;
CREATE POLICY "self_diag" ON diagnostic_results FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "owner_diag" ON diagnostic_results;
CREATE POLICY "owner_diag" ON diagnostic_results FOR ALL USING (public.is_owner());

-- ── STEP 15: Auto-create profile trigger ──
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, trial_ends)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NOW() + INTERVAL '14 days'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── STEP 16: Set owner ──
-- Run this AFTER you sign up/login with your email:
-- UPDATE profiles SET role = 'owner' WHERE email = 'the5starsrating@gmail.com';
