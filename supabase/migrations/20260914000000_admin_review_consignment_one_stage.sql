-- PHASE-1 (DB/RPC ONLY) — Admin final one-stage approval.
-- Workflow: Mitra submit (pending) -> Admin approve/reject -> final.
-- Distributor performs NO approval. The Distributor review RPC
-- (review_consignment_request) is intentionally KEPT but its UI usage
-- is removed in a later phase. Status 'awaiting_distributor_decision'
-- is also kept; rows already in that state are NOT backfilled here.
--
-- Forward-only + idempotent. Does NOT edit older migration files.
-- Replaces the logic of public.admin_review_consignment_request(...) so
-- that the Admin decision is FINAL:
--   - approve (or legacy alias 'forward'): pending -> approved; creates
--     product + consignment_item + initial_stock / supplier_stock_change
--     stock_movement, ports the exact stock logic from the Distributor
--     review RPC, and links product_id/item_id onto the request.
--   - reject: pending -> rejected; no product/item created; the rejection
--     reason is persisted into review_note.
-- Both admin_reviewed_by/at and reviewed_by/at are recorded.
-- Tenant/workspace isolation is preserved (distributor_id + admin role
-- metadata checks + FOR UPDATE on the workspace-scoped row).

drop function if exists public.admin_review_consignment_request(uuid, uuid, uuid, text, text);

