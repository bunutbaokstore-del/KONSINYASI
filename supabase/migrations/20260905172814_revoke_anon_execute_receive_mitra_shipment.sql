-- PHASE 3D.1 — Security fix: authenticated Distributor RPC entry point
-- Privilege-only patch. Business logic and data are unchanged.

revoke execute on function public.receive_mitra_shipment(uuid) from public;
revoke execute on function public.receive_mitra_shipment(uuid) from anon;
grant execute on function public.receive_mitra_shipment(uuid) to authenticated;
