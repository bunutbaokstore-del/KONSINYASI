-- PHASE 5 WS-001
-- Remove the remaining direct UPDATE policy.
drop policy if exists "Distributor can review workspace consignment requests"
  on public.consignment_requests;