create or replace function public.admin_review_consignment_request(
  p_request_id uuid,
  p_distributor_id uuid,
  p_admin_id uuid,
  p_action text,
  p_note text default null::text
)
returns table (
  request_id uuid,
  request_status text,
  request_type text,
  item_id uuid,
  product_id uuid,
  mitra_user_id uuid,
  distributor_id uuid,
  admin_reviewer_id uuid,
  admin_reviewed_at timestamptz,
  reviewer_id uuid,
  reviewed_at timestamptz,
  review_note text
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_request public.consignment_requests%rowtype;
  v_admin_metadata jsonb;
  v_review_note text := nullif(trim(p_note), '');
  v_reviewed_at timestamptz := now();
  v_effective_action text := p_action;
  v_item_id uuid;
  v_product_id uuid;
  v_previous_stock numeric;
  v_resulting_stock numeric;
begin
  -- Backward-compatible alias: the current server layer still sends
  -- 'forward' until phase 2; it now means the final Admin approval.
  if v_effective_action = 'forward' then
    v_effective_action := 'approve';
  end if;

  if v_effective_action not in ('approve', 'reject') then
    raise exception using errcode = '22023',
      message = 'Invalid admin review action.';
  end if;

  if v_review_note is not null and char_length(v_review_note) > 500 then
    raise exception using errcode = '22001',
      message = 'Admin review note exceeds 500 characters.';
  end if;

  select raw_app_meta_data
    into v_admin_metadata
    from auth.users
   where id = p_admin_id;

  if not found
     or coalesce(v_admin_metadata ->> 'role', '') <> 'admin'
     or coalesce(v_admin_metadata ->> 'distributor_id', '') <> p_distributor_id::text then
    raise exception using errcode = '42501',
      message = 'Admin is not authorized for this distributor workspace.';
  end if;

  select *
    into v_request
    from public.consignment_requests as r
   where r.id = p_request_id
     and r.distributor_id = p_distributor_id
   for update;

  if not found then
    raise exception using errcode = 'P0002',
      message = 'Consignment request was not found in this distributor workspace.';
  end if;

  if v_request.status <> 'pending' then
    raise exception using errcode = 'P0001',
      message = 'Consignment request has already been processed.';
  end if;

  -- Final approval executes the exact product/stock logic previously owned
  -- by review_consignment_request (ported verbatim; no new stock formula).
  if v_effective_action = 'approve' then
    if v_request.request_type = 'new_item' then

      if v_request.proposed_name is null
         or v_request.proposed_unit is null
         or v_request.proposed_stock_quantity is null
         or v_request.proposed_minimum_stock is null then
        raise exception using errcode = '22023',
          message = 'New-item consignment request is incomplete.';
      end if;

      insert into public.products (
        distributor_id,
        created_by_mitra_user_id,
        name,
        sku,
        unit,
        category,
        size,
        selling_price,
        lifecycle_status
      )
      values (
        p_distributor_id,
        v_request.mitra_user_id,
        v_request.proposed_name,
        v_request.proposed_sku,
        v_request.proposed_unit,
        v_request.proposed_category,
        v_request.proposed_size,
        v_request.proposed_selling_price,
        'active'
      )
      returning id into v_product_id;

      insert into public.consignment_items (
        distributor_id,
        mitra_user_id,
        product_id,
        name,
        sku,
        unit,
        stock_quantity,
        minimum_stock
      )
      values (
        p_distributor_id,
        v_request.mitra_user_id,
        v_product_id,
        v_request.proposed_name,
        v_request.proposed_sku,
        v_request.proposed_unit,
        v_request.proposed_stock_quantity,
        v_request.proposed_minimum_stock
      )
      returning id into v_item_id;

      v_resulting_stock := v_request.proposed_stock_quantity;

    elsif v_request.request_type = 'stock_change' then

      if v_request.item_id is null
         or v_request.proposed_stock_quantity is null then
        raise exception using errcode = '22023',
          message = 'Stock-change consignment request is incomplete.';
      end if;

      v_item_id := v_request.item_id;

      select ci.stock_quantity, ci.product_id
        into v_previous_stock, v_product_id
        from public.consignment_items as ci
       where ci.id = v_request.item_id
         and ci.distributor_id = p_distributor_id
         and ci.mitra_user_id = v_request.mitra_user_id
       for update;

      if not found then
        raise exception using errcode = 'P0002',
          message = 'Consignment item for stock change was not found.';
      end if;

      v_resulting_stock := v_request.proposed_stock_quantity;

      update public.consignment_items as ci
         set stock_quantity = v_resulting_stock,
             updated_at = v_reviewed_at
       where ci.id = v_request.item_id
         and ci.distributor_id = p_distributor_id
         and ci.mitra_user_id = v_request.mitra_user_id;
    end if;
  end if;

  -- On reject nothing above ran: product/item stay untouched and the
  -- rejection reason is persisted via review_note below.
  update public.consignment_requests as r
     set status = case when v_effective_action = 'approve' then 'approved' else 'rejected' end,
         admin_reviewed_by = p_admin_id,
         admin_reviewed_at = v_reviewed_at,
         reviewed_by = p_admin_id,
         review_note = v_review_note,
         reviewed_at = v_reviewed_at,
         updated_at = v_reviewed_at,
         item_id = coalesce(v_item_id, r.item_id),
         product_id = coalesce(v_product_id, r.product_id)
   where r.id = v_request.id
     and r.distributor_id = p_distributor_id
     and r.status = 'pending';

  if not found then
    raise exception using errcode = 'P0001',
      message = 'Consignment request has already been processed.';
  end if;

  if v_effective_action = 'approve' then
    insert into public.stock_movements (
      distributor_id,
      mitra_user_id,
      item_id,
      request_id,
      previous_stock,
      change_quantity,
      resulting_stock,
      movement_type,
      reason,
      approved_by
    )
    values (
      p_distributor_id,
      v_request.mitra_user_id,
      v_item_id,
      v_request.id,
      case
        when v_request.request_type = 'new_item' then 0
        else v_previous_stock
      end,
      case
        when v_request.request_type = 'new_item'
          then v_resulting_stock
        else v_resulting_stock - v_previous_stock
      end,
      v_resulting_stock,
      case
        when v_request.request_type = 'new_item'
          then 'initial_stock'
        else 'supplier_stock_change'
      end,
      coalesce(v_review_note, 'Disetujui oleh Administrator.'),
      p_admin_id
    );
  end if;

  insert into public.notifications (
    recipient_user_id,
    distributor_id,
    request_id,
    notification_type,
    title,
    body
  )
  values (
    v_request.mitra_user_id,
    p_distributor_id,
    v_request.id,
    case
      when v_effective_action = 'approve' then 'request_approved'
      else 'request_rejected'
    end,
    case
      when v_effective_action = 'approve' then 'Pengajuan disetujui'
      else 'Pengajuan ditolak'
    end,
    case
      when v_effective_action = 'approve'
        then 'Pengajuan konsinyasi Anda telah disetujui oleh Administrator.'
      else 'Pengajuan konsinyasi Anda telah ditolak oleh Administrator.'
    end
  );

  return query
  select
    r.id,
    r.status,
    r.request_type,
    r.item_id,
    r.product_id,
    r.mitra_user_id,
    r.distributor_id,
    r.admin_reviewed_by,
    r.admin_reviewed_at,
    r.reviewed_by,
    r.reviewed_at,
    r.review_note
  from public.consignment_requests as r
  where r.id = v_request.id;
end;
$function$;

revoke all on function public.admin_review_consignment_request(uuid, uuid, uuid, text, text) from public;
revoke all on function public.admin_review_consignment_request(uuid, uuid, uuid, text, text) from anon;
revoke all on function public.admin_review_consignment_request(uuid, uuid, uuid, text, text) from authenticated;
grant execute on function public.admin_review_consignment_request(uuid, uuid, uuid, text, text) to service_role;