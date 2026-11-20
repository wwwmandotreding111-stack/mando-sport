-- MANDO SPORT: secure content and admin foundation
-- Run this script once in Supabase SQL Editor for the MANDO SPORT project.

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_mando_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_mando_admin() from public;
grant execute on function public.is_mando_admin() to anon, authenticated;

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  excerpt text not null default '',
  body text not null default '',
  image_url text not null default '',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  author_id uuid references auth.users(id) on delete set null
);

create index if not exists articles_published_created_idx
  on public.articles (published, created_at desc);

create table if not exists public.advertisements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  image_url text not null default '',
  target_url text not null default '',
  placement text not null default 'home',
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint advertisements_placement_check
    check (placement in ('home', 'matches', 'news', 'footer'))
);

create table if not exists public.page_views (
  id bigint generated always as identity primary key,
  page_path text not null,
  viewed_at timestamptz not null default now()
);

create index if not exists page_views_viewed_at_idx
  on public.page_views (viewed_at desc);

alter table public.admin_users enable row level security;
alter table public.articles enable row level security;
alter table public.advertisements enable row level security;
alter table public.page_views enable row level security;

-- No client-side policy can add or promote administrators.
drop policy if exists "Admins can read own admin record" on public.admin_users;
create policy "Admins can read own admin record"
  on public.admin_users for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Public can read published articles" on public.articles;
create policy "Public can read published articles"
  on public.articles for select to anon, authenticated
  using (published = true or public.is_mando_admin());

drop policy if exists "Admins can manage articles" on public.articles;
create policy "Admins can manage articles"
  on public.articles for all to authenticated
  using (public.is_mando_admin())
  with check (public.is_mando_admin());

drop policy if exists "Public can read active advertisements" on public.advertisements;
create policy "Public can read active advertisements"
  on public.advertisements for select to anon, authenticated
  using (
    active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

drop policy if exists "Admins can manage advertisements" on public.advertisements;
create policy "Admins can manage advertisements"
  on public.advertisements for all to authenticated
  using (public.is_mando_admin())
  with check (public.is_mando_admin());

drop policy if exists "Anyone can record a page view" on public.page_views;
create policy "Anyone can record a page view"
  on public.page_views for insert to anon, authenticated
  with check (char_length(page_path) between 1 and 300);

drop policy if exists "Admins can read page views" on public.page_views;
create policy "Admins can read page views"
  on public.page_views for select to authenticated
  using (public.is_mando_admin());

grant select on public.articles to anon, authenticated;
grant insert, update, delete on public.articles to authenticated;
grant select on public.advertisements to anon, authenticated;
grant insert, update, delete on public.advertisements to authenticated;
grant insert on public.page_views to anon, authenticated;
grant select on public.page_views to authenticated;
