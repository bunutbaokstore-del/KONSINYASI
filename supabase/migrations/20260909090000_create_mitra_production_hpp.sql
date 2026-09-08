-- WS-1 STEP 2A — Persistent Mitra Production HPP Foundation
-- Forward-only, additive. No backfill, no trigger, no RPC, no REST write.
-- Mirrors the mitra_production_stock / mitra_production_events tenant pattern.

create table if not exists public.mitra_production_hpp (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references auth.users(id) on delete restrict,
  mitra_user_id uuid not null references auth.users(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  components jsonb not null default '[]'::jsonb,
  output_quantity integer not null check (output_quantity >= 1),
  total_raw_materials numeric(14,2) not null default 0 check (total_raw_materials >= 0),
  total_supporting_materials numeric(14,2) not null default 0 check (total_supporting_materials >= 0),
  total_labor numeric(14,2) not null default 0 check (total_labor >= 0),
  total_production_cost numeric(14,2) not null default 0 check (total_production_cost >= 0),
  cost_per_unit numeric(14,2) not null default 0 check (cost_per_unit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mitra_production_hpp_business_key
    unique (distributor_id, mitra_user_id, product_id)
);

create index if not exists mitra_production_hpp_mitra_idx
  on public.mitra_production_hpp (mitra_user_id, distributor_id, updated_at desc);

create index if not exists mitra_production_hpp_distributor_idx
  on public.mitra_production_hpp (distributor_id, product_id, updated_at desc);

alter table public.mitra_production_hpp enable row level security;

create policy "Mitra can read own production hpp"
  on public.mitra_production_hpp
  for select
  to authenticated
  using (
    auth.uid() = mitra_user_id
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'mitra_umkm'
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
  );

create policy "Distributor can read workspace production hpp"
  on public.mitra_production_hpp
  for select
  to authenticated
  using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'distributor'
    and auth.uid() = distributor_id
  );

create policy "Admin can read workspace production hpp"
  on public.mitra_production_hpp
  for select
  to authenticated
  using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
  );

-- No client INSERT/UPDATE/DELETE policies. Writes are server-authoritative.