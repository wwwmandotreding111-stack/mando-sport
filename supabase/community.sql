-- MANDO SPORT community foundation
-- Apply this migration once in Supabase SQL Editor after schema.sql.
-- This adds member profiles, moderated comments, and abuse reports.
-- It does not expose email addresses or allow members to approve comments.

create table if not exists public.member_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'مشجع',
  favorite_team text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_profiles_display_name_length
    check (char_length(trim(display_name)) between 2 and 40),
  constraint member_profiles_favorite_team_length
    check (char_length(favorite_team) <= 80)
);

create table if not exists public.member_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  article_id uuid references public.articles(id) on delete cascade,
  body text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_comments_body_length
    check (char_length(trim(body)) between 2 and 1500),
  constraint member_comments_status_check
    check (status in ('pending', 'approved', 'rejected'))
);

create index if not exists member_comments_article_status_created_idx
  on public.member_comments (article_id, status, created_at desc);
create index if not exists member_comments_user_created_idx
  on public.member_comments (user_id, created_at desc);

create table if not exists public.comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.member_comments(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  details text not null default '',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint comment_reports_reason_length
    check (char_length(trim(reason)) between 2 and 60),
  constraint comment_reports_details_length
    check (char_length(details) <= 500),
  constraint comment_reports_status_check
    check (status in ('open', 'reviewed', 'dismissed')),
  constraint comment_reports_one_per_member
    unique (comment_id, reporter_id)
);

create index if not exists comment_reports_status_created_idx
  on public.comment_reports (status, created_at desc);

create or replace function public.create_mando_member_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen_name text;
begin
  chosen_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'مشجع'
  );
  insert into public.member_profiles (user_id, display_name)
  values (new.id, left(chosen_name, 40))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_mando_auth_user_created on auth.users;
create trigger on_mando_auth_user_created
  after insert on auth.users
  for each row execute function public.create_mando_member_profile();

alter table public.member_profiles enable row level security;
alter table public.member_comments enable row level security;
alter table public.comment_reports enable row level security;

drop policy if exists "Members can read public profile fields" on public.member_profiles;
create policy "Members can read public profile fields"
  on public.member_profiles for select to authenticated
  using (true);

drop policy if exists "Members can create own profile" on public.member_profiles;
create policy "Members can create own profile"
  on public.member_profiles for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Members can update own profile" on public.member_profiles;
create policy "Members can update own profile"
  on public.member_profiles for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Members and admins can read comments" on public.member_comments;
create policy "Members and admins can read comments"
  on public.member_comments for select to authenticated
  using (status = 'approved' or user_id = auth.uid() or public.is_mando_admin());

drop policy if exists "Members can submit pending comments" on public.member_comments;
create policy "Members can submit pending comments"
  on public.member_comments for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and char_length(trim(body)) between 2 and 1500
  );

drop policy if exists "Members can edit own pending comments" on public.member_comments;
create policy "Members can edit own pending comments"
  on public.member_comments for update to authenticated
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid() and status = 'pending');

drop policy if exists "Admins can moderate all comments" on public.member_comments;
create policy "Admins can moderate all comments"
  on public.member_comments for all to authenticated
  using (public.is_mando_admin())
  with check (public.is_mando_admin());

drop policy if exists "Members can submit comment reports" on public.comment_reports;
create policy "Members can submit comment reports"
  on public.comment_reports for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and status = 'open'
    and char_length(trim(reason)) between 2 and 60
  );

drop policy if exists "Admins can review comment reports" on public.comment_reports;
create policy "Admins can review comment reports"
  on public.comment_reports for all to authenticated
  using (public.is_mando_admin())
  with check (public.is_mando_admin());

grant select, insert, update on public.member_profiles to authenticated;
grant select, insert, update on public.member_comments to authenticated;
grant select, insert, update, delete on public.comment_reports to authenticated;
