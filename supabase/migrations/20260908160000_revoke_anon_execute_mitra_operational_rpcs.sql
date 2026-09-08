-- PHASE 5 OPEN-3
-- Revoke anonymous EXECUTE on the operational SECURITY DEFINER RPCs that mutate
-- mitra shipment and production stock. Supabase base-schema default ACLs grant
-- EXECUTE to anon on newly created functions, so an explicit revoke is required
-- (same pattern as 20260905172814 for receive_mitra_shipment). The official
-- tRPC path calls these RPCs as the authenticated Mitra, so authenticated and
-- service_role EXECUTE are intentionally left intact. Forward-only.

revoke execute
  on function public.ship_mitra_shipment(uuid)
  from anon;

revoke execute
  on function public.complete_mitra_production_event(
    uuid,
    integer,
    integer,
    numeric,
    text
  )
  from anon;