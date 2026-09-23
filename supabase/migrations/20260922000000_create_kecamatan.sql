-- ============================================================================
-- KECAMATAN MASTER DATA
-- Adds kecamatan table and links desa.kecamatan_id
-- Forward-only, idempotent, master data BPS (global select)
-- ============================================================================

-- ============================================================================
-- 1. CREATE TABLE: kecamatan
-- ============================================================================
create table if not exists public.kecamatan (
  id uuid not null default gen_random_uuid(),
  kabupaten_kota_id uuid not null references public.kabupaten_kota(id) on delete restrict,
  kode_bps varchar(6) not null,
  nama varchar(120) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kecamatan_pkey primary key (id),
  constraint kecamatan_kode_bps_unique unique (kode_bps),
  constraint kecamatan_kabupaten_nama_unique unique (kabupaten_kota_id, nama)
);

-- Index for common queries
create index if not exists kecamatan_kabupaten_active_idx
  on public.kecamatan (kabupaten_kota_id, is_active);

-- ============================================================================
-- 2. RLS: Master data BPS - global select for authenticated
-- ============================================================================
alter table public.kecamatan enable row level security;

drop policy if exists "kecamatan_global_select" on public.kecamatan;
create policy "kecamatan_global_select" on public.kecamatan
  for select to authenticated using (true);

-- ============================================================================
-- 3. PRIVILEGES: Master GEO pattern - minimum privileges
-- ============================================================================
-- authenticated: SELECT only (minimum privilege)
grant select on public.kecamatan to authenticated;
-- service_role: ALL (for admin operations, seed scripts)
grant all on public.kecamatan to service_role;

-- ============================================================================
-- 4. ALTER TABLE: desa - add kecamatan_id (nullable for backfill phase)
-- ============================================================================
alter table public.desa
  add column if not exists kecamatan_id uuid;

-- Idempotent FK creation (PostgreSQL does not support ADD CONSTRAINT IF NOT EXISTS)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'desa_kecamatan_fk'
      and conrelid = 'public.desa'::regclass
  ) then
    alter table public.desa
      add constraint desa_kecamatan_fk
      foreign key (kecamatan_id) references public.kecamatan(id) on delete restrict;
  end if;
end $$;

-- Index for join performance
create index if not exists desa_kecamatan_idx
  on public.desa (kecamatan_id);