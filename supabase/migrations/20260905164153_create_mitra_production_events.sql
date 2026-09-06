-- PHASE 2A.2 — Persistent Production Event Foundation
-- Production events only. No stock increment, shipment, receiving, or ledger.

create table if not exists public.mitra_production_events (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references auth.users(id) on delete cascade,
  mitra_user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  production_date date not null,
  budget_period text not null check (budget_period in ('Hari', 'Minggu', 'Bulan')),
  target_quantity integer not null default 0 check (target_quantity >= 0),
  actual_quantity integer check (actual_quantity >= 0),
  damaged_quantity integer not null default 0 check (damaged_quantity >= 0),
  yield_percentage numeric(7,2) check (yield_percentage >= 0),
  notes text not null default '',
  result_notes text not null default '',
  status text not null default 'planned' check (status in ('planned', 'completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint mitra_production_events_completion_fields_check check (
    (status = 'planned' and actual_quantity is null and completed_at is null)
    or
    (status = 'completed' and actual_quantity is not null and actual_quantity > 0 and completed_at is not null)
  )
);

create index if not exists mitra_production_events_mitra_status_date_idx
  on public.mitra_production_events (mitra_user_id, status, production_date desc);

create index if not exists mitra_production_events_distributor_status_date_idx
  on public.mitra_production_events (distributor_id, status, production_date desc);

create index if not exists mitra_production_events_product_date_idx
  on public.mitra_production_events (product_id, production_date desc);

create or replace function public.prevent_completed_mitra_production_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.status = 'completed' then
    raise exception using errcode = '55000', message = 'Completed production events are immutable.';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists prevent_completed_mitra_production_event_mutation
  on public.mitra_production_events;
create trigger prevent_completed_mitra_production_event_mutation
before update or delete on public.mitra_production_events
for each row execute function public.prevent_completed_mitra_production_event_mutation();

alter table public.mitra_production_events enable row level security;

create policy "Mitra can read own production events"
  on public.mitra_production_events
  for select
  to authenticated
  using (
    auth.uid() = mitra_user_id
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'mitra_umkm'
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
  );

create policy "Distributor can read workspace production events"
  on public.mitra_production_events
  for select
  to authenticated
  using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'distributor'
    and auth.uid() = distributor_id
  );

create policy "Admin can read workspace production events"
  on public.mitra_production_events
  for select
  to authenticated
  using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
  );

-- No client INSERT/UPDATE/DELETE policies. Writes are server-authoritative.
-- Phase 2A.2 intentionally does not modify mitra_production_stock.
