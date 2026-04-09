-- 5tars v2 — core fixes patch
-- Apply this in Supabase SQL Editor on the current project

create extension if not exists pgcrypto;

-- 1) Public-safe QR routing table
create table if not exists public.review_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade unique,
  token text not null unique,
  business_name text,
  google_review_url text,
  whatsapp_url text,
  negative_message text default 'آسفون على تجربتك! تواصل معنا على واتساب وسنحل مشكلتك فوراً 💚',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.review_links enable row level security;

drop policy if exists "self_review_links" on public.review_links;
create policy "self_review_links"
on public.review_links for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "public_read_active_review_links" on public.review_links;
create policy "public_read_active_review_links"
on public.review_links for select
using (active = true);

drop policy if exists "owner_review_links" on public.review_links;
create policy "owner_review_links"
on public.review_links for all
using (public.is_owner())
with check (public.is_owner());

-- 2) QR tracking table
create table if not exists public.clicks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text,
  type text not null check (type in ('scan','positive_click','negative_click','google_redirect','whatsapp_redirect')),
  user_agent text,
  referrer text,
  created_at timestamptz not null default now()
);

alter table public.clicks enable row level security;

drop policy if exists "self_clicks" on public.clicks;
create policy "self_clicks"
on public.clicks for select
using (auth.uid() = user_id);

drop policy if exists "owner_clicks" on public.clicks;
create policy "owner_clicks"
on public.clicks for all
using (public.is_owner())
with check (public.is_owner());

-- 3) Prevent regular users from escalating role/plan/status on their own profile
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() = old.id and not public.is_owner() then
    new.role := old.role;
    new.plan := old.plan;
    new.status := old.status;
    new.trial_ends := old.trial_ends;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_fields on public.profiles;
create trigger trg_protect_profile_fields
before update on public.profiles
for each row
execute function public.protect_profile_fields();

-- 4) Backfill one review link per existing user
insert into public.review_links (user_id, token, business_name, google_review_url, whatsapp_url, active)
select
  p.id,
  encode(gen_random_bytes(12), 'hex'),
  coalesce(p.full_name, 'محلك'),
  coalesce(p.google_place_id, ''),
  case
    when regexp_replace(coalesce(p.phone,''), '\\D', '', 'g') like '966%' then 'https://wa.me/' || regexp_replace(p.phone, '\\D', '', 'g')
    when regexp_replace(coalesce(p.phone,''), '\\D', '', 'g') like '05%' then 'https://wa.me/966' || right(regexp_replace(p.phone, '\\D', '', 'g'), 9)
    when regexp_replace(coalesce(p.phone,''), '\\D', '', 'g') like '5%' then 'https://wa.me/966' || regexp_replace(p.phone, '\\D', '', 'g')
    else null
  end,
  true
from public.profiles p
on conflict (user_id) do update set
  business_name = excluded.business_name,
  google_review_url = excluded.google_review_url,
  whatsapp_url = coalesce(public.review_links.whatsapp_url, excluded.whatsapp_url),
  updated_at = now();
