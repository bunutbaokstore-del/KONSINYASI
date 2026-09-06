-- PHASE 3B — Persistent Mitra Shipment and atomic planned -> shipped flow
-- Shipment only. No receiving persistence, distributor stock, or warehouse stock.

create table if not exists public.mitra_shipments (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references auth.users(id) on delete cascade,
  mitra_user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  consignment_item_id uuid not null references public.consignment_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  status text not null default 'planned' check (status in ('planned', 'shipped', 'received')),
  shipment_date date not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  shipped_at timestamptz,
  received_at timestamptz,
  received_by uuid references auth.users(id) on delete set null,
  received_notes text,
  constraint mitra_shipments_shipped_timestamp_check check (
    status = 'planned' or shipped_at is not null
  ),
  constraint mitra_shipments_received_timestamp_check check (
    status <> 'received' or received_at is not null
  )
);

create index if not exists mitra_shipments_mitra_status_date_idx
  on public.mitra_shipments (mitra_user_id, status, shipment_date desc);

create index if not exists mitra_shipments_distributor_status_date_idx
  on public.mitra_shipments (distributor_id, status, shipment_date desc);

create index if not exists mitra_shipments_product_date_idx
  on public.mitra_shipments (product_id, shipment_date desc);

create index if not exists mitra_shipments_consignment_item_date_idx
  on public.mitra_shipments (consignment_item_id, shipment_date desc);

create table if not exists public.mitra_shipment_stock_movements (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.mitra_shipments(id) on delete restrict,
  distributor_id uuid not null references auth.users(id) on delete cascade,
  mitra_user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type text not null check (movement_type = 'shipment_shipped'),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  constraint mitra_shipment_stock_movements_shipment_type_unique
    unique (shipment_id, movement_type)
);

create index if not exists mitra_shipment_stock_movements_shipment_idx
  on public.mitra_shipment_stock_movements (shipment_id, created_at desc);

create index if not exists mitra_shipment_stock_movements_mitra_idx
  on public.mitra_shipment_stock_movements (mitra_user_id, distributor_id, created_at desc);

create index if not exists mitra_shipment_stock_movements_distributor_idx
  on public.mitra_shipment_stock_movements (distributor_id, product_id, created_at desc);

alter table public.mitra_shipments enable row level security;
alter table public.mitra_shipment_stock_movements enable row level security;

create policy "Mitra can read own shipments"
  on public.mitra_shipments
  for select
  to authenticated
  using (
    auth.uid() = mitra_user_id
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'mitra_umkm'
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
  );

create policy "Distributor can read incoming shipments"
  on public.mitra_shipments
  for select
  to authenticated
  using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'distributor'
    and auth.uid() = distributor_id
  );

create policy "Admin can read workspace shipments"
  on public.mitra_shipments
  for select
  to authenticated
  using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
  );

create policy "Mitra can read own shipment stock movements"
  on public.mitra_shipment_stock_movements
  for select
  to authenticated
  using (
    auth.uid() = mitra_user_id
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'mitra_umkm'
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
  );

create policy "Distributor can read workspace shipment stock movements"
  on public.mitra_shipment_stock_movements
  for select
  to authenticated
  using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'distributor'
    and auth.uid() = distributor_id
  );

create policy "Admin can read workspace shipment stock movements"
  on public.mitra_shipment_stock_movements
  for select
  to authenticated
  using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
  );

-- No client INSERT/UPDATE/DELETE policies. Shipment writes are server/RPC-authoritative.

create or replace function public.prevent_invalid_mitra_shipment_status_transition()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.status = 'shipped' and new.status = 'planned' then
    raise exception using errcode = '55000', message = 'A shipped shipment cannot return to planned.';
  end if;
  if old.status = 'received' and new.status <> 'received' then
    raise exception using errcode = '55000', message = 'A received shipment is immutable.';
  end if;
  if old.status = 'planned' and new.status = 'received' then
    raise exception using errcode = '55000', message = 'A planned shipment cannot skip shipped.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_invalid_mitra_shipment_status_transition
  on public.mitra_shipments;
create trigger prevent_invalid_mitra_shipment_status_transition
before update on public.mitra_shipments
for each row execute function public.prevent_invalid_mitra_shipment_status_transition();

