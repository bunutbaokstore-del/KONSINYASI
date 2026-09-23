-- =============================================================================
-- FIX `npx supabase db lint` ERRORS (4 SQLSTATE issues)
-- Forward-only migration. Does NOT modify any earlier migration.
--
-- 1. public.receive_mitra_shipment(uuid)
--    Root cause: RETURNS TABLE output column "shipment_id" collides with the
--    table column mitra_shipment_receiving_movements.shipment_id (SQLSTATE 42702).
--    Fix: qualify the column with table alias m. Business logic unchanged.
--
-- 2. public.sj_check(uuid,uuid,jsonb)
--    CASE literals resolve to text but target columns are enums.
--    Fix: explicit casts to public.sj_status / public.sj_event_type.
--
-- 3. public.sj_confirm(uuid,uuid)
--    Same enum cast fix for surat_jalan_events.event_type.
--
-- 4. public.settle_receivable(uuid,decimal,uuid)
--    Same enum cast fix for visit_receivables.status.
--
-- Signatures, RETURNS/RETURNS TABLE, SECURITY DEFINER, search_path, authz,
-- tenant guards, locking, and all business logic preserved exactly. GRANT/REVOKE
-- reproduced to match current deployed permissions. No RLS/schema/enum changes.
-- =============================================================================

-- 1. FIX public.receive_mitra_shipment (ambiguous shipment_id reference)
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

revoke execute on function public.receive_mitra_shipment(uuid) from anon;
revoke execute on function public.receive_mitra_shipment(uuid) from public;
grant execute on function public.receive_mitra_shipment(uuid) to authenticated;

