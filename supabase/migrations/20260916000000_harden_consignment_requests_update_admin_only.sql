-- SEC-01: Harden UPDATE authorization on public.consignment_requests.
--
-- Only an Admin may UPDATE a request, and only inside their own tenant
-- workspace: the row's distributor_id must equal the JWT
-- app_metadata.distributor_id claim of the authenticated Admin.
-- Distributor and Mitra UMKM cannot UPDATE. Moving a request to another
-- tenant is blocked twice: by this policy's WITH CHECK and by the existing
-- consignment_requests_immutable_scope trigger.
--
-- The official decision mechanism remains the service-role-only
-- SECURITY DEFINER RPC public.admin_review_consignment_request(...);
-- its grants are not touched here and table-level RLS cannot interfere
-- with it while it executes under that role.
--
-- Forward-only + idempotent. Does not modify older migrations, data,
-- triggers, SELECT/INSERT policies, or any RPC body.

drop policy if exists "Manager can review tenant consignment requests"
  on public.consignment_requests;

drop policy if exists "Distributor can review workspace consignment requests"
  on public.consignment_requests;

drop policy if exists "Admin can review workspace consignment requests"
  on public.consignment_requests;

create policy "Admin can update tenant consignment requests"
  on public.consignment_requests
  for update
  to authenticated
  using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
  )
  with check (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
  );

-- Defense-in-depth: anonymous clients never need UPDATE on this table.
revoke update on public.consignment_requests from anon;