-- =============================================================================
-- GEO MASTER (GLOBAL) & WILAYAH_DESA — DESIGN B
-- Source of truth: konsinyasi.dbml v1.5 (section 2) + FINAL GEO MIGRATION DESIGN AUDIT.
-- Strategy (additive-only, forward-only, idempotent, NO data changes):
--   1. Enum kabupaten_kota_tipe (idempotent DO block)
--   2. Create global geo master: provinsi -> kabupaten_kota -> desa
--   3. ALTER wilayah: add UNIQUE (distributor_id, id) as composite-FK target
--   4. Create tenanted junction wilayah_desa (+ all FKs / unique constraints / indexes)
--   5. RLS: geo master read-only (SELECT only, no authenticated writes); wilayah_desa tenant-scoped
--   6. Revokes: geo master writable by nobody except owner
--
-- DESIGN B (LOCKED): NO wilayah.provinsi_id, NO wilayah.kabupaten_kota_id, NO kecamatan.
-- Geo master is GLOBAL (no distributor_id). wilayah/rute/outlet tables NOT modified
-- (only the additive UNIQUE target constraint on wilayah). No BPS seed data.
-- =============================================================================

-- =============================================================================
-- 1. ENUM KABUPATEN_KOTA_TIPE
-- =============================================================================
do $$ begin
  if not exists (select 1 from pg_type where typname = 'kabupaten_kota_tipe') then
    create type public.kabupaten_kota_tipe as enum ('KABUPATEN', 'KOTA');
  end if;
end $$;

-- =============================================================================
-- 2. GEO MASTER (GLOBAL) — provinsi -> kabupaten_kota -> desa
-- =============================================================================

