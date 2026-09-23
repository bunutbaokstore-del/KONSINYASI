-- ============================================================================
-- FIX KECAMATAN PRIVILEGES
-- Corrects over-granted privileges on public.kecamatan
-- Forward-only, idempotent
-- ============================================================================

-- Revoke excessive privileges from anon and authenticated
revoke all on public.kecamatan from anon;
revoke all on public.kecamatan from authenticated;

-- Grant minimum necessary privileges
-- authenticated: SELECT only (master data global read)
grant select on public.kecamatan to authenticated;

-- service_role: ALL (admin operations, seed scripts)
grant all on public.kecamatan to service_role;

-- Note: anon receives no privileges on kecamatan (master data global, RLS handles access)
-- This follows the minimum privilege principle for master data BPS tables