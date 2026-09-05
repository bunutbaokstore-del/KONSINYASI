-- PHASE 3D — Distributor Stock + atomic Shipment Receiving
-- Additive only. No backfill, seed, partial receiving, warehouse stock, or legacy stock movement changes.

create table if not exists public.distributor_stock (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  available_quantity integer not null default 0 check (available_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint distributor_stock_distributor_product_unique unique (distributor_id, product_id)
);

create index if not exists distributor_stock_distributor_idx
  on public.distributor_stock (distributor_id, updated_at desc);
create index if not exists distributor_stock_product_idx
  on public.distributor_stock (product_id, updated_at desc);

alter table public.distributor_stock enable row level security;

create policy "Distributor can read own stock"
  on public.distributor_stock
  for select to authenticated
  using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'distributor'
    and auth.uid() = distributor_id
  );

create policy "Admin can read workspace stock"
  on public.distributor_stock
  for select to authenticated
  using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    and public.current_tenant_id() = distributor_id
  );

create table if not exists public.mitra_shipment_receiving_movements (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.mitra_shipments(id) on delete restrict,
  distributor_id uuid not null references auth.users(id) on delete cascade,
  mitra_user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type text not null check (movement_type = 'shipment_received'),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  constraint receiving_movement_shipment_type_unique unique (shipment_id, movement_type)
);

create index if not exists mitra_shipment_receiving_movements_distributor_idx
  on public.mitra_shipment_receiving_movements (distributor_id, product_id, created_at desc);
create index if not exists mitra_shipment_receiving_movements_shipment_idx
  on public.mitra_shipment_receiving_movements (shipment_id, created_at desc);

alter table public.mitra_shipment_receiving_movements enable row level security;

create policy "Distributor can read own receiving movements"
  on public.mitra_shipment_receiving_movements
  for select to authenticated
  using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'distributor'
    and auth.uid() = distributor_id
  );

create policy "Admin can read workspace receiving movements"
  on public.mitra_shipment_receiving_movements
  for select to authenticated
  using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    and public.current_tenant_id() = distributor_id
  );

create or replace function public.receive_mitra_shipment(p_shipment_id uuid)
returns table (
  shipment_id uuid,
  shipment_status text,
  shipment_quantity integer,
  distributor_stock_quantity integer,
  movement_id uuid,
  idempotent boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_shipment public.mitra_shipments%rowtype;
  v_product public.products%rowtype;
  v_stock public.distributor_stock%rowtype;
  v_movement public.mitra_shipment_receiving_movements%rowtype;
  v_assignment_id uuid;
  v_distributor_id uuid := auth.uid();
  v_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  v_updated_at timestamptz;
begin
  if v_distributor_id is null or v_role <> 'distributor' then
    raise exception using errcode = '42501', message = 'Only an authenticated Distributor may receive shipments.';
  end if;

  select * into v_shipment
    from public.mitra_shipments
   where id = p_shipment_id
     and distributor_id = v_distributor_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Shipment was not found in the Distributor workspace.';
  end if;

  if v_shipment.status = 'received' then
    select * into v_movement
      from public.mitra_shipment_receiving_movements
     where shipment_id = v_shipment.id
       and movement_type = 'shipment_received'
     for update;
    if not found then
      raise exception using errcode = '55000', message = 'Received shipment has no receiving movement.';
    end if;
    select * into v_stock
      from public.distributor_stock
     where distributor_id = v_shipment.distributor_id
       and product_id = v_shipment.product_id;
    return query
      select v_shipment.id, v_shipment.status, v_shipment.quantity,
             coalesce(v_stock.available_quantity, 0), v_movement.id, true;
    return;
  end if;

  if v_shipment.status <> 'shipped' then
    raise exception using errcode = '55000', message = 'Only shipped shipments can be received.';
  end if;

  if v_shipment.quantity <= 0 then
    raise exception using errcode = '23514', message = 'Shipment quantity must be greater than zero.';
  end if;

  select * into v_product
    from public.products
   where id = v_shipment.product_id
     and distributor_id = v_shipment.distributor_id
     and lifecycle_status = 'active';
  if not found then
    raise exception using errcode = '23514', message = 'Shipment product is not active in the Distributor workspace.';
  end if;

  select id into v_assignment_id
    from public.consignment_items
   where id = v_shipment.consignment_item_id
     and product_id = v_shipment.product_id
     and mitra_user_id = v_shipment.mitra_user_id
     and distributor_id = v_shipment.distributor_id;
  if v_assignment_id is null then
    raise exception using errcode = '23514', message = 'Shipment consignment assignment is invalid.';
  end if;

  insert into public.distributor_stock (distributor_id, product_id, available_quantity)
  values (v_shipment.distributor_id, v_shipment.product_id, 0)
  on conflict (distributor_id, product_id) do nothing;

  select * into v_stock
    from public.distributor_stock
   where distributor_id = v_shipment.distributor_id
     and product_id = v_shipment.product_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Distributor stock row was not found.';
  end if;

  update public.distributor_stock
     set available_quantity = available_quantity + v_shipment.quantity,
         updated_at = timezone('utc', now())
   where id = v_stock.id
  returning * into v_stock;

  insert into public.mitra_shipment_receiving_movements (
    shipment_id, distributor_id, mitra_user_id, product_id, movement_type, quantity
  ) values (
    v_shipment.id, v_shipment.distributor_id, v_shipment.mitra_user_id,
    v_shipment.product_id, 'shipment_received', v_shipment.quantity
  ) returning * into v_movement;

  v_updated_at := timezone('utc', now());
  update public.mitra_shipments
     set status = 'received',
         received_at = v_updated_at,
         received_by = v_distributor_id,
         updated_at = v_updated_at
   where id = v_shipment.id
     and status = 'shipped';

  return query
    select v_shipment.id, 'received'::text, v_shipment.quantity,
           v_stock.available_quantity, v_movement.id, false;
end;
$$;

revoke execute on function public.receive_mitra_shipment(uuid) from public;
grant execute on function public.receive_mitra_shipment(uuid) to authenticated;
