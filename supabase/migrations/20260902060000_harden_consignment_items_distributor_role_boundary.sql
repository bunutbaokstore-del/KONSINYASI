-- PHASE 3.2E
-- Harden Distributor/Admin SELECT role boundary for public.consignment_items.
-- Forward migration: do not modify the original migration.

drop policy if exists "Distributor and admin can read consignment items"
  on public.consignment_items;

create policy "Distributor and admin can read consignment items"
  on public.consignment_items
  for select
  to authenticated
  using (
    (
      auth.jwt() -> 'app_metadata' ->> 'role' = 'distributor'
      and auth.uid() = distributor_id
    )
    or (
      auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
      and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
    )
  );