-- 2.1 PROVINSI
create table if not exists public.provinsi (
  id uuid not null default gen_random_uuid(),
  kode_bps varchar(2) not null,
  nama varchar(120) not null,
  ibukota varchar(120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provinsi_pkey primary key (id),
  constraint provinsi_kode_bps_unique unique (kode_bps)
);

-- 2.2 KABUPATEN_KOTA
create table if not exists public.kabupaten_kota (
  id uuid not null default gen_random_uuid(),
  provinsi_id uuid not null,
  kode_bps varchar(4) not null,
  nama varchar(120) not null,
  tipe public.kabupaten_kota_tipe not null,
  ibukota varchar(120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kabupaten_kota_pkey primary key (id),
  constraint kabupaten_kota_kode_bps_unique unique (kode_bps),
  constraint kabupaten_kota_provinsi_fk foreign key (provinsi_id)
    references public.provinsi (id) on delete restrict
);

create index if not exists kabupaten_kota_provinsi_active_idx
  on public.kabupaten_kota (provinsi_id, is_active);

-- 2.3 DESA
create table if not exists public.desa (
  id uuid not null default gen_random_uuid(),
  kabupaten_kota_id uuid not null,
  kode_bps varchar(10) not null,
  nama varchar(120) not null,
  kode_pos varchar(10),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint desa_pkey primary key (id),
  constraint desa_kode_bps_unique unique (kode_bps),
  constraint desa_kabupaten_kota_fk foreign key (kabupaten_kota_id)
    references public.kabupaten_kota (id) on delete restrict
);

create index if not exists desa_kabupaten_kota_active_idx
  on public.desa (kabupaten_kota_id, is_active);

-- =============================================================================
-- 3. WILAYAH — ADD COMPOSITE-FK TARGET UNIQUE (distributor_id, id)
--    Safe on existing rows: id is PK, so (distributor_id, id) is trivially unique.
--    Idempotent guard: skip if the constraint already exists.
-- =============================================================================
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'wilayah_tenant_unique' and conrelid = 'public.wilayah'::regclass
  ) then
    alter table public.wilayah
      add constraint wilayah_tenant_unique unique (distributor_id, id);
  end if;
end $$;

-- =============================================================================
-- 4. WILAYAH_DESA (TENANTED JUNCTION)
--    1 Desa = maksimal 1 Wilayah per Distributor.
--    Composite FK (SQL-only in DBML):
--      (distributor_id, wilayah_id) -> wilayah (distributor_id, id) ON DELETE RESTRICT
--      No cross-tenant assignment possible (wilayah must share distributor_id).
-- =============================================================================
create table if not exists public.wilayah_desa (
  id uuid not null default gen_random_uuid(),
  distributor_id uuid not null,
  wilayah_id uuid not null,
  desa_id uuid not null,
  assigned_at timestamptz not null default now(),
  assigned_by uuid not null,
  created_at timestamptz not null default now(),
  constraint wilayah_desa_pkey primary key (id),
  constraint wilayah_desa_distributor_fk foreign key (distributor_id)
    references public.distributors (id) on delete restrict,
  constraint wilayah_desa_desa_fk foreign key (desa_id)
    references public.desa (id) on delete restrict,
  constraint wilayah_desa_assigned_by_fk foreign key (assigned_by)
    references public.users (id) on delete restrict,
  constraint wilayah_desa_wilayah_tenant_fk foreign key (distributor_id, wilayah_id)
    references public.wilayah (distributor_id, id) on delete restrict,
  constraint wilayah_desa_distributor_desa_unique unique (distributor_id, desa_id),
  constraint wilayah_desa_wilayah_desa_unique unique (wilayah_id, desa_id)
);

create index if not exists wilayah_desa_distributor_wilayah_idx
  on public.wilayah_desa (distributor_id, wilayah_id);

-- =============================================================================
-- 5. ROW LEVEL SECURITY
--    Geo master: GLOBAL read — authenticated may SELECT only. NO write policies.
--    wilayah_desa: tenant-scoped (mirror of wilayah RLS in v14).
-- =============================================================================

-- 5.1 PROVINSI
alter table public.provinsi enable row level security;
drop policy if exists provinsi_global_select on public.provinsi;
create policy provinsi_global_select on public.provinsi for select to authenticated
  using (true);

-- 5.2 KABUPATEN_KOTA
alter table public.kabupaten_kota enable row level security;
drop policy if exists kabupaten_kota_global_select on public.kabupaten_kota;
create policy kabupaten_kota_global_select on public.kabupaten_kota for select to authenticated
  using (true);

-- 5.3 DESA
alter table public.desa enable row level security;
drop policy if exists desa_global_select on public.desa;
create policy desa_global_select on public.desa for select to authenticated
  using (true);

-- 5.4 WILAYAH_DESA (tenant-scoped; mirrors wilayah RLS pattern)
alter table public.wilayah_desa enable row level security;
drop policy if exists wilayah_desa_tenant_select on public.wilayah_desa;
create policy wilayah_desa_tenant_select on public.wilayah_desa for select to authenticated
  using (
    distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_sys_admin'
  );

drop policy if exists wilayah_desa_admin_insert on public.wilayah_desa;
create policy wilayah_desa_admin_insert on public.wilayah_desa for insert to authenticated
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'distributor')
    and distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
    and assigned_by = auth.uid()
  );

drop policy if exists wilayah_desa_admin_update on public.wilayah_desa;
create policy wilayah_desa_admin_update on public.wilayah_desa for update to authenticated
  using (distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id'));

-- No DELETE policy anywhere (business domain has no DELETEs; soft state via is_active/ended_at).

-- =============================================================================
-- 6. REVOKES — GEO MASTER WRITE DENIED FOR AUTHENTICATED
--    Geo master is read-only for authenticated; writes only by owner (future RPC / backfill).
-- =============================================================================
revoke insert, update, delete on public.provinsi from anon, authenticated;
revoke insert, update, delete on public.kabupaten_kota from anon, authenticated;
revoke insert, update, delete on public.desa from anon, authenticated;