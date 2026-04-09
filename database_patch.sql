-- 5tars v2 — core fixes patch (v2 - fixed)
-- Apply this in Supabase SQL Editor

create extension if not exists pgcrypto;

-- 1) Public-safe QR routing table
create table if not exists public.review_links (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  token            text not null,
  business_name    text,
  google_review_url text,
  whatsapp_url     text,
  negative_message text default 'آسفون على تجربتك! تواصل معنا على واتساب وسنحل مشكلتك فوراً 💚',
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint review_links_user_id_key unique (user_id),
  constraint review_links_token_key unique (token)
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

-- 2) clicks table (drop and recreate if partial)
drop table if exists public.clicks cascade;
create table public.clicks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  token      text,
  type       text not null check (type in ('scan','positive_click','negative_click','google_redirect','whatsapp_redirect')),
  user_agent text,
  referrer   text,
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

-- Insert-only for service role (needed by track-click API)
drop policy if exists "service_insert_clicks" on public.clicks;
create policy "service_insert_clicks"
on public.clicks for insert
with check (true);

-- 3) Protect profile fields trigger
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.id and not public.is_owner() then
    new.role      := old.role;
    new.plan      := old.plan;
    new.status    := old.status;
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

-- 4) Backfill review_links for existing users
insert into public.review_links (user_id, token, business_name, google_review_url, whatsapp_url, active)
select
  p.id,
  encode(gen_random_bytes(12), 'hex'),
  coalesce(p.full_name, 'محلك'),
  coalesce(p.google_place_id, ''),
  case
    when p.phone is null or p.phone = '' then null
    when regexp_replace(p.phone, '[^0-9]', '', 'g') like '966%'
      then 'https://wa.me/' || regexp_replace(p.phone, '[^0-9]', '', 'g')
    when regexp_replace(p.phone, '[^0-9]', '', 'g') like '05%'
      and length(regexp_replace(p.phone, '[^0-9]', '', 'g')) = 10
      then 'https://wa.me/966' || substring(regexp_replace(p.phone, '[^0-9]', '', 'g') from 2)
    when regexp_replace(p.phone, '[^0-9]', '', 'g') like '5%'
      and length(regexp_replace(p.phone, '[^0-9]', '', 'g')) = 9
      then 'https://wa.me/966' || regexp_replace(p.phone, '[^0-9]', '', 'g')
    else null
  end,
  true
from public.profiles p
on conflict (user_id) do update set
  business_name     = excluded.business_name,
  google_review_url = excluded.google_review_url,
  whatsapp_url      = coalesce(public.review_links.whatsapp_url, excluded.whatsapp_url),
  updated_at        = now();
