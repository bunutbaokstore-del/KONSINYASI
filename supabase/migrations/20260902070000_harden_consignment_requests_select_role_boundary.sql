-- PHASE 3.3
-- Harden Distributor/Admin SELECT role boundary for public.consignment_requests.
-- Forward-only migration: do not modify the original migration.

drop policy if exists "Admin can read workspace consignment requests"
  on public.consignment_requests;

create policy "Admin can read workspace consignment requests"
  on public.consignment_requests
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
