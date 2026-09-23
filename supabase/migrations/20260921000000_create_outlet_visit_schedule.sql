-- =============================================================================
-- OUTLET VISIT SCHEDULE (Hari Kunjungan Outlet)
-- Creates day_of_week enum and outlet_visit_schedule table
-- Forward-only, idempotent, tenant-isolated (distributor_id)
-- =============================================================================

-- =============================================================================
-- 1. ENUM: day_of_week
-- =============================================================================
do $$ begin
  if not exists (select 1 from pg_type where typname = 'day_of_week') then
    create type public.day_of_week as enum (
      'MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'
    );
  end if;
end $$;

-- =============================================================================
-- 2. TABLE: outlet_visit_schedule
-- =============================================================================
create table if not exists public.outlet_visit_schedule (
  id uuid not null default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete restrict,
  outlet_id uuid not null references public.outlets(id) on delete restrict,
  day_of_week public.day_of_week not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outlet_visit_schedule_pkey primary key (id),
  constraint outlet_visit_schedule_tenant_unique unique (distributor_id, id),
  constraint outlet_visit_schedule_outlet_day_unique unique (distributor_id, outlet_id, day_of_week)
);

-- =============================================================================
-- 3. INDEXES
-- =============================================================================
-- Query by outlet
create index if not exists outlet_visit_schedule_outlet_idx
  on public.outlet_visit_schedule (distributor_id, outlet_id);

-- Query by day (e.g., "show all outlets scheduled for Monday")
create index if not exists outlet_visit_schedule_day_idx
  on public.outlet_visit_schedule (distributor_id, day_of_week);

-- =============================================================================
-- 4. ROW LEVEL SECURITY
-- =============================================================================
alter table public.outlet_visit_schedule enable row level security;

-- SELECT: admin & distributor within tenant
drop policy if exists "outlet_visit_schedule_tenant_select" on public.outlet_visit_schedule;
create policy "outlet_visit_schedule_tenant_select" on public.outlet_visit_schedule
  for select using (
    auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
    and distributor_id = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')::uuid
  );

-- INSERT: admin only (created_by = auth.uid())
drop policy if exists "outlet_visit_schedule_tenant_insert" on public.outlet_visit_schedule;
create policy "outlet_visit_schedule_tenant_insert" on public.outlet_visit_schedule
  for insert with check (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
    and created_by = auth.uid()
  );

-- UPDATE: admin only
drop policy if exists "outlet_visit_schedule_tenant_update" on public.outlet_visit_schedule;
create policy "outlet_visit_schedule_tenant_update" on public.outlet_visit_schedule
  for update using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
  );

-- DELETE: admin only (hard delete allowed for schedule management)
drop policy if exists "outlet_visit_schedule_tenant_delete" on public.outlet_visit_schedule;
create policy "outlet_visit_schedule_tenant_delete" on public.outlet_visit_schedule
  for delete using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
  );

-- =============================================================================
-- 5. RPC: ATOMIC BULK UPSERT OUTLET VISIT SCHEDULE
-- =============================================================================
create or replace function public.bulk_upsert_outlet_visit_schedule(
  p_outlet_id uuid,
  p_days public.day_of_week[],
  p_distributor_id uuid,
  p_assigned_by uuid
)
returns table (success boolean, days public.day_of_week[])
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare
  v_outlet_distributor uuid;
  v_outlet_active boolean;
  v_admin_metadata jsonb;
begin
  -- Verify admin authorization
  select raw_app_meta_data into v_admin_metadata
    from auth.users
   where id = p_assigned_by;

  if not found
     or coalesce(v_admin_metadata ->> 'role', '') <> 'admin'
     or coalesce(v_admin_metadata ->> 'distributor_id', '') <> p_distributor_id::text then
    raise exception using errcode = '42501', message = 'Admin tidak memiliki akses ke ruang kerja Distributor ini.';
  end if;

  -- Verify outlet exists and belongs to distributor
  select distributor_id, status = 'ACTIVE' into v_outlet_distributor, v_outlet_active
    from public.outlets
   where id = p_outlet_id and distributor_id = p_distributor_id;

  if v_outlet_distributor is null then
    raise exception using errcode = 'P0002', message = 'Outlet tidak ditemukan pada ruang kerja ini.';
  end if;

  -- Atomic replace schedule using CTE (single statement = atomic in PostgreSQL)
  with deleted as (
    delete from public.outlet_visit_schedule
    where distributor_id = p_distributor_id and outlet_id = p_outlet_id
    returning *
  )
  insert into public.outlet_visit_schedule (distributor_id, outlet_id, day_of_week, created_by)
  select p_distributor_id, p_outlet_id, unnest(p_days), p_assigned_by
  where array_length(p_days, 1) > 0;

  return query select true as success, p_days as days;
end;
$fn$;

-- =============================================================================
-- 6. GRANTS
-- =============================================================================
revoke all on function public.bulk_upsert_outlet_visit_schedule(uuid, public.day_of_week[], uuid, uuid) from public;
revoke all on function public.bulk_upsert_outlet_visit_schedule(uuid, public.day_of_week[], uuid, uuid) from anon;
revoke all on function public.bulk_upsert_outlet_visit_schedule(uuid, public.day_of_week[], uuid, uuid) from authenticated;
grant execute on function public.bulk_upsert_outlet_visit_schedule(uuid, public.day_of_week[], uuid, uuid) to service_role;