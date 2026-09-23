-- =============================================================================
-- IDENTITY MIRROR BACKFILL: auth.users -> public.distributors + public.users
--
-- Forward-only + idempotent. Source of truth stays auth.users:
--   - app_metadata.role           (lowercase metadata role)
--   - app_metadata.distributor_id (tenant; NULL for sys_admin, self for distributor)
--   - app_metadata.status         (active | disabled)
--   - raw_user_meta_data.full_name (display name, with email/ID fallback)
--
-- Mapping metadata role -> public.user_role enum:
--   distributor -> DISTRIBUTOR, admin -> ADMIN, sales_motoris -> SALES_MOTORIS,
--   hrd -> HRD, supervisor -> SUPERVISOR, mitra_umkm -> MITRA_UMKM,
--   sys_admin -> PLATFORM_SYS_ADMIN
--
-- POINTS OF DISCIPLINE (per provisioning audit A-L):
--   - Does NOT mirror credentials (no password/crypto fields are selected).
--   - Keeps the documented divergence: metadata role 'sys_admin' maps to
--     user_role enum member 'PLATFORM_SYS_ADMIN' (no ALTER TYPE role).
--   - Does NOT create a trigger on auth.users.
--   - Does NOT change business workflows (approval/stock/finalize flows untouched).
--   - No credentials/user_profiles/KTP writes; mirror only (name, email, phone, role).
--   - Re-runnable: ON CONFLICT (id) DO NOTHING.
-- =============================================================================

-- =============================================================================
-- 1. PUBLIC.DISTRIBUTORS (one row per distributor account; superset of tenants)
-- =============================================================================
insert into public.distributors (id, name, code, is_active, created_at, updated_at)
select
  u.id,
  coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(u.email), ''),
    'Distributor-' || left(u.id::text, 8)
  ),
  null,
  coalesce(u.raw_app_meta_data ->> 'status', 'active') <> 'disabled',
  now(),
  now()
from auth.users u
where u.raw_app_meta_data ->> 'role' = 'distributor'
on conflict (id) do nothing;

-- =============================================================================
-- 2. PUBLIC.USERS (identity mirror; one row per known-role identity)
--    FK ordering note: STEP 1 runs before STEP 2 so users.distributor_id always
--    references a distributors row (self for distributor role, NULL for sys_admin).
-- =============================================================================
insert into public.users (id, distributor_id, name, email, phone, role, is_active, created_at, updated_at)
select
  u.id,
  case
    when u.raw_app_meta_data ->> 'role' = 'distributor' then u.id
    when u.raw_app_meta_data ->> 'role' = 'sys_admin' then null
    when (u.raw_app_meta_data ->> 'distributor_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (u.raw_app_meta_data ->> 'distributor_id')::uuid
    else null
  end,
  coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(u.email), ''),
    'Pengguna-' || left(u.id::text, 8)
  ),
  u.email,
  nullif(btrim(u.raw_user_meta_data ->> 'phone'), ''),
  case u.raw_app_meta_data ->> 'role'
    when 'distributor' then 'DISTRIBUTOR'::public.user_role
    when 'admin' then 'ADMIN'::public.user_role
    when 'sales_motoris' then 'SALES_MOTORIS'::public.user_role
    when 'hrd' then 'HRD'::public.user_role
    when 'supervisor' then 'SUPERVISOR'::public.user_role
    when 'mitra_umkm' then 'MITRA_UMKM'::public.user_role
    when 'sys_admin' then 'PLATFORM_SYS_ADMIN'::public.user_role
  end,
  coalesce(u.raw_app_meta_data ->> 'status', 'active') <> 'disabled',
  now(),
  now()
from auth.users u
where u.raw_app_meta_data ->> 'role' in (
  'distributor', 'admin', 'sales_motoris', 'hrd', 'supervisor', 'mitra_umkm', 'sys_admin'
)
on conflict (id) do nothing;