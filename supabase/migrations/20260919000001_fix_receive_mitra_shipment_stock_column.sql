-- =============================================================================
-- FIX public.receive_mitra_shipment — distributor_stock.quantity (post-V14)
--
-- V14 (20260917000000_create_consignment_domain_v14.sql) renamed
--   distributor_stock.available_quantity → distributor_stock.quantity
--   and widened its type to numeric(18,3).
--
-- receive_mitra_shipment still used the old column name at 4 places, which
-- made v_stock (public.distributor_stock%rowtype) fail with SQLSTATE 42703
-- ("record v_stock has no field available_quantity").
--
-- THIS MIGRATION (approved minimal patch):
--   1. Idempotency RETURN QUERY : coalesce(v_stock.quantity, 0)::integer
--   2. INSERT distributor_stock  : column quantity
--   3. UPDATE distributor_stock  : set quantity = quantity + v_shipment.quantity
--   4. Main RETURN QUERY         : v_stock.quantity::integer
--
-- Signature, RETURNS TABLE, SECURITY DEFINER, search_path, authz, tenant
-- isolation, FOR UPDATE locking, idempotency, state machine, stock math, and
-- movement recording preserved exactly. GRANT/REVOKE match current deployed
-- function. No schema/enum/RLS/frontend/backend/test changes. Forward-only.
-- =============================================================================

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
      from public.mitra_shipment_receiving_movements m
     where m.shipment_id = v_shipment.id
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
             coalesce(v_stock.quantity, 0)::integer, v_movement.id, true;
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

  insert into public.distributor_stock (distributor_id, product_id, quantity)
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
     set quantity = quantity + v_shipment.quantity,
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
           v_stock.quantity::integer, v_movement.id, false;
end;
$$;

revoke execute on function public.receive_mitra_shipment(uuid) from anon;
revoke execute on function public.receive_mitra_shipment(uuid) from public;
grant execute on function public.receive_mitra_shipment(uuid) to authenticated;