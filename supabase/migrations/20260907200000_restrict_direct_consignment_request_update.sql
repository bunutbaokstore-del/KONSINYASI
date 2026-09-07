-- PHASE 5 WS-001
-- The review RPC is the only supported path for approving or rejecting requests.
-- Keep supplier INSERT and read policies unchanged.
drop policy if exists "Manager can review tenant consignment requests"
  on public.consignment_requests;
