-- WS-1 STEP 3B — Persistent Mitra Production Budgets
-- Forward-only, additive. No backfill, no trigger, no RPC, no REST write.
-- Mirrors the mitra_production_hpp tenant pattern.

create table if not exists public.mitra_production_budgets (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references auth.users(id) on delete restrict,
  mitra_user_id uuid not null references auth.users(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  period text not null check (period in ('Hari', 'Minggu', 'Bulan')),
  production_budget numeric(14,2) not null default 0 check (production_budget >= 0),
  production_target integer not null default 0 check (production_target >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mitra_production_budgets_business_key
    unique (distributor_id, mitra_user_id, product_id, period)
);

create index if not exists mitra_production_budgets_mitra_idx
  on public.mitra_production_budgets (mitra_user_id, distributor_id, period);

create index if not exists mitra_production_budgets_distributor_idx
  on public.mitra_production_budgets (distributor_id, product_id, period);

alter table public.mitra_production_budgets enable row level security;

create policy "Mitra can read own production budgets"
  on public.mitra_production_budgets
  for select
  to authenticated
  using (
    auth.uid() = mitra_user_id
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'mitra_umkm'
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
  );

create policy "Distributor can read workspace production budgets"
  on public.mitra_production_budgets
  for select
  to authenticated
  using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'distributor'
    and auth.uid() = distributor_id
  );

create policy "Admin can read workspace production budgets"
  on public.mitra_production_budgets
  for select
  to authenticated
  using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
  );

-- No client INSERT/UPDATE/DELETE policies. Writes are server-authoritative.