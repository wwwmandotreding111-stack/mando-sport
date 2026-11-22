-- Admin-only access to manage member profile records from the MANDO SPORT dashboard.
-- Apply this migration in Supabase SQL Editor.
drop policy if exists "Admins can manage member profiles" on public.member_profiles;
create policy "Admins can manage member profiles"
  on public.member_profiles for all to authenticated
  using (public.is_mando_admin())
  with check (public.is_mando_admin());
grant select, update, delete on public.member_profiles to authenticated;
