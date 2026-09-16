-- =============================================================================
-- CONSIGNMENT DOMAIN v1.4 — FULL SCHEMA REALIZATION
-- Source of truth: konsinyasi.dbml v1.4 (837 lines, 27 tables, 19 enums)
-- Strategy:
--   1. Create 19 enum types (idempotent DO blocks)
--   2. Create new base tables: distributors, users
--   3. ALTER existing products/distributor_stock to match DBML v1.4 (non-destructive)
--   4. Drop superseded distribution tables (from unapplied 20260915595958) if present
--   5. Create all distribution tables per DBML v1.4
--   6. Create visit, transaction, payment, stock movement tables
--   7. RLS policies (tenant-scoped SELECT; writes via RPC)
--   8. Triggers (visit active-assignment guard)
--   9. RPCs (finalized_visit, checkin_validate, settle_receivable, SJ chain, assign)
--  10. Storage buckets
--  11. Grants / Revokes
--
-- CONFLICT RESOLUTION:
--   - products: ALTER ADD COLUMN (is_active, selling_price NOT NULL)
--   - distributor_stock: RENAME available_quantity → quantity, TYPE numeric(18,3)
--   - Old wilayah/rute/outlet/assignments: DROP IF EXISTS then CREATE per DBML
--   - Old assign RPCs/functions: DROP IF EXISTS then RECREATE per DBML
--
-- This migration does NOT drop products or distributor_stock (live data).
-- Destructive ops limited to superseded unapplied distribution structure.
-- =============================================================================

-- =============================================================================
-- SECTION 1: ENUM TYPES (19 total, idempotent)
-- =============================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum (
      'DISTRIBUTOR','ADMIN','SALES_MOTORIS','HRD','SUPERVISOR','MITRA_UMKM','PLATFORM_SYS_ADMIN'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'outlet_status') then
    create type public.outlet_status as enum ('ACTIVE','INACTIVE');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'sj_direction') then
    create type public.sj_direction as enum ('GUDANG_TO_SALES','SALES_TO_GUDANG');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'sj_status') then
    create type public.sj_status as enum (
      'DRAFT','READY','CHECKED','DISCREPANCY','CONFIRMED','RETURN_CONFIRMED','COMPLETED','CANCELLED'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'sj_movement_type') then
    create type public.sj_movement_type as enum ('SJ_OUT','SJ_RETURN');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'visit_status') then
    create type public.visit_status as enum ('DRAFT','CHECKED_IN','FINALIZED','CANCELLED');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'checkin_attempt_status') then
    create type public.checkin_attempt_status as enum ('REJECTED');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'card_status') then
    create type public.card_status as enum ('DRAFT','APPLIED');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'visit_condition') then
    create type public.visit_condition as enum (
      'TOKO_BARU','TOKO_BUKA','TOKO_TUTUP','MASIH_STOK','TOKO_NONAKTIF'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'transaction_status') then
    create type public.transaction_status as enum ('LUNAS','KONSINYASI');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum ('LUNAS','SEBAGIAN','PIUTANG');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type public.payment_method as enum ('CASH','TRANSFER','QRIS','LAINNYA');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'receivable_status') then
    create type public.receivable_status as enum ('OPEN','PARTIAL','PAID');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'ownership_type') then
    create type public.ownership_type as enum ('KONSINYASI','MILIK_OUTLET');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'movement_type') then
    create type public.movement_type as enum (
      'ADD_IN','RESTOCK_IN','SALES_OUT','RETURN_OUT','OWNERSHIP_TRANSFER'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'document_type') then
    create type public.document_type as enum (
      'STRUK_LUNAS','STRUK_SERAH_TERIMA','STRUK_KONSINYASI','NOTA_KONSINYASI_NONAKTIF',
      'SURAT_JALAN','KWITANSI','INVOICE','LAINNYA'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'photo_type') then
    create type public.photo_type as enum ('FOTO_DEPAN_OUTLET','FOTO_PRODUK','FOTO_AKHIR','LAINNYA');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'event_type') then
    create type public.event_type as enum (
      'VISIT_CREATED','VISIT_CHECKED_IN','CARD_APPLIED','VISIT_FINALIZED',
      'VISIT_CANCELLED','PAYMENT_RECORDED','RECEIVABLE_SETTLED'
    );
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'sj_event_type') then
    create type public.sj_event_type as enum (
      'SJ_CREATED','SJ_READY','SJ_CHECKED','SJ_DISCREPANCY','SJ_CONFIRMED',
      'SJ_RETURN_CONFIRMED','SJ_COMPLETED','SJ_CANCELLED'
    );
  end if;
end $$;

-- =============================================================================
-- SECTION 2: DROP SUPERSEDED OBJECTS (from unapplied 20260915595958)
-- =============================================================================

drop function if exists public.assign_outlet_to_rute(uuid,uuid,uuid,uuid) cascade;
drop function if exists public.assign_sales_to_rute(uuid,uuid,uuid,uuid) cascade;
drop function if exists public.validate_sales_assignment() cascade;
drop trigger if exists trg_validate_sales_assignment on public.rute_sales_assignments;
drop table if exists public.assignment_history cascade;
drop table if exists public.rute_sales_assignments cascade;
drop table if exists public.rute_outlet_assignments cascade;
drop table if exists public.outlet cascade;
drop table if exists public.rute cascade;
drop table if exists public.wilayah cascade;

-- =============================================================================
-- SECTION 3: BASE TABLES — distributors, users
-- =============================================================================

create table if not exists public.distributors (
  id uuid primary key references auth.users(id) on delete restrict,
  name varchar not null,
  code varchar,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists distributors_code_unique_idx
  on public.distributors (lower(btrim(code))) where code is not null;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete restrict,
  distributor_id uuid references public.distributors(id) on delete restrict,
  name varchar not null,
  email varchar,
  phone varchar,
  role public.user_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_distributor_role_idx
  on public.users (distributor_id, role);

-- =============================================================================
-- SECTION 4: ALTER EXISTING TABLES (non-destructive)
-- =============================================================================

-- products: add is_active, enforce selling_price NOT NULL + DEFAULT 0
alter table public.products
  add column if not exists is_active boolean not null default true;

-- Backfill is_active from lifecycle_status where data exists
update public.products set is_active = (lifecycle_status = 'active') where is_active is distinct from (lifecycle_status = 'active');

alter table public.products
  alter column selling_price set default 0;

-- Backfill null selling_price
update public.products set selling_price = 0 where selling_price is null;

alter table public.products
  alter column selling_price set not null;

-- SKU should be NOT NULL per DBML; backfill null/empty with a unique value
update public.products set sku = 'SKU-' || left(replace(id::text, '-', ''), 8)
  where sku is null or btrim(sku) = '';
alter table public.products
  alter column sku set not null;

-- Add unique index per DBML (distributor_id, sku) — replaces legacy partial index
drop index if exists public.products_distributor_sku_unique_idx;
create unique index if not exists products_distributor_sku_unique
  on public.products (distributor_id, lower(btrim(sku)));

-- DBML RLS: sales_motoris tenant tsb wajib bisa SELECT products (muatan produk)
drop policy if exists products_sales_motoris_select on public.products;
create policy products_sales_motoris_select on public.products for select to authenticated
  using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'sales_motoris'
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
  );

-- distributor_stock: rename available_quantity → quantity, widen to decimal(18,3)
-- Only execute if old column name exists (migration not yet applied)
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'distributor_stock' and column_name = 'available_quantity'
  ) then
    alter table public.distributor_stock rename column available_quantity to quantity;
  end if;
end $$;

alter table public.distributor_stock
  alter column quantity type numeric(18,3) using quantity::numeric(18,3);

alter table public.distributor_stock
  alter column quantity set not null,
  alter column quantity set default 0;

-- Ensure CHECK (quantity >= 0) exists — rename preserves inline check, but add explicit for safety
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'distributor_stock_quantity_nonneg'
  ) then
    alter table public.distributor_stock
      add constraint distributor_stock_quantity_nonneg check (quantity >= 0);
  end if;
end $$;

-- =============================================================================
-- SECTION 5: DISTRIBUTION STRUCTURE (per DBML v1.4)
-- =============================================================================

-- 5.1 WILAYAH
create table public.wilayah (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete restrict,
  kode varchar not null,
  nama varchar not null,
  keterangan text,
  is_active boolean not null default true,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wilayah_distributor_kode_unique unique (distributor_id, kode)
);

create index if not exists wilayah_distributor_active_idx
  on public.wilayah (distributor_id, is_active);

-- 5.2 RUTE
create table public.rute (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete restrict,
  wilayah_id uuid not null references public.wilayah(id) on delete restrict,
  kode varchar not null,
  nama varchar not null,
  keterangan text,
  is_active boolean not null default true,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rute_distributor_kode_unique unique (distributor_id, kode)
);

create index if not exists rute_distributor_wilayah_active_idx
  on public.rute (distributor_id, wilayah_id, is_active);

-- 5.3 OUTLETS (renamed from outlet per DBML v1.4)
create table public.outlets (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete restrict,
  kode varchar not null,
  nama varchar not null,
  nama_pemilik varchar,
  no_hp varchar,
  alamat text,
  latitude decimal(10,7),
  longitude decimal(10,7),
  gps_radius_m integer not null default 100,
  status public.outlet_status not null default 'ACTIVE',
  foto_depan_url text,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outlets_distributor_kode_unique unique (distributor_id, kode)
);

create index if not exists outlets_distributor_status_idx
  on public.outlets (distributor_id, status);

