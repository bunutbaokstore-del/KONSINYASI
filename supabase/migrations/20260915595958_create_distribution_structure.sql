-- PHASE IMPLEMENTATION: ADMIN -> DISTRIBUSI -> WILAYAH
-- Workflow: Wilayah -> Rute -> {Outlet, Sales Motoris} (assign/reassign) + riwayat.
-- Forward-only, idempotent, tenant-isolated (distributor_id), appended BEFORE the
-- SEC-01 terminal migration (20260916000000) so that file remains the last one.

-- =============================================================================
-- 1. WILAYAH
-- =============================================================================
create table if not exists public.wilayah (
  id uuid not null default gen_random_uuid(),
  distributor_id uuid not null references auth.users (id) on delete restrict,
  kode text not null,
  nama text not null,
  keterangan text,
  is_active boolean not null default true,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wilayah_pkey primary key (id),
  constraint wilayah_tenant_unique unique (distributor_id, id),
  constraint wilayah_kode_check check (char_length(btrim(kode)) between 1 and 40),
  constraint wilayah_nama_check check (char_length(btrim(nama)) between 2 and 120),
  constraint wilayah_keterangan_check check (
    keterangan is null or char_length(btrim(keterangan)) <= 500
  )
);

create unique index if not exists wilayah_distributor_kode_key
  on public.wilayah (distributor_id, lower(btrim(kode)));

create index if not exists wilayah_distributor_idx on public.wilayah (distributor_id, is_active);

-- =============================================================================
-- 2. RUTE
-- =============================================================================
create table if not exists public.rute (
  id uuid not null default gen_random_uuid(),
  distributor_id uuid not null,
  wilayah_id uuid not null,
  kode text not null,
  nama text not null,
  keterangan text,
  is_active boolean not null default true,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rute_pkey primary key (id),
  constraint rute_tenant_unique unique (distributor_id, id),
  constraint rute_wilayah_tenant_fk foreign key (distributor_id, wilayah_id)
    references public.wilayah (distributor_id, id) on delete restrict,
  constraint rute_kode_check check (char_length(btrim(kode)) between 1 and 40),
  constraint rute_nama_check check (char_length(btrim(nama)) between 2 and 120),
  constraint rute_keterangan_check check (
    keterangan is null or char_length(btrim(keterangan)) <= 500
  )
);

create unique index if not exists rute_distributor_kode_key
  on public.rute (distributor_id, lower(btrim(kode)));

create index if not exists rute_wilayah_idx on public.rute (distributor_id, wilayah_id, is_active);

-- =============================================================================
-- 3. OUTLET
-- =============================================================================
create table if not exists public.outlet (
  id uuid not null default gen_random_uuid(),
  distributor_id uuid not null references auth.users (id) on delete restrict,
  kode text not null,
  nama text not null,
  alamat text not null,
  is_active boolean not null default true,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outlet_pkey primary key (id),
  constraint outlet_tenant_unique unique (distributor_id, id),
  constraint outlet_kode_check check (char_length(btrim(kode)) between 1 and 40),
  constraint outlet_nama_check check (char_length(btrim(nama)) between 2 and 120),
  constraint outlet_alamat_check check (char_length(btrim(alamat)) between 3 and 500)
);

create unique index if not exists outlet_distributor_kode_key
  on public.outlet (distributor_id, lower(btrim(kode)));

create index if not exists outlet_distributor_idx on public.outlet (distributor_id, is_active);

-- =============================================================================
-- 4. RUTE_OUTLET_ASSIGNMENTS (history-aware; one active assignment per outlet)
-- =============================================================================
create table if not exists public.rute_outlet_assignments (
  id uuid not null default gen_random_uuid(),
  distributor_id uuid not null references auth.users (id) on delete restrict,
  rute_id uuid not null,
  outlet_id uuid not null,
  assigned_by uuid not null references auth.users (id) on delete restrict,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint rute_outlet_assignments_pkey primary key (id),
  constraint rute_outlet_assignments_rute_tenant_fk foreign key (distributor_id, rute_id)
    references public.rute (distributor_id, id) on delete restrict,
  constraint rute_outlet_assignments_outlet_tenant_fk foreign key (distributor_id, outlet_id)
    references public.outlet (distributor_id, id) on delete restrict,
  constraint rute_outlet_assignments_period_check check (
    ended_at is null or ended_at >= assigned_at
  )
);