create or replace function public.ship_mitra_shipment(p_shipment_id uuid)
returns table (
  shipment_id uuid,
  shipment_status text,
  shipment_quantity integer,
  stock_quantity integer,
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
  v_stock public.mitra_production_stock%rowtype;
  v_movement public.mitra_shipment_stock_movements%rowtype;
  v_assignment_id uuid;
  v_mitra_user_id uuid := auth.uid();
  v_distributor_text text := auth.jwt() -> 'app_metadata' ->> 'distributor_id';
  v_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  v_updated_at timestamptz;
begin
  if v_mitra_user_id is null or v_role <> 'mitra_umkm' then
    raise exception using errcode = '42501', message = 'Shipment authorization failed.';
  end if;

  select * into v_shipment
    from public.mitra_shipments
   where id = p_shipment_id
     and mitra_user_id = v_mitra_user_id
     and distributor_id::text = v_distributor_text
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Shipment was not found.';
  end if;

  if v_shipment.status <> 'planned' then
    if v_shipment.status = 'shipped' then
      select * into v_movement
        from public.mitra_shipment_stock_movements
       where shipment_id = v_shipment.id
         and movement_type = 'shipment_shipped'
       for update;
      if found then
        select * into v_stock
          from public.mitra_production_stock
         where distributor_id = v_shipment.distributor_id
           and mitra_user_id = v_shipment.mitra_user_id
           and product_id = v_shipment.product_id;
        return query select v_shipment.id, v_shipment.status, v_shipment.quantity, coalesce(v_stock.available_quantity, 0), v_movement.id, true;
        return;
      end if;
    end if;
    raise exception using errcode = '55000', message = 'Shipment is not in planned status.';
  end if;

  select * into v_product
    from public.products
   where id = v_shipment.product_id
     and distributor_id = v_shipment.distributor_id
     and lifecycle_status = 'active';
  if not found then
    raise exception using errcode = '23514', message = 'Shipment product is not active in the distributor workspace.';
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

  select * into v_movement
    from public.mitra_shipment_stock_movements
   where shipment_id = v_shipment.id
     and movement_type = 'shipment_shipped'
   for update;
  if found then
    select * into v_stock
      from public.mitra_production_stock
     where distributor_id = v_shipment.distributor_id
       and mitra_user_id = v_shipment.mitra_user_id
       and product_id = v_shipment.product_id;
    return query select v_shipment.id, 'shipped'::text, v_shipment.quantity, coalesce(v_stock.available_quantity, 0), v_movement.id, true;
    return;
  end if;

  select * into v_stock
    from public.mitra_production_stock
   where distributor_id = v_shipment.distributor_id
     and mitra_user_id = v_shipment.mitra_user_id
     and product_id = v_shipment.product_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Production stock was not found.';
  end if;
  if v_stock.available_quantity < v_shipment.quantity then
    raise exception using errcode = '22003', message = 'Production stock is insufficient for this shipment.';
  end if;

  update public.mitra_production_stock
     set available_quantity = available_quantity - v_shipment.quantity,
         updated_at = timezone('utc', now())
   where id = v_stock.id
     and available_quantity >= v_shipment.quantity
  returning * into v_stock;
  if not found then
    raise exception using errcode = '22003', message = 'Production stock is insufficient for this shipment.';
  end if;

  insert into public.mitra_shipment_stock_movements (
    shipment_id, distributor_id, mitra_user_id, product_id, movement_type, quantity
  ) values (
    v_shipment.id, v_shipment.distributor_id, v_shipment.mitra_user_id, v_shipment.product_id, 'shipment_shipped', v_shipment.quantity
  ) returning * into v_movement;

  v_updated_at := timezone('utc', now());
  update public.mitra_shipments
     set status = 'shipped',
         shipped_at = v_updated_at,
         updated_at = v_updated_at
   where id = v_shipment.id
     and status = 'planned';

  return query select v_shipment.id, 'shipped'::text, v_shipment.quantity, v_stock.available_quantity, v_movement.id, false;
end;
$$;

revoke execute on function public.ship_mitra_shipment(uuid) from public;
grant execute on function public.ship_mitra_shipment(uuid) to authenticated;
