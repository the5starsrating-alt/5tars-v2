-- 5tars Patch 3 — dedup + tagging
-- Apply AFTER database_patch.sql (v2)

-- 1) Add fingerprint column to reviews for dedup
alter table public.reviews
  add column if not exists fingerprint text,
  add column if not exists tags text[] default '{}';

-- unique index on (user_id, fingerprint) so upsert works
create unique index if not exists reviews_user_fingerprint_idx
  on public.reviews (user_id, fingerprint)
  where fingerprint is not null;

-- 2) analytics helper view (reads from clicks)
create or replace view public.qr_analytics as
select
  user_id,
  token,
  count(*) filter (where type = 'scan')               as scans,
  count(*) filter (where type = 'positive_click')     as positives,
  count(*) filter (where type = 'negative_click')     as negatives,
  count(*) filter (where type = 'google_redirect')    as google_redirects,
  count(*) filter (where type = 'whatsapp_redirect')  as whatsapp_redirects,
  date_trunc('day', created_at) as day
from public.clicks
group by user_id, token, date_trunc('day', created_at);