-- 2. FIX public.sj_check (enum casts on status + event_type)
create or replace function public.sj_check(
  p_sj_id uuid,
  p_actor_id uuid,
  p_items jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path to pg_catalog, public
as $fn$
declare
  v_sj public.surat_jalan%rowtype;
  v_now timestamptz := now();
  v_item jsonb;
  v_item_row public.surat_jalan_items%rowtype;
  v_has_discrepancy boolean := false;
begin
  select * into v_sj from public.surat_jalan where id = p_sj_id for update;
  if not found then raise exception 'Surat Jalan not found.'; end if;
  if v_sj.status not in ('READY') then raise exception 'SJ must be READY to check.'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select * into v_item_row from public.surat_jalan_items
    where id = (v_item ->> 'id')::uuid and surat_jalan_id = p_sj_id for update;

    if not found then continue; end if;

    if v_sj.direction = 'GUDANG_TO_SALES' then
      update public.surat_jalan_items set actual_qty = (v_item ->> 'actual_qty')::numeric where id = v_item_row.id;
      if (v_item ->> 'actual_qty')::numeric is distinct from v_item_row.expected_qty then
        v_has_discrepancy := true;
        update public.surat_jalan_items set is_discrepancy = true, discrepancy_reason = coalesce(v_item ->> 'discrepancy_reason', 'Qty mismatch') where id = v_item_row.id;
      end if;
    else
      update public.surat_jalan_items set physical_check_qty = (v_item ->> 'physical_check_qty')::numeric where id = v_item_row.id;
      if (v_item ->> 'physical_check_qty')::numeric is distinct from v_item_row.expected_qty then
        v_has_discrepancy := true;
        update public.surat_jalan_items set is_discrepancy = true, discrepancy_reason = coalesce(v_item ->> 'discrepancy_reason', 'Qty mismatch') where id = v_item_row.id;
      end if;
    end if;
  end loop;

  update public.surat_jalan
  set status = case when v_has_discrepancy then 'DISCREPANCY'::public.sj_status else 'CHECKED'::public.sj_status end,
      has_discrepancy = v_has_discrepancy,
      updated_at = v_now
  where id = p_sj_id;

  insert into public.surat_jalan_events (surat_jalan_id, event_type, actor_id, created_at)
  values (p_sj_id, case when v_has_discrepancy then 'SJ_DISCREPANCY'::public.sj_event_type else 'SJ_CHECKED'::public.sj_event_type end, p_actor_id, v_now);
end;
$fn$;

revoke all on function public.sj_check(uuid,uuid,jsonb) from authenticated;
revoke all on function public.sj_check(uuid,uuid,jsonb) from anon;
revoke all on function public.sj_check(uuid,uuid,jsonb) from public;
grant execute on function public.sj_check(uuid,uuid,jsonb) to service_role;

-- 3. FIX public.sj_confirm (enum cast on event_type)
create or replace function public.sj_confirm(p_sj_id uuid, p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path to pg_catalog, public
as $fn$
declare
  v_sj public.surat_jalan%rowtype;
  v_now timestamptz := now();
  v_target_status public.sj_status;
begin
  select * into v_sj from public.surat_jalan where id = p_sj_id for update;
  if not found then raise exception 'Surat Jalan not found.'; end if;
  if v_sj.status not in ('CHECKED', 'DISCREPANCY') then
    raise exception 'SJ must be CHECKED or DISCREPANCY to confirm.';
  end if;

  -- Auto-set final_qty for non-discrepancy items
  update public.surat_jalan_items
  set final_qty = coalesce(final_qty,
    case when v_sj.direction = 'GUDANG_TO_SALES' then actual_qty else physical_check_qty end),
      resolved_by = coalesce(resolved_by, p_actor_id),
      resolved_at = coalesce(resolved_at, v_now),
      updated_at = v_now
  where surat_jalan_id = p_sj_id and final_qty is null;

  if v_sj.direction = 'GUDANG_TO_SALES' then
    v_target_status := 'CONFIRMED';
  else
    v_target_status := 'RETURN_CONFIRMED';
  end if;

  update public.surat_jalan
  set status = v_target_status, confirmed_at = v_now, updated_at = v_now
  where id = p_sj_id;

  insert into public.surat_jalan_events (surat_jalan_id, event_type, actor_id, created_at)
  values (p_sj_id, case when v_sj.direction = 'GUDANG_TO_SALES' then 'SJ_CONFIRMED'::public.sj_event_type else 'SJ_RETURN_CONFIRMED'::public.sj_event_type end, p_actor_id, v_now);
end;
$fn$;

revoke all on function public.sj_confirm(uuid,uuid) from authenticated;
revoke all on function public.sj_confirm(uuid,uuid) from anon;
revoke all on function public.sj_confirm(uuid,uuid) from public;
grant execute on function public.sj_confirm(uuid,uuid) to service_role;

-- 4. FIX public.settle_receivable (enum cast on status)
create or replace function public.settle_receivable(
  p_receivable_id uuid,
  p_amount decimal,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to pg_catalog, public
as $fn$
declare
  v_rec public.visit_receivables%rowtype;
  v_now timestamptz := now();
  v_new_paid decimal;
begin
  if p_amount <= 0 then raise exception 'Payment amount must be positive.'; end if;

  select * into v_rec from public.visit_receivables where id = p_receivable_id for update;
  if not found then raise exception 'Receivable not found.'; end if;
  if v_rec.status = 'PAID' then raise exception 'Receivable already fully paid.'; end if;

  v_new_paid := v_rec.paid_amount + p_amount;
  if v_new_paid > v_rec.amount then
    raise exception 'Payment exceeds receivable amount.';
  end if;

  update public.visit_receivables
  set paid_amount = v_new_paid,
      status = case when v_new_paid >= amount then 'PAID'::public.receivable_status else 'PARTIAL'::public.receivable_status end,
      settled_at = case when v_new_paid >= amount then v_now else settled_at end,
      updated_at = v_now
  where id = p_receivable_id;

  insert into public.visit_events (visit_id, event_type, actor_id, metadata, created_at)
  values (v_rec.visit_id, 'RECEIVABLE_SETTLED', p_actor_id,
          jsonb_build_object('receivable_id', p_receivable_id, 'amount_paid', p_amount, 'total_paid', v_new_paid), v_now);

  return jsonb_build_object('receivable_id', p_receivable_id, 'paid_amount', v_new_paid, 'status', case when v_new_paid >= v_rec.amount then 'PAID' else 'PARTIAL' end);
end;
$fn$;

revoke all on function public.settle_receivable(uuid,decimal,uuid) from authenticated;
revoke all on function public.settle_receivable(uuid,decimal,uuid) from anon;
revoke all on function public.settle_receivable(uuid,decimal,uuid) from public;
grant execute on function public.settle_receivable(uuid,decimal,uuid) to service_role;