create unique index if not exists rute_outlet_assignments_one_active_key
  on public.rute_outlet_assignments (distributor_id, outlet_id) 
  where is_active;

create index if not exists rute_outlet_assignments_outlet_idx
  on public.rute_outlet_assignments (distributor_id, outlet_id, ended_at)
  where ended_at is null;

create index if not exists rute_outlet_assignments_rute_idx
  on public.rute_outlet_assignments (distributor_id, rute_id);

-- =============================================================================
-- 5. RUTE_SALES_ASSIGNMENTS (same; one active assignment per sales_motoris)
-- =============================================================================
create table if not exists public.rute_sales_assignments (
  id uuid not null default gen_random_uuid(),
  distributor_id uuid not null references auth.users (id) on delete restrict,
  rute_id uuid not null,
  sales_id uuid not null references auth.users (id) on delete restrict,
  assigned_by uuid not null references auth.users (id) on delete restrict,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint rute_sales_assignments_pkey primary key (id),
  constraint rute_sales_assignments_rute_tenant_fk foreign key (distributor_id, rute_id)
    references public.rute (distributor_id, id) on delete restrict,
  constraint rute_sales_assignments_sales_tenant_fk foreign key (distributor_id, sales_id)
    references public.rute_sales_assignments (distributor_id, id) on delete restrict,
  constraint rute_sales_assignments_period_check check (
    ended_at is null or ended_at >= assigned_at
  )
);

create unique index if not exists rute_sales_assignments_one_active_key
  on public.rute_sales_assignments (distributor_id, sales_id) 
  where is_active;

create index if not exists rute_sales_assignments_sales_idx
  on public.rute_sales_assignments (distributor_id, sales_id, ended_at)
  where ended_at is null;

create index if not exists rute_sales_assignments_rute_idx
  on public.rute_sales_assignments (distributor_id, rute_id);

-- =============================================================================
-- 6. ASSIGNMENT_HISTORY (append-only)
-- =============================================================================
create table if not exists public.assignment_history (
  id uuid not null default gen_random_uuid(),
  distributor_id uuid not null references auth.users (id) on delete restrict,
  entity_type text not null,
  entity_id uuid not null,
  from_rute_id uuid,
  to_rute_id uuid,
  action text not null,
  changed_by uuid not null references auth.users (id) on delete restrict,
  changed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint assignment_history_pkey primary key (id),
  constraint assignment_history_from_rute_tenant_fk foreign key (distributor_id, from_rute_id)
    references public.rute (distributor_id, id) on delete restrict,
  constraint assignment_history_to_rute_tenant_fk foreign key (distributor_id, to_rute_id)
    references public.rute (distributor_id, id) on delete restrict,
  constraint assignment_history_entity_type_check check (entity_type in ('outlet', 'sales')),
  constraint assignment_history_action_check check (action in ('assign', 'reassign', 'unassign')),
  constraint assignment_history_ruteless_assign_check check (
    action <> 'unassign' or to_rute_id is null
  )
);

create index if not exists assignment_history_entity_idx
  on public.assignment_history (distributor_id, entity_type, entity_id, changed_at desc);

create index if not exists assignment_history_to_rute_idx
  on public.assignment_history (distributor_id, to_rute_id, changed_at desc);

create index if not exists assignment_history_from_rute_idx
  on public.assignment_history (distributor_id, from_rute_id, changed_at desc);

-- =============================================================================
-- 7. ROW LEVEL SECURITY (tenant-isolated; no DELETE/DROP anywhere)
-- =============================================================================
alter table public.wilayah enable row level security;
alter table public.rute enable row level security;
alter table public.outlet enable row level security;
alter table public.rute_outlet_assignments enable row level security;
alter table public.rute_sales_assignments enable row level security;
alter table public.assignment_history enable row level security;

drop policy if exists "wilayah_tenant_select" on public.wilayah;
create policy "wilayah_tenant_select" on public.wilayah
  for select using (
    auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
    and distributor_id = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')::uuid
  );

