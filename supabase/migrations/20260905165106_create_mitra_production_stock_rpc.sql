-- PHASE 2B — Atomic Production Event to Production Stock processing
-- Production-only ledger and RPC. No shipment, receiving, or distributor stock.

create table if not exists public.mitra_production_stock_movements (
  id uuid primary key default gen_random_uuid(),
  production_event_id uuid not null references public.mitra_production_events(id) on delete restrict,
  distributor_id uuid not null references auth.users(id) on delete cascade,
  mitra_user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type text not null check (movement_type = 'production_completed'),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  constraint mitra_production_stock_movements_event_type_unique
    unique (production_event_id, movement_type)
);

create index if not exists mitra_production_stock_movements_event_idx
  on public.mitra_production_stock_movements (production_event_id, created_at desc);

create index if not exists mitra_production_stock_movements_mitra_idx
  on public.mitra_production_stock_movements (mitra_user_id, distributor_id, created_at desc);

create index if not exists mitra_production_stock_movements_distributor_idx
  on public.mitra_production_stock_movements (distributor_id, product_id, created_at desc);

alter table public.mitra_production_stock_movements enable row level security;

create policy "Mitra can read own production stock movements"
  on public.mitra_production_stock_movements
  for select
  to authenticated
  using (
    auth.uid() = mitra_user_id
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'mitra_umkm'
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
  );

create policy "Distributor can read workspace production stock movements"
  on public.mitra_production_stock_movements
  for select
  to authenticated
  using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'distributor'
    and auth.uid() = distributor_id
  );

create policy "Admin can read workspace production stock movements"
  on public.mitra_production_stock_movements
  for select
  to authenticated
  using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
  );

create or replace function public.complete_mitra_production_event(
  p_production_event_id uuid,
  p_actual_quantity integer default null,
  p_damaged_quantity integer default 0,
  p_yield_percentage numeric default null,
  p_result_notes text default ''
)
returns table (
  event_id uuid,
  event_status text,
  actual_quantity integer,
  stock_quantity integer,
  movement_id uuid,
  idempotent boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event public.mitra_production_events%rowtype;
  v_product public.products%rowtype;
  v_assignment_id uuid;
  v_stock public.mitra_production_stock%rowtype;
  v_movement public.mitra_production_stock_movements%rowtype;
  v_idempotent boolean := false;
  v_mitra_user_id uuid := auth.uid();
  v_distributor_text text := auth.jwt() -> 'app_metadata' ->> 'distributor_id';
  v_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  v_completed_at timestamptz;
begin
  if v_mitra_user_id is null or v_role <> 'mitra_umkm' then
    raise exception using errcode = '42501', message = 'Production event authorization failed.';
  end if;

  select * into v_event
    from public.mitra_production_events
   where id = p_production_event_id
     and mitra_user_id = v_mitra_user_id
     and distributor_id::text = v_distributor_text
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Production event was not found.';
  end if;

  if v_event.status = 'planned' then
    if p_actual_quantity is null or p_actual_quantity <= 0 then
      raise exception using errcode = '22023', message = 'Actual production quantity must be greater than zero.';
    end if;
    if p_damaged_quantity is null or p_damaged_quantity < 0 then
      raise exception using errcode = '22023', message = 'Damaged quantity must not be negative.';
    end if;
    if p_yield_percentage is not null and p_yield_percentage < 0 then
      raise exception using errcode = '22023', message = 'Yield percentage must not be negative.';
    end if;

    select * into v_product
      from public.products
     where id = v_event.product_id
       and distributor_id = v_event.distributor_id
       and lifecycle_status = 'active';
    if not found then
      raise exception using errcode = '23514', message = 'Production product is not active in the distributor workspace.';
    end if;

    select id into v_assignment_id
      from public.consignment_items
     where product_id = v_event.product_id
       and mitra_user_id = v_event.mitra_user_id
       and distributor_id = v_event.distributor_id
     limit 1;
    if v_assignment_id is null then
      raise exception using errcode = '23514', message = 'Production product is not assigned to the Mitra.';
    end if;

    v_completed_at := timezone('utc', now());
    update public.mitra_production_events
       set actual_quantity = p_actual_quantity,
           damaged_quantity = p_damaged_quantity,
           yield_percentage = p_yield_percentage,
           result_notes = coalesce(p_result_notes, ''),
           status = 'completed',
           completed_at = v_completed_at
     where id = v_event.id;
    v_event.actual_quantity := p_actual_quantity;
    v_event.damaged_quantity := p_damaged_quantity;
    v_event.yield_percentage := p_yield_percentage;
    v_event.result_notes := coalesce(p_result_notes, '');
    v_event.status := 'completed';
    v_event.completed_at := v_completed_at;
  elsif v_event.status = 'completed' then
    v_idempotent := true;
    if v_event.actual_quantity is null or v_event.actual_quantity <= 0 then
      raise exception using errcode = '23514', message = 'Completed production event has invalid quantity.';
    end if;
  else
    raise exception using errcode = '23514', message = 'Production event has an invalid status.';
  end if;

  select * into v_product
    from public.products
   where id = v_event.product_id
     and distributor_id = v_event.distributor_id
     and lifecycle_status = 'active';
  if not found then
    raise exception using errcode = '23514', message = 'Production product is not active in the distributor workspace.';
  end if;

  select id into v_assignment_id
    from public.consignment_items
   where product_id = v_event.product_id
     and mitra_user_id = v_event.mitra_user_id
     and distributor_id = v_event.distributor_id
   limit 1;
  if v_assignment_id is null then
    raise exception using errcode = '23514', message = 'Production product is not assigned to the Mitra.';
  end if;

  select * into v_movement
    from public.mitra_production_stock_movements
   where production_event_id = v_event.id
     and movement_type = 'production_completed'
   for update;
  if found then
    select * into v_stock
      from public.mitra_production_stock
     where distributor_id = v_event.distributor_id
       and mitra_user_id = v_event.mitra_user_id
       and product_id = v_event.product_id;
    return query select v_event.id, v_event.status, v_event.actual_quantity, coalesce(v_stock.available_quantity, 0), v_movement.id, true;
    return;
  end if;

  insert into public.mitra_production_stock (distributor_id, mitra_user_id, product_id, available_quantity)
  values (v_event.distributor_id, v_event.mitra_user_id, v_event.product_id, 0)
  on conflict (distributor_id, mitra_user_id, product_id) do nothing;

  select * into v_stock
    from public.mitra_production_stock
   where distributor_id = v_event.distributor_id
     and mitra_user_id = v_event.mitra_user_id
     and product_id = v_event.product_id
   for update;

  update public.mitra_production_stock
     set available_quantity = v_stock.available_quantity + v_event.actual_quantity,
         updated_at = timezone('utc', now())
   where id = v_stock.id
  returning * into v_stock;

  insert into public.mitra_production_stock_movements (
    production_event_id, distributor_id, mitra_user_id, product_id, movement_type, quantity
  ) values (
    v_event.id, v_event.distributor_id, v_event.mitra_user_id, v_event.product_id, 'production_completed', v_event.actual_quantity
  ) returning * into v_movement;

  return query select v_event.id, v_event.status, v_event.actual_quantity, v_stock.available_quantity, v_movement.id, v_idempotent;
end;
$$;

revoke execute on function public.complete_mitra_production_event(uuid, integer, integer, numeric, text) from public;
grant execute on function public.complete_mitra_production_event(uuid, integer, integer, numeric, text) to authenticated;
