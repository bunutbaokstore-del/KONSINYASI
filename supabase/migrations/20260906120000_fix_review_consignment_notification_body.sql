create or replace function public.review_consignment_request(
  p_request_id uuid,
  p_distributor_id uuid,
  p_reviewer_id uuid,
  p_decision text,
  p_review_note text default null
)
returns table (
  request_id uuid,
  request_status text,
  request_type text,
  item_id uuid,
  mitra_user_id uuid,
  distributor_id uuid,
  reviewer_id uuid,
  reviewed_at timestamptz,
  review_note text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_request public.consignment_requests%rowtype;
  v_reviewer_metadata jsonb;
  v_reviewer_distributor_id uuid;
  v_item_id uuid;
  v_product_id uuid;
  v_previous_stock numeric;
  v_resulting_stock numeric;
  v_reviewed_at timestamptz := now();
  v_review_note text := nullif(trim(p_review_note), '');
begin
  select raw_app_meta_data
    into v_reviewer_metadata
    from auth.users
   where id = p_reviewer_id;

  if not found
     or coalesce(v_reviewer_metadata ->> 'role', '') <> 'distributor' then
    raise exception using errcode = '42501',
      message = 'Reviewer is not authorized for this distributor workspace.';
  end if;

  v_reviewer_distributor_id :=
    nullif(v_reviewer_metadata ->> 'distributor_id', '')::uuid;

  if p_reviewer_id <> p_distributor_id then
    raise exception using errcode = '42501',
      message = 'Reviewer is not authorized for this distributor workspace.';
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

  v_item_id := v_request.item_id;
  v_product_id := v_request.product_id;

  if p_decision = 'approved'
     and v_request.request_type = 'new_item' then

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
      lifecycle_status
    )
    values (
      p_distributor_id,
      v_request.mitra_user_id,
      v_request.proposed_name,
      v_request.proposed_sku,
      v_request.proposed_unit,
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

  elsif p_decision = 'approved'
    and v_request.request_type = 'stock_change' then

    if v_request.item_id is null
      or v_request.proposed_stock_quantity is null then
      raise exception using errcode = '22023',
        message = 'Stock-change consignment request is incomplete.';
    end if;

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

  update public.consignment_requests as r
     set status = p_decision,
         reviewed_by = p_reviewer_id,
         review_note = v_review_note,
         reviewed_at = v_reviewed_at,
         updated_at = v_reviewed_at,
         item_id = v_item_id,
         product_id = v_product_id
   where r.id = v_request.id
     and r.distributor_id = p_distributor_id
     and r.status = 'pending';

  if not found then
    raise exception using errcode = 'P0001',
      message = 'Consignment request has already been processed.';
  end if;

  if p_decision = 'approved' then
    insert into public.stock_movements (
      distributor_id,
      consignment_item_id,
      request_id,
      movement_type,
      quantity,
      stock_before,
      stock_after,
      note,
      created_by
    )
    values (
      p_distributor_id,
      v_item_id,
      v_request.id,
      case
        when v_request.request_type = 'new_item'
          then 'initial_stock'
        else 'stock_change'
      end,
      case
        when v_request.request_type = 'new_item'
          then v_resulting_stock
        else v_resulting_stock - v_previous_stock
      end,
      case
        when v_request.request_type = 'new_item'
          then 0
        else v_previous_stock
      end,
      v_resulting_stock,
      v_review_note,
      p_reviewer_id
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
      when p_decision = 'approved'
        then 'request_approved'
      else 'request_rejected'
    end,
    case
      when p_decision = 'approved'
        then 'Pengajuan disetujui'
      else 'Pengajuan ditolak'
    end,
    case
      when p_decision = 'approved'
        then 'Pengajuan konsinyasi Anda telah disetujui.'
      else 'Pengajuan konsinyasi Anda telah ditolak.'
    end
  );

  return query
  select
    r.id,
    r.status,
    r.request_type,
    r.item_id,
    r.mitra_user_id,
    r.distributor_id,
    r.reviewed_by,
    r.reviewed_at,
    r.review_note
  from public.consignment_requests as r
  where r.id = v_request.id;

end;
$function$;

revoke all on function public.review_consignment_request(uuid, uuid, uuid, text, text) from public;
revoke all on function public.review_consignment_request(uuid, uuid, uuid, text, text) from anon;
revoke all on function public.review_consignment_request(uuid, uuid, uuid, text, text) from authenticated;
grant execute on function public.review_consignment_request(uuid, uuid, uuid, text, text) to service_role;