drop policy if exists "wilayah_tenant_insert" on public.wilayah;
create policy "wilayah_tenant_insert" on public.wilayah
  for insert with check (
    auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
    and created_by = auth.uid()
  );

drop policy if exists "wilayah_tenant_update" on public.wilayah;
create policy "wilayah_tenant_update" on public.wilayah
  for update using (
    auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
  );

drop policy if exists "rute_tenant_select" on public.rute;
create policy "rute_tenant_select" on public.rute
  for select using (
    auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
    and distributor_id = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')::uuid
  );

drop policy if exists "rute_tenant_insert" on public.rute;
create policy "rute_tenant_insert" on public.rute
  for insert with check (
    auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
    and created_by = auth.uid()
  );

drop policy if exists "rute_tenant_update" on public.rute;
create policy "rute_tenant_update" on public.rute
  for update using (
    auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
  );

drop policy if exists "outlet_tenant_select" on public.outlet;
create policy "outlet_tenant_select" on public.outlet
  for select using (
    auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
    and distributor_id = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')::uuid
  );

drop policy if exists "outlet_tenant_insert" on public.outlet;
create policy "outlet_tenant_insert" on public.outlet
  for insert with check (
    auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
    and created_by = auth.uid()
  );

drop policy if exists "outlet_tenant_update" on public.outlet;
create policy "outlet_tenant_update" on public.outlet
  for update using (
    auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
  );

drop policy if exists "rute_outlet_assignments_tenant_select" on public.rute_outlet_assignments;
create policy "rute_outlet_assignments_tenant_select" on public.rute_outlet_assignments
  for select using (
    auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
    and distributor_id = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')::uuid
  );

drop policy if exists "rute_outlet_assignments_tenant_insert" on public.rute_outlet_assignments;
create policy "rute_outlet_assignments_tenant_insert" on public.rute_outlet_assignments
  for insert with check (
    auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
    and assigned_by = auth.uid()
  );

drop policy if exists "rute_outlet_assignments_tenant_update" on public.rute_outlet_assignments;
create policy "rute_outlet_assignments_tenant_update" on public.rute_outlet_assignments
  for update using (
    auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
  );

drop policy if exists "rute_sales_assignments_tenant_select" on public.rute_sales_assignments;
create policy "rute_sales_assignments_tenant_select" on public.rute_sales_assignments
  for select using (
    auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
    and distributor_id = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')::uuid
  );

drop policy if exists "rute_sales_assignments_tenant_insert" on public.rute_sales_assignments;
create policy "rute_sales_assignments_tenant_insert" on public.rute_sales_assignments
  for insert with check (
    auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
    and assigned_by = auth.uid()
  );

drop policy if exists "rute_sales_assignments_tenant_update" on public.rute_sales_assignments;
create policy "rute_sales_assignments_tenant_update" on public.rute_sales_assignments
  for update using (
    auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
  );

drop policy if exists "assignment_history_tenant_select" on public.assignment_history;
create policy "assignment_history_tenant_select" on public.assignment_history
  for select using (
    auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
    and distributor_id = (auth.jwt() -> 'app_metadata' ->> 'distributor_id')::uuid
  );

-- No INSERT/UPDATE/DELETE policy on assignment_history: append-only.
-- History is written only by the security-definer RPCs below (service_role).

-- =============================================================================
-- 8. SALES ASSIGNMENT TRIGGER (direct-insert hardening; bypassed by RPC)
-- =============================================================================
create or replace function public.validate_sales_assignment() returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_metadata jsonb;
begin
  select raw_app_meta_data into v_metadata
    from auth.users
   where id = new.sales_id;

  if not found then
    raise exception using errcode = '22000', message = 'Sales tidak ditemukan.';
  end if;

  if coalesce(v_metadata ->> 'role', '') <> 'sales_motoris' then
    raise exception using errcode = '22000', message = 'Pengguna yang ditugaskan bukan Sales (sales_motoris).';
  end if;

  if coalesce(v_metadata ->> 'distributor_id', '') <> new.distributor_id::text then
    raise exception using errcode = '22000', message = 'Sales tidak berada pada ruang kerja Distributor ini.';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_validate_sales_assignment on public.rute_sales_assignments;
