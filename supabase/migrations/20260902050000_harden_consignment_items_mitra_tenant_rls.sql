-- PHASE 3.2C
-- Harden Mitra tenant isolation for public.consignment_items.
-- Forward migration: do not modify the original migration.

drop policy if exists "Mitra can read own consignment items"
  on public.consignment_items;

drop policy if exists "Mitra can insert own consignment items"
  on public.consignment_items;

drop policy if exists "Mitra can update own consignment items"
  on public.consignment_items;

drop policy if exists "Mitra can delete own consignment items"
  on public.consignment_items;

create policy "Mitra can read own consignment items"
  on public.consignment_items
  for select
  to authenticated
  using (
    auth.uid() = mitra_user_id
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'mitra_umkm'
    and public.current_tenant_id() = distributor_id
  );

create policy "Distributor and admin can read consignment items"
  on public.consignment_items
  for select
  to authenticated
  using (
    auth.uid() = distributor_id
    or (
      coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'distributor')
      and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
    )
  );

create policy "Mitra can insert own consignment items"
  on public.consignment_items
  for insert
  to authenticated
  with check (
    auth.uid() = mitra_user_id
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'mitra_umkm'
    and public.current_tenant_id() = distributor_id
  );

create policy "Mitra can update own consignment items"
  on public.consignment_items
  for update
  to authenticated
  using (
    auth.uid() = mitra_user_id
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'mitra_umkm'
    and public.current_tenant_id() = distributor_id
  )
  with check (
    auth.uid() = mitra_user_id
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'mitra_umkm'
    and public.current_tenant_id() = distributor_id
  );

create policy "Mitra can delete own consignment items"
  on public.consignment_items
  for delete
  to authenticated
  using (
    auth.uid() = mitra_user_id
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'mitra_umkm'
    and public.current_tenant_id() = distributor_id
  );