-- PHASE 2A — Persistent Production Stock Foundation
-- Additive only. No legacy backfill, shipment, receiving, or stock movement changes.

create table if not exists public.mitra_production_stock (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references auth.users(id) on delete cascade,
  mitra_user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  available_quantity integer not null default 0 check (available_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mitra_production_stock_business_key
    unique (distributor_id, mitra_user_id, product_id)
);

create index if not exists mitra_production_stock_mitra_idx
  on public.mitra_production_stock (mitra_user_id, distributor_id, updated_at desc);

create index if not exists mitra_production_stock_distributor_idx
  on public.mitra_production_stock (distributor_id, product_id, updated_at desc);

alter table public.mitra_production_stock enable row level security;

create policy "Mitra can read own production stock"
  on public.mitra_production_stock
  for select
  to authenticated
  using (
    auth.uid() = mitra_user_id
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'mitra_umkm'
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
  );

create policy "Distributor can read workspace production stock"
  on public.mitra_production_stock
  for select
  to authenticated
  using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'distributor'
    and auth.uid() = distributor_id
  );

create policy "Admin can read workspace production stock"
  on public.mitra_production_stock
  for select
  to authenticated
  using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
  );