create trigger trg_validate_sales_assignment
  before insert or update of sales_id, distributor_id on public.rute_sales_assignments
  for each row execute function public.validate_sales_assignment();

-- =============================================================================
-- 9. RPC: assign / reassign an OUTLET to a RUTE (transactional, admin-only)
-- =============================================================================
create or replace function public.assign_outlet_to_rute(
  p_outlet_id uuid,
  p_rute_id uuid,
  p_distributor_id uuid,
  p_assigned_by uuid
)
returns table (assignment_id uuid, action text, previous_rute_id uuid, assigned_at timestamptz)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_admin_metadata jsonb;
  v_outlet_distributor uuid;
  v_outlet_active boolean;
  v_rute_distributor uuid;
  v_rute_active boolean;
  v_previous_rute uuid;
  v_assignment_id uuid;
  v_now timestamptz := now();
begin
  select raw_app_meta_data into v_admin_metadata
    from auth.users
   where id = p_assigned_by;

  if not found
     or coalesce(v_admin_metadata ->> 'role', '') <> 'admin'
     or coalesce(v_admin_metadata ->> 'distributor_id', '') <> p_distributor_id::text then
    raise exception using errcode = '42501', message = 'Admin tidak memiliki akses ke ruang kerja Distributor ini.';
  end if;

  select distributor_id, is_active into v_outlet_distributor, v_outlet_active
    from public.outlet
   where id = p_outlet_id and distributor_id = p_distributor_id;

  if v_outlet_distributor is null then
    raise exception using errcode = 'P0002', message = 'Outlet tidak ditemukan pada ruang kerja ini.';
  end if;

  if not v_outlet_active then
    raise exception using errcode = '22000', message = 'Outlet sedang nonaktif.';
  end if;

  select distributor_id, is_active into v_rute_distributor, v_rute_active
    from public.rute
   where id = p_rute_id and distributor_id = p_distributor_id;

  if v_rute_distributor is null then
    raise exception using errcode = 'P0002', message = 'Rute tidak ditemukan pada ruang kerja ini.';
  end if;

  if not v_rute_active then
    raise exception using errcode = '22000', message = 'Rute sedang nonaktif.';
  end if;

  select roa.rute_id into v_previous_rute
    from public.rute_outlet_assignments as roa
   where roa.outlet_id = p_outlet_id
     and roa.distributor_id = p_distributor_id
     and roa.ended_at is null;

  if v_previous_rute = p_rute_id then
    raise exception using errcode = '22000', message = 'Outlet sudah ditugaskan pada rute ini.';
  end if;

  update public.rute_outlet_assignments as roa
     set ended_at = v_now
   where roa.outlet_id = p_outlet_id
     and roa.distributor_id = p_distributor_id
     and roa.ended_at is null;

  insert into public.rute_outlet_assignments (
    distributor_id, rute_id, outlet_id, assigned_by, assigned_at, ended_at, created_at
  ) values (
    p_distributor_id, p_rute_id, p_outlet_id, p_assigned_by, v_now, null, v_now
  )
  returning id into v_assignment_id;

  insert into public.assignment_history (
    distributor_id, entity_type, entity_id, from_rute_id, to_rute_id, action,
    changed_by, changed_at, metadata
  ) values (
    p_distributor_id, 'outlet', p_outlet_id, v_previous_rute, p_rute_id,
    case when v_previous_rute is null then 'assign' else 'reassign' end,
    p_assigned_by, v_now,
    jsonb_build_object('from_rute_id', v_previous_rute, 'to_rute_id', p_rute_id)
  );

  return query
  select v_assignment_id,
         case when v_previous_rute is null then 'assign'::text else 'reassign'::text end,
         v_previous_rute,
         v_now;
end;
$function$;