-- 5.4 RUTE_OUTLET_ASSIGNMENTS
create table public.rute_outlet_assignments (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete restrict,
  rute_id uuid not null references public.rute(id) on delete restrict,
  outlet_id uuid not null references public.outlets(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  assigned_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create unique index roa_one_active_idx
  on public.rute_outlet_assignments (distributor_id, outlet_id)
  where ended_at is null;

create index if not exists roa_distributor_rute_idx
  on public.rute_outlet_assignments (distributor_id, rute_id);

-- 5.5 RUTE_SALES_ASSIGNMENTS
create table public.rute_sales_assignments (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete restrict,
  rute_id uuid not null references public.rute(id) on delete restrict,
  sales_id uuid not null references public.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  assigned_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create unique index rsa_one_active_idx
  on public.rute_sales_assignments (distributor_id, sales_id)
  where ended_at is null;

create index if not exists rsa_distributor_rute_idx
  on public.rute_sales_assignments (distributor_id, rute_id);

-- 5.6 ASSIGNMENT_HISTORY
create table public.assignment_history (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete restrict,
  entity_type varchar not null,
  entity_id uuid not null,
  from_rute_id uuid references public.rute(id) on delete set null,
  to_rute_id uuid references public.rute(id) on delete set null,
  action varchar not null,
  changed_by uuid not null references public.users(id) on delete restrict,
  changed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists ah_entity_idx
  on public.assignment_history (distributor_id, entity_type, entity_id, changed_at desc);

create index if not exists ah_to_rute_idx
  on public.assignment_history (distributor_id, to_rute_id, changed_at desc);

create index if not exists ah_from_rute_idx
  on public.assignment_history (distributor_id, from_rute_id, changed_at desc);

-- =============================================================================
-- SECTION 6: STOCK TABLES (sales_stock, outlet_stock)
-- =============================================================================

-- 6.1 SALES_STOCK
create table public.sales_stock (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete restrict,
  sales_id uuid not null references public.users(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(18,3) not null default 0,
  updated_at timestamptz not null default now(),
  constraint sales_stock_qty_nonneg check (quantity >= 0),
  constraint sales_stock_sales_product_unique unique (sales_id, product_id)
);

create index if not exists sales_stock_distributor_product_idx
  on public.sales_stock (distributor_id, product_id);

-- 6.2 OUTLET_STOCK
create table public.outlet_stock (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete restrict,
  outlet_id uuid not null references public.outlets(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(18,3) not null default 0,
  ownership_type public.ownership_type not null,
  updated_at timestamptz not null default now(),
  constraint outlet_stock_qty_nonneg check (quantity >= 0),
  constraint outlet_stock_unique unique (outlet_id, product_id, ownership_type)
);

create index if not exists outlet_stock_distributor_product_idx
  on public.outlet_stock (distributor_id, product_id);

-- =============================================================================
-- SECTION 7: SURAT JALAN (WORKFLOW 1)
-- =============================================================================

-- 7.1 SURAT_JALAN
create table public.surat_jalan (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete restrict,
  sj_number varchar not null,
  direction public.sj_direction not null,
  sales_id uuid not null references public.users(id) on delete restrict,
  status public.sj_status not null default 'DRAFT',
  sj_date date not null,
  notes text,
  has_discrepancy boolean not null default false,
  resolved_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint surat_jalan_distributor_sj_number_unique unique (distributor_id, sj_number)
);

create index if not exists sj_sales_date_idx
  on public.surat_jalan (sales_id, sj_date);

create index if not exists sj_distributor_status_idx
  on public.surat_jalan (distributor_id, status);

-- 7.2 SURAT_JALAN_ITEMS
create table public.surat_jalan_items (
  id uuid primary key default gen_random_uuid(),
  surat_jalan_id uuid not null references public.surat_jalan(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  expected_qty numeric(18,3) not null default 0,
  actual_qty numeric(18,3),
  physical_check_qty numeric(18,3),
  final_qty numeric(18,3),
  is_discrepancy boolean not null default false,
  discrepancy_reason text,
  resolved_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sj_items_unique unique (surat_jalan_id, product_id)
);

create index if not exists sj_items_product_idx
  on public.surat_jalan_items (product_id);

-- 7.3 SURAT_JALAN_STOCK_MOVEMENTS
create table public.surat_jalan_stock_movements (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete restrict,
  surat_jalan_id uuid not null references public.surat_jalan(id) on delete restrict,
  surat_jalan_item_id uuid not null references public.surat_jalan_items(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type public.sj_movement_type not null,
  quantity numeric(18,3) not null,
  prev_source_stock numeric(18,3),
  prev_target_stock numeric(18,3),
  note text,
  posted_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint sj_movements_qty_positive check (quantity > 0),
  constraint sj_movements_idempotent unique (surat_jalan_id, surat_jalan_item_id, movement_type)
);

create index if not exists sj_movements_distributor_product_idx
  on public.surat_jalan_stock_movements (distributor_id, product_id, created_at);

create index if not exists sj_movements_sj_idx
  on public.surat_jalan_stock_movements (surat_jalan_id);

-- 7.4 SURAT_JALAN_EVENTS
create table public.surat_jalan_events (
  id uuid primary key default gen_random_uuid(),
  surat_jalan_id uuid not null references public.surat_jalan(id) on delete restrict,
  event_type public.sj_event_type not null,
  actor_id uuid not null references public.users(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sj_events_sj_created_idx
  on public.surat_jalan_events (surat_jalan_id, created_at);

-- =============================================================================
-- SECTION 8: VISITS (WORKFLOW 2)
-- =============================================================================

-- 8.1 VISITS
create table public.visits (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete restrict,
  outlet_id uuid not null references public.outlets(id) on delete restrict,
  sales_id uuid not null references public.users(id) on delete restrict,
  rute_id uuid not null references public.rute(id) on delete restrict,
  visit_date date not null,
  status public.visit_status not null default 'DRAFT',
  transaction_status public.transaction_status,
  checkin_at timestamptz,
  checkin_latitude decimal(10,7),
  checkin_longitude decimal(10,7),
  checkout_at timestamptz,
  notes text,
  finalized_at timestamptz,
  finalized_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists visits_sales_date_idx
  on public.visits (sales_id, visit_date);

create index if not exists visits_outlet_date_idx
  on public.visits (outlet_id, visit_date);

create index if not exists visits_distributor_status_idx
  on public.visits (distributor_id, status);

-- F1: PARTIAL UNIQUE — one active visit per sales
create unique index visits_one_active_per_sales_idx
  on public.visits (distributor_id, sales_id)
  where status in ('DRAFT', 'CHECKED_IN');

-- 8.2 VISIT_CHECKIN_ATTEMPTS (F4)
create table public.visit_checkin_attempts (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete restrict,
  sales_id uuid not null references public.users(id) on delete restrict,
  outlet_id uuid not null references public.outlets(id) on delete restrict,
  rute_id uuid references public.rute(id) on delete set null,
  attempted_at timestamptz not null default now(),
  latitude decimal(10,7),
  longitude decimal(10,7),
  gps_radius_m integer not null,
  distance_m decimal(10,2) not null,
  rejection_reason text not null,
  status public.checkin_attempt_status not null default 'REJECTED',
  created_at timestamptz not null default now()
);

create index if not exists cia_sales_attempted_idx
  on public.visit_checkin_attempts (sales_id, attempted_at);

create index if not exists cia_outlet_attempted_idx
  on public.visit_checkin_attempts (outlet_id, attempted_at);

create index if not exists cia_distributor_attempted_idx
  on public.visit_checkin_attempts (distributor_id, attempted_at);

create index if not exists cia_status_attempted_idx
  on public.visit_checkin_attempts (status, attempted_at);

-- =============================================================================
-- SECTION 9: VISIT PRODUCT CARDS
-- =============================================================================

create table public.visit_product_cards (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  status public.card_status not null default 'DRAFT',
  condition public.visit_condition not null,

  stock_before numeric(18,3) not null default 0,
  physical_check numeric(18,3) not null default 0,
  add_qty numeric(18,3) not null default 0,
  restock_qty numeric(18,3) not null default 0,
  old_sales_qty numeric(18,3) not null default 0,
  sales_qty numeric(18,3) not null default 0,
  return_qty numeric(18,3) not null default 0,
  stock_after numeric(18,3) not null default 0,

  selling_price decimal(18,2) not null default 0,
  payment_status public.payment_status,
  amount_due decimal(18,2) not null default 0,
  amount_paid decimal(18,2) not null default 0,

  alasan text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint vpc_stock_before_nonneg check (stock_before >= 0),
  constraint vpc_physical_check_nonneg check (physical_check >= 0),
  constraint vpc_add_qty_nonneg check (add_qty >= 0),
  constraint vpc_restock_qty_nonneg check (restock_qty >= 0),
  constraint vpc_old_sales_qty_nonneg check (old_sales_qty >= 0),
  constraint vpc_sales_qty_nonneg check (sales_qty >= 0),
  constraint vpc_return_qty_nonneg check (return_qty >= 0),
  constraint vpc_stock_after_nonneg check (stock_after >= 0),
  constraint vpc_selling_price_nonneg check (selling_price >= 0),
  constraint vpc_amount_due_nonneg check (amount_due >= 0),
  constraint vpc_amount_paid_nonneg check (amount_paid >= 0)
);

create index if not exists vpc_visit_idx
  on public.visit_product_cards (visit_id);

create index if not exists vpc_product_condition_idx
  on public.visit_product_cards (product_id, condition);

-- =============================================================================
-- SECTION 10: TRANSACTIONS & ITEMS (snapshot/reporting)
-- =============================================================================

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete restrict,
  visit_id uuid not null references public.visits(id) on delete restrict,
  transaction_number varchar not null,
  transaction_status public.transaction_status not null,
  transaction_date date not null,
  total_amount decimal(18,2) not null default 0,
  amount_paid decimal(18,2) not null default 0,
  receivable_amount decimal(18,2) not null default 0,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint transactions_total_nonneg check (total_amount >= 0),
  constraint transactions_paid_nonneg check (amount_paid >= 0),
  constraint transactions_receivable_nonneg check (receivable_amount >= 0),
  constraint transactions_distributor_number_unique unique (distributor_id, transaction_number)
);

create index if not exists transactions_visit_idx
  on public.transactions (visit_id);

create index if not exists transactions_distributor_date_idx
  on public.transactions (distributor_id, transaction_date);

create index if not exists transactions_distributor_status_idx
  on public.transactions (distributor_id, transaction_status);

create table public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete restrict,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  visit_product_card_id uuid not null references public.visit_product_cards(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity decimal(18,3) not null,
  selling_price decimal(18,2) not null,
  discount decimal(18,2) not null default 0,
  line_total decimal(18,2) not null,
  created_at timestamptz not null default now(),

  constraint ti_quantity_positive check (quantity > 0),
  constraint ti_selling_price_nonneg check (selling_price >= 0),
  constraint ti_discount_nonneg check (discount >= 0),
  constraint ti_line_total_nonneg check (line_total >= 0),
  constraint ti_transaction_card_unique unique (transaction_id, visit_product_card_id)
);

create index if not exists ti_transaction_idx
  on public.transaction_items (transaction_id);

create index if not exists ti_product_idx
  on public.transaction_items (product_id);

create index if not exists ti_distributor_product_idx
  on public.transaction_items (distributor_id, product_id, created_at);

-- =============================================================================
-- SECTION 11: VISIT PAYMENTS, RECEIVABLES, PHOTOS, DOCUMENTS
-- =============================================================================

-- 11.1 VISIT_PHOTOS
create table public.visit_photos (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete restrict,
  card_id uuid references public.visit_product_cards(id) on delete set null,
  photo_type public.photo_type not null,
  photo_url text not null,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists vp_visit_idx
  on public.visit_photos (visit_id);

create index if not exists vp_card_idx
  on public.visit_photos (card_id);

-- 11.2 VISIT_DOCUMENTS
create table public.visit_documents (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete restrict,
  card_id uuid references public.visit_product_cards(id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete set null,
  doc_type public.document_type not null,
  file_url text not null,
  note text,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists vd_visit_idx
  on public.visit_documents (visit_id);

create index if not exists vd_card_idx
  on public.visit_documents (card_id);

create index if not exists vd_transaction_idx
  on public.visit_documents (transaction_id);

-- 11.3 VISIT_PAYMENTS
create table public.visit_payments (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete restrict,
  card_id uuid not null references public.visit_product_cards(id) on delete restrict,
  amount decimal(18,2) not null,
  method public.payment_method not null,
  note text,
  received_at timestamptz not null default now(),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint vp_amount_positive check (amount > 0)
);

create index if not exists vpmt_visit_idx
  on public.visit_payments (visit_id);

create index if not exists vpmt_card_idx
  on public.visit_payments (card_id);

-- 11.4 VISIT_RECEIVABLES
create table public.visit_receivables (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete restrict,
  card_id uuid not null references public.visit_product_cards(id) on delete restrict,
  amount decimal(18,2) not null,
  paid_amount decimal(18,2) not null default 0,
  status public.receivable_status not null default 'OPEN',
  due_date date,
  settled_at timestamptz,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint vr_amount_positive check (amount > 0),
  constraint vr_paid_nonneg check (paid_amount >= 0)
);

create index if not exists vr_status_due_idx
  on public.visit_receivables (status, due_date);

create index if not exists vr_visit_idx
  on public.visit_receivables (visit_id);

create index if not exists vr_card_idx
  on public.visit_receivables (card_id);

-- =============================================================================
-- SECTION 12: VISIT STOCK MOVEMENTS & EVENTS
-- =============================================================================

-- 12.1 VISIT_STOCK_MOVEMENTS
create table public.visit_stock_movements (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete restrict,
  visit_id uuid not null references public.visits(id) on delete restrict,
  card_id uuid not null references public.visit_product_cards(id) on delete restrict,
  outlet_id uuid not null references public.outlets(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type public.movement_type not null,
  quantity numeric(18,3) not null,
  prev_sales_stock numeric(18,3),
  prev_outlet_stock numeric(18,3),
  note text,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint vsm_qty_positive check (quantity > 0),
  constraint vsm_card_type_unique unique (card_id, movement_type)
);

create index if not exists vsm_distributor_outlet_product_idx
  on public.visit_stock_movements (distributor_id, outlet_id, product_id, created_at);

create index if not exists vsm_visit_idx
  on public.visit_stock_movements (visit_id);

-- 12.2 VISIT_EVENTS
create table public.visit_events (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete restrict,
  event_type public.event_type not null,
  actor_id uuid not null references public.users(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ve_visit_created_idx
  on public.visit_events (visit_id, created_at);

-- =============================================================================
-- SECTION 13: ROW LEVEL SECURITY
-- =============================================================================

-- Helper: tenant match expression
-- distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')

-- 13.1 Distributors
alter table public.distributors enable row level security;
drop policy if exists distributors_tenant_select on public.distributors;
create policy distributors_tenant_select on public.distributors for select to authenticated
  using (
    id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
    or auth.uid() = id
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_sys_admin'
  );

-- 13.2 Users (app profile)
alter table public.users enable row level security;
drop policy if exists users_self_select on public.users;
create policy users_self_select on public.users for select to authenticated
  using (
    id = auth.uid()
    or distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_sys_admin'
  );

-- 13.3 Wilayah
alter table public.wilayah enable row level security;
drop policy if exists wilayah_tenant_select on public.wilayah;
create policy wilayah_tenant_select on public.wilayah for select to authenticated
  using (
    distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_sys_admin'
  );
drop policy if exists wilayah_admin_insert on public.wilayah;
create policy wilayah_admin_insert on public.wilayah for insert to authenticated
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','distributor')
    and distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
    and created_by = auth.uid()
  );
drop policy if exists wilayah_admin_update on public.wilayah;
create policy wilayah_admin_update on public.wilayah for update to authenticated
  using (
    distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
  );

-- 13.4 Rute
alter table public.rute enable row level security;
drop policy if exists rute_tenant_select on public.rute;
create policy rute_tenant_select on public.rute for select to authenticated
  using (
    distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_sys_admin'
    or (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales_motoris'
      and exists (
        select 1 from public.rute_sales_assignments rsa
        where rsa.sales_id = auth.uid() and rsa.rute_id = rute.id and rsa.ended_at is null
      )
    )
  );
drop policy if exists rute_admin_insert on public.rute;
create policy rute_admin_insert on public.rute for insert to authenticated
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','distributor')
    and distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
    and created_by = auth.uid()
  );
drop policy if exists rute_admin_update on public.rute;
create policy rute_admin_update on public.rute for update to authenticated
  using (distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id'));

-- 13.5 Outlets
alter table public.outlets enable row level security;
drop policy if exists outlets_tenant_select on public.outlets;
create policy outlets_tenant_select on public.outlets for select to authenticated
  using (
    distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_sys_admin'
    or (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales_motoris'
      and exists (
        select 1 from public.rute_sales_assignments rsa
        join public.rute_outlet_assignments roa on roa.rute_id = rsa.rute_id
        where rsa.sales_id = auth.uid() and rsa.ended_at is null
          and roa.outlet_id = outlets.id and roa.ended_at is null
      )
    )
  );
drop policy if exists outlets_admin_insert on public.outlets;
create policy outlets_admin_insert on public.outlets for insert to authenticated
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','distributor')
    and distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
    and created_by = auth.uid()
  );
drop policy if exists outlets_admin_update on public.outlets;
create policy outlets_admin_update on public.outlets for update to authenticated
  using (distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id'));

-- 13.6 Rute Outlet Assignments
alter table public.rute_outlet_assignments enable row level security;
drop policy if exists roa_tenant_select on public.rute_outlet_assignments;
create policy roa_tenant_select on public.rute_outlet_assignments for select to authenticated
  using (
    distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_sys_admin'
  );

-- 13.7 Rute Sales Assignments
alter table public.rute_sales_assignments enable row level security;
drop policy if exists rsa_tenant_select on public.rute_sales_assignments;
create policy rsa_tenant_select on public.rute_sales_assignments for select to authenticated
  using (
    distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_sys_admin'
    or sales_id = auth.uid()
  );

-- 13.8 Assignment History
alter table public.assignment_history enable row level security;
drop policy if exists ah_tenant_select on public.assignment_history;
create policy ah_tenant_select on public.assignment_history for select to authenticated
  using (
    distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_sys_admin'
  );

-- 13.9 Sales Stock
alter table public.sales_stock enable row level security;
drop policy if exists ss_tenant_select on public.sales_stock;
create policy ss_tenant_select on public.sales_stock for select to authenticated
  using (
    distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_sys_admin'
    or (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales_motoris'
      and sales_id = auth.uid()
    )
  );

-- 13.10 Outlet Stock
alter table public.outlet_stock enable row level security;
drop policy if exists os_tenant_select on public.outlet_stock;
create policy os_tenant_select on public.outlet_stock for select to authenticated
  using (
    distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_sys_admin'
  );

-- 13.11 Surat Jalan
alter table public.surat_jalan enable row level security;
drop policy if exists sj_tenant_select on public.surat_jalan;
create policy sj_tenant_select on public.surat_jalan for select to authenticated
  using (
    distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_sys_admin'
    or (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales_motoris'
      and sales_id = auth.uid()
    )
  );

alter table public.surat_jalan_items enable row level security;
drop policy if exists sji_tenant_select on public.surat_jalan_items;
create policy sji_tenant_select on public.surat_jalan_items for select to authenticated
  using (
    exists (
      select 1 from public.surat_jalan sj
      where sj.id = surat_jalan_items.surat_jalan_id
        and (
          sj.distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
          or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_sys_admin'
          or (
            (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales_motoris'
            and sj.sales_id = auth.uid()
          )
        )
    )
  );

alter table public.surat_jalan_stock_movements enable row level security;
drop policy if exists sjm_tenant_select on public.surat_jalan_stock_movements;
create policy sjm_tenant_select on public.surat_jalan_stock_movements for select to authenticated
  using (
    distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_sys_admin'
    or (
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales_motoris'
      and exists (select 1 from public.surat_jalan sj where sj.id = surat_jalan_stock_movements.surat_jalan_id and sj.sales_id = auth.uid())
    )
  );

alter table public.surat_jalan_events enable row level security;
drop policy if exists sje_tenant_select on public.surat_jalan_events;
create policy sje_tenant_select on public.surat_jalan_events for select to authenticated
  using (
    exists (
      select 1 from public.surat_jalan sj
      where sj.id = surat_jalan_events.surat_jalan_id
        and (
          sj.distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
          or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_sys_admin'
          or (
            (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales_motoris'
            and sj.sales_id = auth.uid()
          )
        )
    )
  );

-- 13.12 Visits
alter table public.visits enable row level security;
drop policy if exists visits_tenant_select on public.visits;
create policy visits_tenant_select on public.visits for select to authenticated
  using (
    distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_sys_admin'
    or sales_id = auth.uid()
  );
drop policy if exists visits_sales_insert on public.visits;
create policy visits_sales_insert on public.visits for insert to authenticated
  with check (
    sales_id = auth.uid()
    and distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
  );

-- Sales may update transaction_status ONLY while visit is DRAFT/CHECKED_IN.
-- Workflow: CREATE VISIT → CHECK-IN → SELECT STATUS → CARDS → FINALIZE.
-- NOT allowed once FINALIZED/CANCELLED (FINALIZED immutable).
drop policy if exists visits_sales_update on public.visits;
create policy visits_sales_update on public.visits for update to authenticated
  using (
    sales_id = auth.uid()
    and distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
    and status in ('DRAFT', 'CHECKED_IN')
  )
  with check (
    sales_id = auth.uid()
    and distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
    and status in ('DRAFT', 'CHECKED_IN')
  );

-- Column-level restriction: only transaction_status is updatable via REST by sales.
-- All other visit fields remain immutable to the client (checkin/finalize via RPC).
revoke update on public.visits from authenticated;
grant update (transaction_status) on public.visits to authenticated;

-- 13.13 Visit Checkin Attempts
alter table public.visit_checkin_attempts enable row level security;
drop policy if exists cia_tenant_select on public.visit_checkin_attempts;
create policy cia_tenant_select on public.visit_checkin_attempts for select to authenticated
  using (
    distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_sys_admin'
    or sales_id = auth.uid()
  );

-- 13.14 Visit Product Cards
alter table public.visit_product_cards enable row level security;
drop policy if exists vpc_tenant_select on public.visit_product_cards;
create policy vpc_tenant_select on public.visit_product_cards for select to authenticated
  using (
    exists (
      select 1 from public.visits v
      where v.id = visit_product_cards.visit_id
        and (
          v.distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
          or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_sys_admin'
          or v.sales_id = auth.uid()
        )
    )
  );
drop policy if exists vpc_sales_insert on public.visit_product_cards;
create policy vpc_sales_insert on public.visit_product_cards for insert to authenticated
  with check (
    exists (
      select 1 from public.visits v
      where v.id = visit_id and v.sales_id = auth.uid()
    )
  );
drop policy if exists vpc_sales_update on public.visit_product_cards;
create policy vpc_sales_update on public.visit_product_cards for update to authenticated
  using (
    exists (
      select 1 from public.visits v
      where v.id = visit_product_cards.visit_id and v.sales_id = auth.uid()
    )
  );

-- 13.15 Visit Photos
alter table public.visit_photos enable row level security;
drop policy if exists vp_tenant_select on public.visit_photos;
create policy vp_tenant_select on public.visit_photos for select to authenticated
  using (
    exists (
      select 1 from public.visits v
      where v.id = visit_photos.visit_id
        and (
          v.distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
          or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_sys_admin'
          or v.sales_id = auth.uid()
        )
    )
  );
drop policy if exists vp_sales_insert on public.visit_photos;
create policy vp_sales_insert on public.visit_photos for insert to authenticated
  with check (
    exists (
      select 1 from public.visits v where v.id = visit_id and v.sales_id = auth.uid()
    )
  );

-- 13.16 Visit Documents
alter table public.visit_documents enable row level security;
drop policy if exists vd_tenant_select on public.visit_documents;
create policy vd_tenant_select on public.visit_documents for select to authenticated
  using (
    exists (
      select 1 from public.visits v
      where v.id = visit_documents.visit_id
        and (
          v.distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
          or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_sys_admin'
          or v.sales_id = auth.uid()
        )
    )
  );
drop policy if exists vd_sales_insert on public.visit_documents;
create policy vd_sales_insert on public.visit_documents for insert to authenticated
  with check (
    exists (
      select 1 from public.visits v where v.id = visit_id and v.sales_id = auth.uid()
    )
  );

-- 13.17 Visit Payments
alter table public.visit_payments enable row level security;
drop policy if exists vpay_tenant_select on public.visit_payments;
create policy vpay_tenant_select on public.visit_payments for select to authenticated
  using (
    exists (
      select 1 from public.visits v
      where v.id = visit_payments.visit_id
        and (
          v.distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
          or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_sys_admin'
          or v.sales_id = auth.uid()
        )
    )
  );
drop policy if exists vpay_sales_insert on public.visit_payments;
create policy vpay_sales_insert on public.visit_payments for insert to authenticated
  with check (
    exists (
      select 1 from public.visits v where v.id = visit_payments.visit_id and v.sales_id = auth.uid()
    )
  );

-- 13.18 Visit Receivables
alter table public.visit_receivables enable row level security;
drop policy if exists vr_tenant_select on public.visit_receivables;
create policy vr_tenant_select on public.visit_receivables for select to authenticated
  using (
    exists (
      select 1 from public.visits v
      where v.id = visit_receivables.visit_id
        and (
          v.distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
          or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_sys_admin'
          or v.sales_id = auth.uid()
        )
    )
  );

-- 13.19 Transactions
alter table public.transactions enable row level security;
drop policy if exists trx_tenant_select on public.transactions;
create policy trx_tenant_select on public.transactions for select to authenticated
  using (
    distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_sys_admin'
    or exists (select 1 from public.visits v where v.id = transactions.visit_id and v.sales_id = auth.uid())
  );

-- 13.20 Transaction Items
alter table public.transaction_items enable row level security;
drop policy if exists tri_tenant_select on public.transaction_items;
create policy tri_tenant_select on public.transaction_items for select to authenticated
  using (
    distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_sys_admin'
    or exists (
      select 1 from public.transactions t
      join public.visits v on v.id = t.visit_id
      where t.id = transaction_items.transaction_id and v.sales_id = auth.uid()
    )
  );

-- 13.21 Visit Stock Movements
alter table public.visit_stock_movements enable row level security;
drop policy if exists vsm_tenant_select on public.visit_stock_movements;
create policy vsm_tenant_select on public.visit_stock_movements for select to authenticated
  using (
    distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_sys_admin'
    or exists (select 1 from public.visits v where v.id = visit_stock_movements.visit_id and v.sales_id = auth.uid())
  );

-- 13.22 Visit Events
alter table public.visit_events enable row level security;
drop policy if exists ve_tenant_select on public.visit_events;
create policy ve_tenant_select on public.visit_events for select to authenticated
  using (
    exists (
      select 1 from public.visits v
      where v.id = visit_events.visit_id
        and (
          v.distributor_id::text = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')
          or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_sys_admin'
          or v.sales_id = auth.uid()
        )
    )
  );

-- =============================================================================
-- SECTION 14: TRIGGERS
-- =============================================================================

-- 14.1 Guard: visit must have active sales assignment in the rute
create or replace function public.fn_guard_visit_assignment()
returns trigger
language plpgsql
security definer
set search_path to pg_catalog, public
as $fn$
declare
  v_role text;
  v_active_count int;
begin
  v_role := coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '');

  -- Skip for service_role writes (RPCs) and platform_sys_admin
  if v_role in ('platform_sys_admin', 'service_role') then
    return new;
  end if;

  -- Only guard INSERT of DRAFT/CHECKED_IN by sales
  if v_role = 'sales_motoris' and tg_op = 'INSERT' then
    select count(*) into v_active_count
    from public.rute_sales_assignments
    where distributor_id = new.distributor_id
      and sales_id = new.sales_id
      and rute_id = new.rute_id
      and ended_at is null;

    if v_active_count = 0 then
      raise exception 'Sales tidak memiliki assignment aktif di rute ini.';
    end if;
  end if;

  return new;
end;
$fn$;

drop trigger if exists guard_visit_assignment on public.visits;
create trigger guard_visit_assignment
  before insert on public.visits
  for each row execute function public.fn_guard_visit_assignment();

-- =============================================================================
-- SECTION 15: RPC — ASSIGNMENT (recreated per DBML v1.4)
-- =============================================================================

-- 15.1 assign_outlet_to_rute
create or replace function public.assign_outlet_to_rute(
  p_outlet_id uuid,
  p_rute_id uuid,
  p_distributor_id uuid,
  p_assigned_by uuid
)
returns table (assignment_id uuid, action text, previous_rute_id uuid, assigned_at timestamptz)
language plpgsql
security definer
set search_path to pg_catalog, public
as $fn$
declare
  v_admin_role text;
  v_now timestamptz := now();
  v_previous_rute uuid;
  v_new_id uuid;
begin
  select (raw_app_meta_data ->> 'role') into v_admin_role
  from auth.users where id = p_assigned_by;

  if v_admin_role is distinct from 'admin' then
    raise exception 'Only admin may assign outlets to rutes.';
  end if;

  if not exists (select 1 from public.outlets where id = p_outlet_id and distributor_id = p_distributor_id) then
    raise exception 'Outlet not found in workspace.';
  end if;

  if not exists (select 1 from public.rute where id = p_rute_id and distributor_id = p_distributor_id) then
    raise exception 'Rute not found in workspace.';
  end if;

  select roa.rute_id into v_previous_rute
  from public.rute_outlet_assignments roa
  where roa.outlet_id = p_outlet_id
    and roa.distributor_id = p_distributor_id
    and roa.ended_at is null;

  if v_previous_rute = p_rute_id then
    raise exception 'Outlet already assigned to this rute.';
  end if;

  update public.rute_outlet_assignments
  set ended_at = v_now
  where outlet_id = p_outlet_id
    and distributor_id = p_distributor_id
    and ended_at is null;

  insert into public.rute_outlet_assignments (distributor_id, rute_id, outlet_id, assigned_by, assigned_at, created_at)
  values (p_distributor_id, p_rute_id, p_outlet_id, p_assigned_by, v_now, v_now)
  returning id into v_new_id;

  insert into public.assignment_history (distributor_id, entity_type, entity_id, from_rute_id, to_rute_id, action, changed_by, changed_at, metadata)
  values (p_distributor_id, 'outlet', p_outlet_id, v_previous_rute, p_rute_id,
          case when v_previous_rute is null then 'assign' else 'reassign' end,
          p_assigned_by, v_now, jsonb_build_object('from_rute_id', v_previous_rute, 'to_rute_id', p_rute_id));

  return query
  select v_new_id,
         case when v_previous_rute is null then 'assign' else 'reassign' end,
         v_previous_rute, v_now;
end;
$fn$;

-- 15.2 assign_sales_to_rute
create or replace function public.assign_sales_to_rute(
  p_sales_user uuid,
  p_rute_id uuid,
  p_distributor_id uuid,
  p_assigned_by uuid
)
returns table (assignment_id uuid, action text, previous_rute_id uuid, assigned_at timestamptz)
language plpgsql
security definer
set search_path to pg_catalog, public
as $fn$
declare
  v_admin_role text;
  v_sales_role text;
  v_now timestamptz := now();
  v_previous_rute uuid;
  v_new_id uuid;
begin
  select (raw_app_meta_data ->> 'role') into v_admin_role
  from auth.users where id = p_assigned_by;

  if v_admin_role is distinct from 'admin' then
    raise exception 'Only admin may assign sales to rutes.';
  end if;

  select (raw_app_meta_data ->> 'role') into v_sales_role
  from auth.users where id = p_sales_user;

  if v_sales_role is distinct from 'sales_motoris' then
    raise exception 'User is not a sales motoris.';
  end if;

  if not exists (select 1 from public.rute where id = p_rute_id and distributor_id = p_distributor_id) then
    raise exception 'Rute not found in workspace.';
  end if;

  select rsa.rute_id into v_previous_rute
  from public.rute_sales_assignments rsa
  where rsa.sales_id = p_sales_user
    and rsa.distributor_id = p_distributor_id
    and rsa.ended_at is null;

  if v_previous_rute = p_rute_id then
    raise exception 'Sales already assigned to this rute.';
  end if;

  update public.rute_sales_assignments
  set ended_at = v_now
  where sales_id = p_sales_user
    and distributor_id = p_distributor_id
    and ended_at is null;

  insert into public.rute_sales_assignments (distributor_id, rute_id, sales_id, assigned_by, assigned_at, created_at)
  values (p_distributor_id, p_rute_id, p_sales_user, p_assigned_by, v_now, v_now)
  returning id into v_new_id;

  insert into public.assignment_history (distributor_id, entity_type, entity_id, from_rute_id, to_rute_id, action, changed_by, changed_at, metadata)
  values (p_distributor_id, 'sales', p_sales_user, v_previous_rute, p_rute_id,
          case when v_previous_rute is null then 'assign' else 'reassign' end,
          p_assigned_by, v_now, jsonb_build_object('from_rute_id', v_previous_rute, 'to_rute_id', p_rute_id));

  return query
  select v_new_id,
         case when v_previous_rute is null then 'assign' else 'reassign' end,
         v_previous_rute, v_now;
end;
$fn$;

-- =============================================================================
-- SECTION 16: RPC — SURAT JALAN CHAIN
-- =============================================================================

-- 16.1 sj_create
create or replace function public.sj_create(
  p_distributor_id uuid,
  p_sales_id uuid,
  p_direction public.sj_direction,
  p_sj_date date,
  p_actor_id uuid,
  p_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to pg_catalog, public
as $fn$
declare
  v_sj_id uuid;
  v_sj_number varchar;
  v_now timestamptz := now();
  v_item jsonb;
  v_product_id uuid;
  v_expected numeric;
begin
  -- Serialize per (distributor, date) so `SJ-YYYYMMDD-####` counter is race-free
  perform pg_advisory_xact_lock(hashtextextended(p_distributor_id::text || ':' || to_char(p_sj_date, 'YYYYMMDD'), 0));

  select 'SJ-' || to_char(p_sj_date, 'YYYYMMDD') || '-' || lpad(
    (coalesce(max(substring(sj_number from '\d+$')::int), 0) + 1)::text, 4, '0')
  into v_sj_number
  from public.surat_jalan
  where distributor_id = p_distributor_id and sj_date = p_sj_date;

  insert into public.surat_jalan (
    distributor_id, sj_number, direction, sales_id, sj_date, created_by, created_at, updated_at
  ) values (
    p_distributor_id, v_sj_number, p_direction, p_sales_id, p_sj_date, p_actor_id, v_now, v_now
  ) returning id into v_sj_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_expected := coalesce((v_item ->> 'expected_qty')::numeric, 0);

    insert into public.surat_jalan_items (surat_jalan_id, product_id, expected_qty, created_at, updated_at)
    values (v_sj_id, v_product_id, v_expected, v_now, v_now);
  end loop;

  insert into public.surat_jalan_events (surat_jalan_id, event_type, actor_id, created_at)
  values (v_sj_id, 'SJ_CREATED', p_actor_id, v_now);

  return v_sj_id;
end;
$fn$;

-- 16.2 sj_ready
create or replace function public.sj_ready(p_sj_id uuid, p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path to pg_catalog, public
as $fn$
declare
  v_sj public.surat_jalan%rowtype;
  v_now timestamptz := now();
begin
  select * into v_sj from public.surat_jalan where id = p_sj_id for update;
  if not found then raise exception 'Surat Jalan not found.'; end if;
  if v_sj.status <> 'DRAFT' then raise exception 'Only DRAFT SJ can be set to READY.'; end if;

  update public.surat_jalan set status = 'READY', updated_at = v_now where id = p_sj_id;
  insert into public.surat_jalan_events (surat_jalan_id, event_type, actor_id, created_at)
  values (p_sj_id, 'SJ_READY', p_actor_id, v_now);
end;
$fn$;

-- 16.3 sj_check
create or replace function public.sj_check(
  p_sj_id uuid,
  p_actor_id uuid,
  p_items jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path to pg_catalog, public
as $fn$
declare
  v_sj public.surat_jalan%rowtype;
  v_now timestamptz := now();
  v_item jsonb;
  v_item_row public.surat_jalan_items%rowtype;
  v_has_discrepancy boolean := false;
begin
  select * into v_sj from public.surat_jalan where id = p_sj_id for update;
  if not found then raise exception 'Surat Jalan not found.'; end if;
  if v_sj.status not in ('READY') then raise exception 'SJ must be READY to check.'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select * into v_item_row from public.surat_jalan_items
    where id = (v_item ->> 'id')::uuid and surat_jalan_id = p_sj_id for update;

    if not found then continue; end if;

    if v_sj.direction = 'GUDANG_TO_SALES' then
      update public.surat_jalan_items set actual_qty = (v_item ->> 'actual_qty')::numeric where id = v_item_row.id;
      if (v_item ->> 'actual_qty')::numeric is distinct from v_item_row.expected_qty then
        v_has_discrepancy := true;
        update public.surat_jalan_items set is_discrepancy = true, discrepancy_reason = coalesce(v_item ->> 'discrepancy_reason', 'Qty mismatch') where id = v_item_row.id;
      end if;
    else
      update public.surat_jalan_items set physical_check_qty = (v_item ->> 'physical_check_qty')::numeric where id = v_item_row.id;
      if (v_item ->> 'physical_check_qty')::numeric is distinct from v_item_row.expected_qty then
        v_has_discrepancy := true;
        update public.surat_jalan_items set is_discrepancy = true, discrepancy_reason = coalesce(v_item ->> 'discrepancy_reason', 'Qty mismatch') where id = v_item_row.id;
      end if;
    end if;
  end loop;

  update public.surat_jalan
  set status = case when v_has_discrepancy then 'DISCREPANCY' else 'CHECKED' end,
      has_discrepancy = v_has_discrepancy,
      updated_at = v_now
  where id = p_sj_id;

  insert into public.surat_jalan_events (surat_jalan_id, event_type, actor_id, created_at)
  values (p_sj_id, case when v_has_discrepancy then 'SJ_DISCREPANCY' else 'SJ_CHECKED' end, p_actor_id, v_now);
end;
$fn$;

-- 16.4 sj_resolve
create or replace function public.sj_resolve(
  p_sj_id uuid,
  p_actor_id uuid,
  p_items jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path to pg_catalog, public
as $fn$
declare
  v_sj public.surat_jalan%rowtype;
  v_now timestamptz := now();
  v_item jsonb;
begin
  select * into v_sj from public.surat_jalan where id = p_sj_id for update;
  if not found then raise exception 'Surat Jalan not found.'; end if;
  if v_sj.status <> 'DISCREPANCY' then raise exception 'SJ must be DISCREPANCY to resolve.'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    update public.surat_jalan_items
    set final_qty = (v_item ->> 'final_qty')::numeric,
        resolved_by = p_actor_id,
        resolved_at = v_now,
        updated_at = v_now
    where id = (v_item ->> 'id')::uuid and surat_jalan_id = p_sj_id;
  end loop;

  update public.surat_jalan
  set resolved_by = p_actor_id, resolved_at = v_now, updated_at = v_now
  where id = p_sj_id;
end;
$fn$;

-- 16.5 sj_confirm
create or replace function public.sj_confirm(p_sj_id uuid, p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path to pg_catalog, public
as $fn$
declare
  v_sj public.surat_jalan%rowtype;
  v_now timestamptz := now();
  v_target_status public.sj_status;
begin
  select * into v_sj from public.surat_jalan where id = p_sj_id for update;
  if not found then raise exception 'Surat Jalan not found.'; end if;
  if v_sj.status not in ('CHECKED', 'DISCREPANCY') then
    raise exception 'SJ must be CHECKED or DISCREPANCY to confirm.';
  end if;

  -- Auto-set final_qty for non-discrepancy items
  update public.surat_jalan_items
  set final_qty = coalesce(final_qty,
    case when v_sj.direction = 'GUDANG_TO_SALES' then actual_qty else physical_check_qty end),
      resolved_by = coalesce(resolved_by, p_actor_id),
      resolved_at = coalesce(resolved_at, v_now),
      updated_at = v_now
  where surat_jalan_id = p_sj_id and final_qty is null;

  if v_sj.direction = 'GUDANG_TO_SALES' then
    v_target_status := 'CONFIRMED';
  else
    v_target_status := 'RETURN_CONFIRMED';
  end if;

  update public.surat_jalan
  set status = v_target_status, confirmed_at = v_now, updated_at = v_now
  where id = p_sj_id;

  insert into public.surat_jalan_events (surat_jalan_id, event_type, actor_id, created_at)
  values (p_sj_id, case when v_sj.direction = 'GUDANG_TO_SALES' then 'SJ_CONFIRMED' else 'SJ_RETURN_CONFIRMED' end, p_actor_id, v_now);
end;
$fn$;

-- 16.6 sj_complete (stock transfer)
create or replace function public.sj_complete(p_sj_id uuid, p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path to pg_catalog, public
as $fn$
declare
  v_sj public.surat_jalan%rowtype;
  v_now timestamptz := now();
  v_item record;
  v_ss record;
  v_ds record;
  v_sj_movement public.sj_movement_type;
  v_source_stock numeric;
  v_target_stock numeric;
begin
  select * into v_sj from public.surat_jalan where id = p_sj_id for update;
  if not found then raise exception 'Surat Jalan not found.'; end if;
  if v_sj.direction = 'GUDANG_TO_SALES' then
    if v_sj.status <> 'CONFIRMED' then raise exception 'SJ must be CONFIRMED.'; end if;
    v_sj_movement := 'SJ_OUT';
  else
    if v_sj.status <> 'RETURN_CONFIRMED' then raise exception 'SJ must be RETURN_CONFIRMED.'; end if;
    v_sj_movement := 'SJ_RETURN';
  end if;

  for v_item in
    select sji.* from public.surat_jalan_items sji
    where sji.surat_jalan_id = p_sj_id and sji.final_qty > 0
    order by sji.product_id
  loop
    if v_sj.direction = 'GUDANG_TO_SALES' then
      select * into v_ds from public.distributor_stock
      where distributor_id = v_sj.distributor_id and product_id = v_item.product_id for update;
      if not found or v_ds.quantity < v_item.final_qty then
        raise exception 'Insufficient distributor stock for product %', v_item.product_id;
      end if;

      insert into public.sales_stock (distributor_id, sales_id, product_id, quantity, updated_at)
      values (v_sj.distributor_id, v_sj.sales_id, v_item.product_id, 0, v_now)
      on conflict (sales_id, product_id) do nothing;

      select * into v_ss from public.sales_stock
      where sales_id = v_sj.sales_id and product_id = v_item.product_id for update;

      v_source_stock := v_ds.quantity;
      v_target_stock := v_ss.quantity;

      update public.distributor_stock set quantity = quantity - v_item.final_qty, updated_at = v_now where id = v_ds.id;
      update public.sales_stock set quantity = quantity + v_item.final_qty, updated_at = v_now where id = v_ss.id;

    else -- SALES_TO_GUDANG
      select * into v_ss from public.sales_stock
      where sales_id = v_sj.sales_id and product_id = v_item.product_id for update;
      if not found or v_ss.quantity < v_item.final_qty then
        raise exception 'Insufficient sales stock for product %', v_item.product_id;
      end if;

      select * into v_ds from public.distributor_stock
      where distributor_id = v_sj.distributor_id and product_id = v_item.product_id for update;
      if not found then
        insert into public.distributor_stock (distributor_id, product_id, quantity, updated_at)
        values (v_sj.distributor_id, v_item.product_id, 0, v_now);
        select * into v_ds from public.distributor_stock
        where distributor_id = v_sj.distributor_id and product_id = v_item.product_id for update;
      end if;

      v_source_stock := v_ss.quantity;
      v_target_stock := v_ds.quantity;

      update public.sales_stock set quantity = quantity - v_item.final_qty, updated_at = v_now where id = v_ss.id;
      update public.distributor_stock set quantity = quantity + v_item.final_qty, updated_at = v_now where id = v_ds.id;
    end if;

    insert into public.surat_jalan_stock_movements (
      distributor_id, surat_jalan_id, surat_jalan_item_id, product_id,
      movement_type, quantity, prev_source_stock, prev_target_stock,
      posted_by, created_at
    ) values (
      v_sj.distributor_id, p_sj_id, v_item.id, v_item.product_id,
      v_sj_movement, v_item.final_qty, v_source_stock, v_target_stock,
      p_actor_id, v_now
    );
  end loop;

  update public.surat_jalan set status = 'COMPLETED', completed_at = v_now, updated_at = v_now where id = p_sj_id;
  insert into public.surat_jalan_events (surat_jalan_id, event_type, actor_id, created_at)
  values (p_sj_id, 'SJ_COMPLETED', p_actor_id, v_now);
end;
$fn$;

-- =============================================================================
-- SECTION 17: RPC — CHECKIN VALIDATE (F4)
-- =============================================================================

create or replace function public.checkin_validate(
  p_distributor_id uuid,
  p_sales_id uuid,
  p_outlet_id uuid,
  p_latitude decimal,
  p_longitude decimal,
  p_visit_id uuid default null
)
returns table (
  visit_id uuid,
  accepted boolean,
  attempt_id uuid,
  distance_m decimal,
  gps_radius_m int,
  reason text
)
language plpgsql
security definer
set search_path to pg_catalog, public
as $fn$
declare
  v_outlet record;
  v_dist decimal;
  v_rute_id uuid;
  v_new_visit_id uuid;
  v_now timestamptz := now();
begin
  select * into v_outlet from public.outlets
  where id = p_outlet_id and distributor_id = p_distributor_id;
  if not found then
    insert into public.visit_checkin_attempts (distributor_id, sales_id, outlet_id, rute_id, latitude, longitude, gps_radius_m, distance_m, rejection_reason, created_at)
    values (p_distributor_id, p_sales_id, p_outlet_id, null, p_latitude, p_longitude, 0, 0, 'Outlet tidak ditemukan', v_now)
    returning id into attempt_id;
    return query select null::uuid, false, attempt_id, 0::decimal, 0, 'Outlet tidak ditemukan'::text;
    return;
  end if;

  -- Haversine distance
  v_dist := 6371000 * 2 * asin(sqrt(
    power(sin((radians(p_latitude) - radians(v_outlet.latitude)) / 2), 2)
    + cos(radians(p_latitude)) * cos(radians(v_outlet.latitude))
    * power(sin((radians(p_longitude) - radians(v_outlet.longitude)) / 2), 2)
  ));

  -- Find active rute assignment for this sales
  select rsa.rute_id into v_rute_id
  from public.rute_sales_assignments rsa
  where rsa.distributor_id = p_distributor_id
    and rsa.sales_id = p_sales_id
    and rsa.ended_at is null
  limit 1;

  -- Sales must have an active assignment (visits.rute_id is NOT NULL)
  if v_rute_id is null then
    insert into public.visit_checkin_attempts (distributor_id, sales_id, outlet_id, rute_id, latitude, longitude, gps_radius_m, distance_m, rejection_reason, created_at)
    values (p_distributor_id, p_sales_id, p_outlet_id, null, p_latitude, p_longitude, v_outlet.gps_radius_m, v_dist, 'Sales tidak memiliki assignment aktif', v_now)
    returning id into attempt_id;
    return query select null::uuid, false, attempt_id, v_dist, v_outlet.gps_radius_m, 'Sales tidak memiliki assignment aktif'::text;
    return;
  end if;

  -- GPS check
  if v_dist > v_outlet.gps_radius_m then
    insert into public.visit_checkin_attempts (distributor_id, sales_id, outlet_id, rute_id, latitude, longitude, gps_radius_m, distance_m, rejection_reason, created_at)
    values (p_distributor_id, p_sales_id, p_outlet_id, v_rute_id, p_latitude, p_longitude, v_outlet.gps_radius_m, v_dist, 'Di luar radius GPS', v_now)
    returning id into attempt_id;
    return query select null::uuid, false, attempt_id, v_dist, v_outlet.gps_radius_m, 'Di luar radius GPS'::text;
    return;
  end if;

  -- Create or update visit as CHECKED_IN
  if p_visit_id is not null then
    update public.visits
    set status = 'CHECKED_IN', checkin_at = v_now,
        checkin_latitude = p_latitude, checkin_longitude = p_longitude,
        updated_at = v_now
    where id = p_visit_id and distributor_id = p_distributor_id
      and sales_id = p_sales_id and status = 'DRAFT'
    returning id into v_new_visit_id;

    if v_new_visit_id is null then
      insert into public.visit_checkin_attempts (distributor_id, sales_id, outlet_id, rute_id, latitude, longitude, gps_radius_m, distance_m, rejection_reason, created_at)
      values (p_distributor_id, p_sales_id, p_outlet_id, v_rute_id, p_latitude, p_longitude, v_outlet.gps_radius_m, v_dist, 'Visit DRAFT tidak ditemukan untuk sales ini', v_now)
      returning id into attempt_id;
      return query select null::uuid, false, attempt_id, v_dist, v_outlet.gps_radius_m, 'Visit DRAFT tidak ditemukan'::text;
      return;
    end if;
  else
    begin
      insert into public.visits (distributor_id, outlet_id, sales_id, rute_id, visit_date, status, checkin_at, checkin_latitude, checkin_longitude, created_at, updated_at)
      values (p_distributor_id, p_outlet_id, p_sales_id, coalesce(v_rute_id, (select rute_id from public.rute_outlet_assignments where outlet_id = p_outlet_id and distributor_id = p_distributor_id and ended_at is null limit 1)),
              current_date, 'CHECKED_IN', v_now, p_latitude, p_longitude, v_now, v_now)
      returning id into v_new_visit_id;
    exception
      when unique_violation then
        insert into public.visit_checkin_attempts (distributor_id, sales_id, outlet_id, rute_id, latitude, longitude, gps_radius_m, distance_m, rejection_reason, created_at)
        values (p_distributor_id, p_sales_id, p_outlet_id, v_rute_id, p_latitude, p_longitude, v_outlet.gps_radius_m, v_dist, 'Kunjungan aktif sudah ada (F1)', v_now)
        returning id into attempt_id;
        return query select null::uuid, false, attempt_id, v_dist, v_outlet.gps_radius_m, 'Kunjungan aktif sudah ada'::text;
        return;
    end;
  end if;

  if v_new_visit_id is not null then
    insert into public.visit_events (visit_id, event_type, actor_id, created_at)
    values (v_new_visit_id, 'VISIT_CHECKED_IN', p_sales_id, v_now);
  end if;

  return query select v_new_visit_id, true, null::uuid, v_dist, v_outlet.gps_radius_m, 'Check-in berhasil'::text;
end;
$fn$;

-- =============================================================================
-- SECTION 18: RPC — FINALIZE VISIT
-- =============================================================================

create or replace function public.finalize_visit(
  p_visit_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to pg_catalog, public
as $fn$
declare
  v_visit public.visits%rowtype;
  v_now timestamptz := now();
  v_card record;
  v_ss record;
  v_oc record;
  v_oc_milik record;
  v_total_amount decimal := 0;
  v_total_paid decimal := 0;
  v_has_sale boolean := false;
  v_transaction_id uuid;
  v_trx_number varchar;
  v_stock_after numeric;
  v_prev_ss numeric;
  v_prev_oc numeric;
  v_added boolean;
  v_movement_note text;
begin
  select * into v_visit from public.visits where id = p_visit_id for update;
  if not found then raise exception 'Visit not found.'; end if;
  if v_visit.status <> 'CHECKED_IN' then raise exception 'Visit must be CHECKED_IN to finalize.'; end if;
  if v_visit.transaction_status is null then raise exception 'transaction_status must be set before finalization.'; end if;

  -- Lock and ensure stock rows exist for all products in cards
  for v_card in
    select product_id from public.visit_product_cards where visit_id = p_visit_id group by product_id order by product_id
  loop
    insert into public.sales_stock (distributor_id, sales_id, product_id, quantity, updated_at)
    values (v_visit.distributor_id, v_visit.sales_id, v_card.product_id, 0, v_now)
    on conflict (sales_id, product_id) do nothing;

    insert into public.outlet_stock (distributor_id, outlet_id, product_id, quantity, ownership_type, updated_at)
    values (v_visit.distributor_id, v_visit.outlet_id, v_card.product_id, 0, 'KONSINYASI', v_now)
    on conflict (outlet_id, product_id, ownership_type) do nothing;

    insert into public.outlet_stock (distributor_id, outlet_id, product_id, quantity, ownership_type, updated_at)
    values (v_visit.distributor_id, v_visit.outlet_id, v_card.product_id, 0, 'MILIK_OUTLET', v_now)
    on conflict (outlet_id, product_id, ownership_type) do nothing;
  end loop;

  -- Lock stock rows for update
  for v_ss in
    select ss.* from public.sales_stock ss
    where ss.sales_id = v_visit.sales_id
      and ss.product_id in (select product_id from public.visit_product_cards where visit_id = p_visit_id)
    order by ss.product_id
  loop null; end loop;

  for v_oc in
    select os.* from public.outlet_stock os
    where os.outlet_id = v_visit.outlet_id
      and os.product_id in (select product_id from public.visit_product_cards where visit_id = p_visit_id)
      and os.ownership_type in ('KONSINYASI', 'MILIK_OUTLET')
    order by os.product_id
  loop null; end loop;

  -- Process each card
  for v_card in
    select * from public.visit_product_cards where visit_id = p_visit_id order by id
  loop
    select quantity into v_prev_ss from public.sales_stock
    where sales_id = v_visit.sales_id and product_id = v_card.product_id;
    select quantity into v_prev_oc from public.outlet_stock
    where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'KONSINYASI';

    v_prev_ss := coalesce(v_prev_ss, 0);
    v_prev_oc := coalesce(v_prev_oc, 0);

    v_stock_after := v_card.stock_before;
    v_added := false;

    if v_visit.transaction_status = 'LUNAS' then
      case v_card.condition
        when 'TOKO_BARU' then
          -- add from sales stock -> outlet, barang MILIK_OUTLET (LUNAS), segera terjual
          if v_card.add_qty > 0 then
            update public.sales_stock set quantity = quantity - v_card.add_qty, updated_at = v_now
            where sales_id = v_visit.sales_id and product_id = v_card.product_id;
            update public.outlet_stock set quantity = quantity + v_card.add_qty, updated_at = v_now
            where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'MILIK_OUTLET';
            insert into public.visit_stock_movements (distributor_id, visit_id, card_id, outlet_id, product_id, movement_type, quantity, prev_sales_stock, prev_outlet_stock, created_by, created_at)
            values (v_visit.distributor_id, p_visit_id, v_card.id, v_visit.outlet_id, v_card.product_id, 'ADD_IN', v_card.add_qty, v_prev_ss, v_prev_oc, p_actor_id, v_now);
            v_prev_oc := v_prev_oc + v_card.add_qty;
          end if;
          if v_card.sales_qty > 0 then
            update public.outlet_stock set quantity = quantity - v_card.sales_qty, updated_at = v_now
            where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'MILIK_OUTLET';
            insert into public.visit_stock_movements (distributor_id, visit_id, card_id, outlet_id, product_id, movement_type, quantity, prev_sales_stock, prev_outlet_stock, created_by, created_at)
            values (v_visit.distributor_id, p_visit_id, v_card.id, v_visit.outlet_id, v_card.product_id, 'SALES_OUT', v_card.sales_qty, v_prev_ss, v_prev_oc, p_actor_id, v_now);
          end if;
          v_stock_after := v_card.add_qty;

        when 'TOKO_BUKA' then
          -- restock dari sales stock -> outlet MILIK_OUTLET (LUNAS)
          if v_card.restock_qty > 0 then
            update public.sales_stock set quantity = quantity - v_card.restock_qty, updated_at = v_now
            where sales_id = v_visit.sales_id and product_id = v_card.product_id;
            update public.outlet_stock set quantity = quantity + v_card.restock_qty, updated_at = v_now
            where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'MILIK_OUTLET';
            insert into public.visit_stock_movements (distributor_id, visit_id, card_id, outlet_id, product_id, movement_type, quantity, prev_sales_stock, prev_outlet_stock, created_by, created_at)
            values (v_visit.distributor_id, p_visit_id, v_card.id, v_visit.outlet_id, v_card.product_id, 'RESTOCK_IN', v_card.restock_qty, v_prev_ss, v_prev_oc, p_actor_id, v_now);
            v_prev_oc := v_prev_oc + v_card.restock_qty;
          end if;
          if v_card.sales_qty > 0 then
            update public.outlet_stock set quantity = quantity - v_card.sales_qty, updated_at = v_now
            where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'MILIK_OUTLET';
            insert into public.visit_stock_movements (distributor_id, visit_id, card_id, outlet_id, product_id, movement_type, quantity, prev_sales_stock, prev_outlet_stock, created_by, created_at)
            values (v_visit.distributor_id, p_visit_id, v_card.id, v_visit.outlet_id, v_card.product_id, 'SALES_OUT', v_card.sales_qty, v_prev_ss, v_prev_oc, p_actor_id, v_now);
          end if;
          v_stock_after := v_card.physical_check + v_card.restock_qty - v_card.sales_qty;

        when 'TOKO_NONAKTIF' then
          -- restock from sales
          if v_card.restock_qty > 0 then
            update public.sales_stock set quantity = quantity - v_card.restock_qty, updated_at = v_now
            where sales_id = v_visit.sales_id and product_id = v_card.product_id;
            update public.outlet_stock set quantity = quantity + v_card.restock_qty, updated_at = v_now
            where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'KONSINYASI';
            insert into public.visit_stock_movements (distributor_id, visit_id, card_id, outlet_id, product_id, movement_type, quantity, prev_sales_stock, prev_outlet_stock, created_by, created_at)
            values (v_visit.distributor_id, p_visit_id, v_card.id, v_visit.outlet_id, v_card.product_id, 'RESTOCK_IN', v_card.restock_qty, v_prev_ss, v_prev_oc, p_actor_id, v_now);
            v_prev_oc := v_prev_oc + v_card.restock_qty;
          end if;
          if v_card.sales_qty > 0 then
            update public.outlet_stock set quantity = quantity - v_card.sales_qty, updated_at = v_now
            where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'KONSINYASI';
            insert into public.visit_stock_movements (distributor_id, visit_id, card_id, outlet_id, product_id, movement_type, quantity, prev_sales_stock, prev_outlet_stock, created_by, created_at)
            values (v_visit.distributor_id, p_visit_id, v_card.id, v_visit.outlet_id, v_card.product_id, 'SALES_OUT', v_card.sales_qty, v_prev_ss, v_prev_oc, p_actor_id, v_now);
          end if;
          -- ownership transfer remaining
          select quantity into v_prev_oc from public.outlet_stock
          where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'KONSINYASI';
          if v_prev_oc > 0 then
            insert into public.outlet_stock (distributor_id, outlet_id, product_id, quantity, ownership_type, updated_at)
            values (v_visit.distributor_id, v_visit.outlet_id, v_card.product_id, v_prev_oc, 'MILIK_OUTLET', v_now)
            on conflict (outlet_id, product_id, ownership_type)
            do update set quantity = outlet_stock.quantity + v_prev_oc, updated_at = v_now;
            update public.outlet_stock set quantity = 0, updated_at = v_now
            where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'KONSINYASI';
            insert into public.visit_stock_movements (distributor_id, visit_id, card_id, outlet_id, product_id, movement_type, quantity, prev_sales_stock, prev_outlet_stock, created_by, created_at)
            values (v_visit.distributor_id, p_visit_id, v_card.id, v_visit.outlet_id, v_card.product_id, 'OWNERSHIP_TRANSFER', v_prev_oc, v_prev_ss, v_prev_oc, p_actor_id, v_now);
          end if;
          v_stock_after := 0;

        when 'TOKO_TUTUP', 'MASIH_STOK' then
          v_stock_after := v_card.stock_before;
          -- No stock movement
      end case;

    else -- KONSINYASI
      case v_card.condition
        when 'TOKO_BARU' then
          if v_card.add_qty > 0 then
            update public.sales_stock set quantity = quantity - v_card.add_qty, updated_at = v_now
            where sales_id = v_visit.sales_id and product_id = v_card.product_id;
            update public.outlet_stock set quantity = quantity + v_card.add_qty, updated_at = v_now
            where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'KONSINYASI';
            insert into public.visit_stock_movements (distributor_id, visit_id, card_id, outlet_id, product_id, movement_type, quantity, prev_sales_stock, prev_outlet_stock, created_by, created_at)
            values (v_visit.distributor_id, p_visit_id, v_card.id, v_visit.outlet_id, v_card.product_id, 'ADD_IN', v_card.add_qty, v_prev_ss, v_prev_oc, p_actor_id, v_now);
          end if;
          v_stock_after := v_card.add_qty;

        when 'TOKO_BUKA' then
          -- laku lama = stock_before - physical_check (old_sales_qty)
          if v_card.old_sales_qty > 0 then
            update public.outlet_stock set quantity = quantity - v_card.old_sales_qty, updated_at = v_now
            where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'KONSINYASI';
            insert into public.visit_stock_movements (distributor_id, visit_id, card_id, outlet_id, product_id, movement_type, quantity, prev_sales_stock, prev_outlet_stock, created_by, created_at)
            values (v_visit.distributor_id, p_visit_id, v_card.id, v_visit.outlet_id, v_card.product_id, 'SALES_OUT', v_card.old_sales_qty, v_prev_ss, v_prev_oc, p_actor_id, v_now);
            v_prev_oc := v_prev_oc - v_card.old_sales_qty;
          end if;
          if v_card.restock_qty > 0 then
            update public.sales_stock set quantity = quantity - v_card.restock_qty, updated_at = v_now
            where sales_id = v_visit.sales_id and product_id = v_card.product_id;
            update public.outlet_stock set quantity = quantity + v_card.restock_qty, updated_at = v_now
            where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'KONSINYASI';
            insert into public.visit_stock_movements (distributor_id, visit_id, card_id, outlet_id, product_id, movement_type, quantity, prev_sales_stock, prev_outlet_stock, created_by, created_at)
            values (v_visit.distributor_id, p_visit_id, v_card.id, v_visit.outlet_id, v_card.product_id, 'RESTOCK_IN', v_card.restock_qty, v_prev_ss, v_prev_oc, p_actor_id, v_now);
            v_prev_oc := v_prev_oc + v_card.restock_qty;
          end if;
          if v_card.return_qty > 0 then
            update public.outlet_stock set quantity = quantity - v_card.return_qty, updated_at = v_now
            where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'KONSINYASI';
            update public.sales_stock set quantity = quantity + v_card.return_qty, updated_at = v_now
            where sales_id = v_visit.sales_id and product_id = v_card.product_id;
            insert into public.visit_stock_movements (distributor_id, visit_id, card_id, outlet_id, product_id, movement_type, quantity, prev_sales_stock, prev_outlet_stock, created_by, created_at)
            values (v_visit.distributor_id, p_visit_id, v_card.id, v_visit.outlet_id, v_card.product_id, 'RETURN_OUT', v_card.return_qty, v_prev_ss, v_prev_oc, p_actor_id, v_now);
            v_prev_oc := v_prev_oc - v_card.return_qty;
          end if;
          v_stock_after := v_card.physical_check + v_card.restock_qty - v_card.return_qty;

        when 'TOKO_NONAKTIF' then
          -- cek fisik, laku lama, sisa ditarik, stock_after=0
          if v_card.sales_qty > 0 then
            update public.outlet_stock set quantity = quantity - v_card.sales_qty, updated_at = v_now
            where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'KONSINYASI';
            insert into public.visit_stock_movements (distributor_id, visit_id, card_id, outlet_id, product_id, movement_type, quantity, prev_sales_stock, prev_outlet_stock, created_by, created_at)
            values (v_visit.distributor_id, p_visit_id, v_card.id, v_visit.outlet_id, v_card.product_id, 'SALES_OUT', v_card.sales_qty, v_prev_ss, v_prev_oc, p_actor_id, v_now);
            v_prev_oc := v_prev_oc - v_card.sales_qty;
          end if;
          if v_prev_oc > 0 then
            update public.outlet_stock set quantity = 0, updated_at = v_now
            where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'KONSINYASI';
            update public.sales_stock set quantity = quantity + v_prev_oc, updated_at = v_now
            where sales_id = v_visit.sales_id and product_id = v_card.product_id;
            insert into public.visit_stock_movements (distributor_id, visit_id, card_id, outlet_id, product_id, movement_type, quantity, prev_sales_stock, prev_outlet_stock, created_by, created_at)
            values (v_visit.distributor_id, p_visit_id, v_card.id, v_visit.outlet_id, v_card.product_id, 'RETURN_OUT', v_prev_oc, v_prev_ss, v_prev_oc, p_actor_id, v_now);
          end if;
          v_stock_after := 0;

        when 'TOKO_TUTUP', 'MASIH_STOK' then
          v_stock_after := v_card.stock_before;
      end case;
    end if;

    -- Update card stock_after
    update public.visit_product_cards set stock_after = v_stock_after, updated_at = v_now where id = v_card.id;

    -- REQUIRED PHOTO validation (DBML: finalisasi wajib DITOLAK bila foto wajib belum tersedia)
    if v_card.condition in ('TOKO_BARU', 'TOKO_BUKA', 'TOKO_NONAKTIF', 'MASIH_STOK') then
      if not exists (
        select 1 from public.visit_photos
        where visit_id = p_visit_id and card_id = v_card.id and photo_type = 'FOTO_PRODUK'
      ) then
        raise exception 'Kartu % wajib memiliki foto produk (FOTO_PRODUK).', v_card.id;
      end if;
    end if;
    if v_card.condition in ('TOKO_TUTUP', 'TOKO_NONAKTIF', 'MASIH_STOK') then
      if not exists (
        select 1 from public.visit_photos
        where visit_id = p_visit_id and photo_type = 'FOTO_AKHIR'
      ) then
        raise exception 'Visit wajib memiliki foto akhir (FOTO_AKHIR) untuk kartu %.', v_card.id;
      end if;
      if btrim(coalesce(v_card.alasan, '')) = '' then
        raise exception 'Kartu % wajib memiliki alasan untuk kondisi %.', v_card.id, v_card.condition;
      end if;
    end if;

    -- PAYMENT INVARIANT validation (amount_paid + receivable = amount_due per card)
    if v_card.amount_due > 0 then
      if v_visit.transaction_status = 'LUNAS' and (v_card.amount_paid is null or v_card.amount_paid < v_card.amount_due) then
        raise exception 'Kartu % wajib LUNAS penuh (amount_paid = amount_due).', v_card.id;
      end if;
      if v_card.amount_paid is not null and v_card.amount_paid > v_card.amount_due then
        raise exception 'Kartu % amount_paid melebihi amount_due.', v_card.id;
      end if;
    end if;

    -- Accumulate transaction totals if this card has sales/revenue
    if v_card.amount_due > 0 then
      v_has_sale := true;
      v_total_amount := v_total_amount + v_card.amount_due;
      v_total_paid := v_total_paid + v_card.amount_paid;
    end if;
  end loop;

  -- Create transaction if there are sales
  if v_has_sale and v_total_amount > 0 then
    v_trx_number := 'TRX-' || to_char(v_visit.visit_date, 'YYYYMMDD') || '-' || left(replace(v_visit.id::text, '-', ''), 8);

    insert into public.transactions (distributor_id, visit_id, transaction_number, transaction_status, transaction_date, total_amount, amount_paid, receivable_amount, created_by, created_at, updated_at)
    values (v_visit.distributor_id, p_visit_id, v_trx_number, v_visit.transaction_status, v_visit.visit_date, v_total_amount, v_total_paid, v_total_amount - v_total_paid, p_actor_id, v_now, v_now)
    returning id into v_transaction_id;

    for v_card in
      select * from public.visit_product_cards where visit_id = p_visit_id and amount_due > 0
    loop
      insert into public.transaction_items (distributor_id, transaction_id, visit_product_card_id, product_id, quantity, selling_price, discount, line_total, created_at)
      values (v_visit.distributor_id, v_transaction_id, v_card.id, v_card.product_id, v_card.sales_qty + v_card.old_sales_qty, v_card.selling_price, 0, v_card.amount_due, v_now);
    end loop;
  end if;

  -- Create receivables for unpaid KONSINYASI balances (PAYMENT INVARIANT)
  for v_card in
    select * from public.visit_product_cards where visit_id = p_visit_id and amount_due > 0
  loop
    if v_card.amount_due - coalesce(v_card.amount_paid, 0) > 0 then
      if v_visit.transaction_status = 'KONSINYASI' then
        insert into public.visit_receivables (visit_id, card_id, amount, paid_amount, status, due_date, created_by, created_at, updated_at)
        values (p_visit_id, v_card.id, v_card.amount_due - coalesce(v_card.amount_paid, 0), 0, 'OPEN', null, p_actor_id, v_now, v_now);
      else
        raise exception 'Kartu % tidak boleh memiliki sisa tagihan pada mode LUNAS.', v_card.id;
      end if;
    end if;
  end loop;

  -- Mark cards as APPLIED (status machine DRAFT -> APPLIED)
  update public.visit_product_cards set status = 'APPLIED', updated_at = v_now
  where visit_id = p_visit_id and status = 'DRAFT';

  insert into public.visit_events (visit_id, event_type, actor_id, metadata, created_at)
  values (p_visit_id, 'CARD_APPLIED', p_actor_id, '{}'::jsonb, v_now);

  -- Finalize visit
  update public.visits
  set status = 'FINALIZED', finalized_at = v_now, finalized_by = p_actor_id, checkout_at = v_now, updated_at = v_now
  where id = p_visit_id;

  insert into public.visit_events (visit_id, event_type, actor_id, metadata, created_at)
  values (p_visit_id, 'VISIT_FINALIZED', p_actor_id, jsonb_build_object('transaction_id', v_transaction_id), v_now);

  return jsonb_build_object('visit_id', p_visit_id, 'status', 'FINALIZED', 'transaction_id', v_transaction_id, 'total_amount', v_total_amount);
end;
$fn$;

-- =============================================================================
-- SECTION 19: RPC — SETTLE RECEIVABLE
-- =============================================================================

create or replace function public.settle_receivable(
  p_receivable_id uuid,
  p_amount decimal,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to pg_catalog, public
as $fn$
declare
  v_rec public.visit_receivables%rowtype;
  v_now timestamptz := now();
  v_new_paid decimal;
begin
  if p_amount <= 0 then raise exception 'Payment amount must be positive.'; end if;

  select * into v_rec from public.visit_receivables where id = p_receivable_id for update;
  if not found then raise exception 'Receivable not found.'; end if;
  if v_rec.status = 'PAID' then raise exception 'Receivable already fully paid.'; end if;

  v_new_paid := v_rec.paid_amount + p_amount;
  if v_new_paid > v_rec.amount then
    raise exception 'Payment exceeds receivable amount.';
  end if;

  update public.visit_receivables
  set paid_amount = v_new_paid,
      status = case when v_new_paid >= amount then 'PAID' else 'PARTIAL' end,
      settled_at = case when v_new_paid >= amount then v_now else settled_at end,
      updated_at = v_now
  where id = p_receivable_id;

  insert into public.visit_events (visit_id, event_type, actor_id, metadata, created_at)
  values (v_rec.visit_id, 'RECEIVABLE_SETTLED', p_actor_id,
          jsonb_build_object('receivable_id', p_receivable_id, 'amount_paid', p_amount, 'total_paid', v_new_paid), v_now);

  return jsonb_build_object('receivable_id', p_receivable_id, 'paid_amount', v_new_paid, 'status', case when v_new_paid >= v_rec.amount then 'PAID' else 'PARTIAL' end);
end;
$fn$;

-- =============================================================================
-- SECTION 20: GRANTS / REVOKES
-- =============================================================================

-- Revoke all from public/anon/authenticated, grant to service_role only
revoke all on function public.assign_outlet_to_rute(uuid,uuid,uuid,uuid) from public;
revoke all on function public.assign_outlet_to_rute(uuid,uuid,uuid,uuid) from anon;
revoke all on function public.assign_outlet_to_rute(uuid,uuid,uuid,uuid) from authenticated;
grant execute on function public.assign_outlet_to_rute(uuid,uuid,uuid,uuid) to service_role;

revoke all on function public.assign_sales_to_rute(uuid,uuid,uuid,uuid) from public;
revoke all on function public.assign_sales_to_rute(uuid,uuid,uuid,uuid) from anon;
revoke all on function public.assign_sales_to_rute(uuid,uuid,uuid,uuid) from authenticated;
grant execute on function public.assign_sales_to_rute(uuid,uuid,uuid,uuid) to service_role;

revoke all on function public.sj_create(uuid,uuid,public.sj_direction,date,uuid,jsonb) from public;
revoke all on function public.sj_create(uuid,uuid,public.sj_direction,date,uuid,jsonb) from anon;
revoke all on function public.sj_create(uuid,uuid,public.sj_direction,date,uuid,jsonb) from authenticated;
grant execute on function public.sj_create(uuid,uuid,public.sj_direction,date,uuid,jsonb) to service_role;

revoke all on function public.sj_ready(uuid,uuid) from public;
revoke all on function public.sj_ready(uuid,uuid) from anon;
revoke all on function public.sj_ready(uuid,uuid) from authenticated;
grant execute on function public.sj_ready(uuid,uuid) to service_role;

revoke all on function public.sj_check(uuid,uuid,jsonb) from public;
revoke all on function public.sj_check(uuid,uuid,jsonb) from anon;
revoke all on function public.sj_check(uuid,uuid,jsonb) from authenticated;
grant execute on function public.sj_check(uuid,uuid,jsonb) to service_role;

revoke all on function public.sj_resolve(uuid,uuid,jsonb) from public;
revoke all on function public.sj_resolve(uuid,uuid,jsonb) from anon;
revoke all on function public.sj_resolve(uuid,uuid,jsonb) from authenticated;
grant execute on function public.sj_resolve(uuid,uuid,jsonb) to service_role;

revoke all on function public.sj_confirm(uuid,uuid) from public;
revoke all on function public.sj_confirm(uuid,uuid) from anon;
revoke all on function public.sj_confirm(uuid,uuid) from authenticated;
grant execute on function public.sj_confirm(uuid,uuid) to service_role;

revoke all on function public.sj_complete(uuid,uuid) from public;
revoke all on function public.sj_complete(uuid,uuid) from anon;
revoke all on function public.sj_complete(uuid,uuid) from authenticated;
grant execute on function public.sj_complete(uuid,uuid) to service_role;

revoke all on function public.checkin_validate(uuid,uuid,uuid,decimal,decimal,uuid) from public;
revoke all on function public.checkin_validate(uuid,uuid,uuid,decimal,decimal,uuid) from anon;
revoke all on function public.checkin_validate(uuid,uuid,uuid,decimal,decimal,uuid) from authenticated;
grant execute on function public.checkin_validate(uuid,uuid,uuid,decimal,decimal,uuid) to service_role;

revoke all on function public.finalize_visit(uuid,uuid) from public;
revoke all on function public.finalize_visit(uuid,uuid) from anon;
revoke all on function public.finalize_visit(uuid,uuid) from authenticated;
grant execute on function public.finalize_visit(uuid,uuid) to service_role;

revoke all on function public.settle_receivable(uuid,decimal,uuid) from public;
revoke all on function public.settle_receivable(uuid,decimal,uuid) from anon;
revoke all on function public.settle_receivable(uuid,decimal,uuid) from authenticated;
grant execute on function public.settle_receivable(uuid,decimal,uuid) to service_role;

-- =============================================================================
-- SECTION 21: STORAGE BUCKETS
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('visit-photos', 'visit-photos', false, 10485760, array['image/jpeg','image/png','image/webp']),
  ('visit-documents', 'visit-documents', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf']),
  ('outlet-photos', 'outlet-photos', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
