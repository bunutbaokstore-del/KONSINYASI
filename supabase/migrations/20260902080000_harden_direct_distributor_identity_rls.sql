-- PHASE 3.4
-- Harden direct distributor identity branches for user_profiles,
-- stock_movements, and notifications.
-- Forward-only migration: do not modify the original migrations.

drop policy if exists user_profiles_select_by_workspace
  on public.user_profiles;

create policy user_profiles_select_by_workspace
  on public.user_profiles
  for select to authenticated
  using (
    user_id = auth.uid()
    or (
      auth.jwt() -> 'app_metadata' ->> 'role' = 'distributor'
      and distributor_id = auth.uid()
    )
    or (
      auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
      and distributor_id::text = auth.jwt() -> 'app_metadata' ->> 'distributor_id'
    )
  );


drop policy if exists "Manager can read workspace stock movements"
  on public.stock_movements;

create policy "Manager can read workspace stock movements"
  on public.stock_movements
  for select to authenticated
  using (
    (
      auth.jwt() -> 'app_metadata' ->> 'role' = 'distributor'
      and auth.uid() = distributor_id
    )
    or (
      auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
      and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
    )
  );


drop policy if exists "Managers can read workspace notifications"
  on public.notifications;

create policy "Managers can read workspace notifications"
  on public.notifications
  for select to authenticated
  using (
    (
      auth.jwt() -> 'app_metadata' ->> 'role' = 'distributor'
      and auth.uid() = distributor_id
    )
    or (
      auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
      and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
    )
  );