-- =============================================================================
-- 10. RPC: assign / reassign a SALES (sales_motoris) to a RUTE
-- =============================================================================
create or replace function public.assign_sales_to_rute(
  p_sales_user uuid,
  p_rute_id uuid,
  p_distributor_id uuid,
  p_assigned_by uuid
)
returns table (assignment_id uuid, action text, previous_rute_id uuid, assigned_at timestamptz)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_admin_metadata jsonb;
  v_sales_metadata jsonb;
  v_sales_active_name text;
  v_rute_distributor uuid;
  v_rute_active boolean;
  v_previous_rute uuid;
  v_assignment_id uuid;
  v_now timestamptz := now();
begin
  select raw_app_meta_data into v_admin_metadata
    from auth.users
   where id = p_assigned_by;

  if not found
     or coalesce(v_admin_metadata ->> 'role', '') <> 'admin'
     or coalesce(v_admin_metadata ->> 'distributor_id', '') <> p_distributor_id::text then
    raise exception using errcode = '42501', message = 'Admin tidak memiliki akses ke ruang kerja Distributor ini.';
  end if;

  select raw_app_meta_data into v_sales_metadata
    from auth.users
   where id = p_sales_user;

  if not found
     or coalesce(v_sales_metadata ->> 'role', '') <> 'sales_motoris'
     or coalesce(v_sales_metadata ->> 'distributor_id', '') <> p_distributor_id::text then
    raise exception using errcode = '42501', message = 'Sales tidak memiliki akses ke ruang kerja Distributor ini.';
  end if;

  select distributor_id, is_active into v_rute_distributor, v_rute_active
    from public.rute
   where id = p_rute_id and distributor_id = p_distributor_id;

  if v_rute_distributor is null then
    raise exception using errcode = 'P0002', message = 'Rute tidak ditemukan pada ruang kerja ini.';
  end if;

  if not v_rute_active then
    raise exception using errcode = '22000', message = 'Rute sedang nonaktif.';
  end if;

  select rsa.rute_id into v_previous_rute
    from public.rute_sales_assignments as rsa
   where rsa.sales_id = p_sales_user
     and rsa.distributor_id = p_distributor_id
     and rsa.ended_at is null;

  if v_previous_rute = p_rute_id then
    raise exception using errcode = '22000', message = 'Sales sudah ditugaskan pada rute ini.';
  end if;

  update public.rute_sales_assignments as rsa
     set ended_at = v_now
   where rsa.sales_id = p_sales_user
     and rsa.distributor_id = p_distributor_id
     and rsa.ended_at is null;

  insert into public.rute_sales_assignments (
    distributor_id, rute_id, sales_id, assigned_by, assigned_at, ended_at, created_at
  ) values (
    p_distributor_id, p_rute_id, p_sales_user, p_assigned_by, v_now, null, v_now
  )
  returning id into v_assignment_id;

  insert into public.assignment_history (
    distributor_id, entity_type, entity_id, from_rute_id, to_rute_id, action,
    changed_by, changed_at, metadata
  ) values (
    p_distributor_id, 'sales', p_sales_user, v_previous_rute, p_rute_id,
    case when v_previous_rute is null then 'assign' else 'reassign' end,
    p_assigned_by, v_now,
    jsonb_build_object('from_rute_id', v_previous_rute, 'to_rute_id', p_rute_id)
  );

  return query
  select v_assignment_id,
         case when v_previous_rute is null then 'assign'::text else 'reassign'::text end,
         v_previous_rute,
         v_now;
end;
$function$;

-- =============================================================================
-- 11. RPC EXECUTE SCOPE: service_role ONLY
-- =============================================================================
revoke all on function public.assign_outlet_to_rute(uuid, uuid, uuid, uuid) from public;
revoke all on function public.assign_outlet_to_rute(uuid, uuid, uuid, uuid) from anon;
revoke all on function public.assign_outlet_to_rute(uuid, uuid, uuid, uuid) from authenticated;
grant execute on function public.assign_outlet_to_rute(uuid, uuid, uuid, uuid) to service_role;

revoke all on function public.assign_sales_to_rute(uuid, uuid, uuid, uuid) from public;
revoke all on function public.assign_sales_to_rute(uuid, uuid, uuid, uuid) from anon;
revoke all on function public.assign_sales_to_rute(uuid, uuid, uuid, uuid) from authenticated;
grant execute on function public.assign_sales_to_rute(uuid, uuid, uuid, uuid) to service_role;