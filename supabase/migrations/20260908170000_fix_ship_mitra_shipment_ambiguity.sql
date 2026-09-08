-- PHASE 5 follow-up — fix SQLSTATE 42702 in public.ship_mitra_shipment(uuid)
-- Root cause: the RETURNS TABLE output column "shipment_id" collides with the
-- table column mitra_shipment_stock_movements.shipment_id, making the bare
-- reference in the WHERE clauses ambiguous. Qualify the table column with an
-- alias so the query resolves unambiguously. No change to signature, RETURNS
-- TABLE shape, SECURITY DEFINER, search_path, authorization guards, tenant
-- isolation, state machine, product/assignment/stock validation, stock movement
-- logic, idempotency, or RLS. Forward-only.

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
        from public.mitra_shipment_stock_movements ms
       where ms.shipment_id = v_shipment.id
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
    from public.mitra_shipment_stock_movements ms
   where ms.shipment_id = v_shipment.id
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
revoke execute on function public.ship_mitra_shipment(uuid) from anon;
grant execute on function public.ship_mitra_shipment(uuid) to authenticated;