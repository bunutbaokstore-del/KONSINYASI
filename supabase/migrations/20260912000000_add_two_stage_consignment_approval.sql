-- PHASE ADMIN-OPERASIONAL — Two-stage consignment approval foundation.
-- Workflow: Mitra submit (pending) -> Admin review (admin_reviewed_by/at)
--           -> awaiting_distributor_decision -> Distributor final decision
--           -> approved (product lifecycle_status = 'active') or rejected.
--
-- Forward-only foundation. Does NOT edit older migration files.
-- All changes are idempotent so they can be applied to an existing local DB.

-- 1) consignment_requests.status CHECK: support awaiting_distributor_decision.
alter table public.consignment_requests
  drop constraint if exists consignment_requests_status_check;

alter table public.consignment_requests
  add constraint consignment_requests_status_check
    check (status in ('pending', 'awaiting_distributor_decision', 'approved', 'rejected'));

-- 2) Admin review tracking (reviewed_by/reviewed_at stay reserved for the
--    Distributor's final decision).
alter table public.consignment_requests
  add column if not exists admin_reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists admin_reviewed_at timestamptz;

-- 3) Extended product proposal fields when a Mitra submits a new item.
alter table public.consignment_requests
  add column if not exists proposed_category text
    check (proposed_category is null or char_length(btrim(proposed_category)) between 1 and 80),
  add column if not exists proposed_size text
    check (proposed_size is null or char_length(btrim(proposed_size)) between 1 and 40),
  add column if not exists proposed_selling_price numeric(14,2)
    check (proposed_selling_price is null or proposed_selling_price >= 0);

-- 4) notifications.notification_type CHECK: support the admin-forward stage.
alter table public.notifications
  drop constraint if exists notifications_notification_type_check;

alter table public.notifications
  add constraint notifications_notification_type_check
    check (notification_type = any (array[
      'request_pending'::text,
      'awaiting_distributor_decision'::text,
      'request_approved'::text,
      'request_rejected'::text,
      'stock_updated'::text
    ]));

-- 5) Notification policy: Admin may notify the workspace Distributor when a
--    reviewed request moves to awaiting_distributor_decision (or reporting a
--    brand-new pending request). Requests are validated against the same
--    tenant scope and the matching status.
drop policy if exists "Admin can notify workspace distributor"
  on public.notifications;

create policy "Admin can notify workspace distributor"
  on public.notifications for insert to authenticated
  with check (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
    and recipient_user_id = distributor_id
    and request_id is not null
    and notification_type in ('request_pending', 'awaiting_distributor_decision')
    and exists (
      select 1
        from public.consignment_requests request
       where request.id = notifications.request_id
         and request.distributor_id = notifications.distributor_id
         and (
           (
             notifications.notification_type = 'awaiting_distributor_decision'
             and request.status = 'awaiting_distributor_decision'
           )
           or
           (
             notifications.notification_type = 'request_pending'
             and request.status = 'pending'
           )
         )
    )
  );

-- 6) Admin review RPC: forward (pending -> awaiting_distributor_decision) or
--    reject (pending -> rejected). Records admin_reviewed_by/at. Never creates
--    or activates a product; the Distributor holds the final decision.
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
  mitra_user_id uuid,
  distributor_id uuid,
  admin_reviewer_id uuid,
  admin_reviewed_at timestamptz,
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
begin
  if v_review_note is not null and char_length(v_review_note) > 500 then
    raise exception using errcode = '22001',
      message = 'Admin review note exceeds 500 characters.';
  end if;

  if p_action not in ('forward', 'reject') then
    raise exception using errcode = '22023',
      message = 'Invalid admin review action.';
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

  if p_action = 'forward' then
    update public.consignment_requests as r
       set status = 'awaiting_distributor_decision',
           admin_reviewed_by = p_admin_id,
           admin_reviewed_at = v_reviewed_at,
           review_note = v_review_note,
           updated_at = v_reviewed_at
     where r.id = v_request.id
       and r.distributor_id = p_distributor_id
       and r.status = 'pending';
  elsif p_action = 'reject' then
    update public.consignment_requests as r
       set status = 'rejected',
           admin_reviewed_by = p_admin_id,
           admin_reviewed_at = v_reviewed_at,
           review_note = v_review_note,
           updated_at = v_reviewed_at
     where r.id = v_request.id
       and r.distributor_id = p_distributor_id
       and r.status = 'pending';
  end if;

  if not found then
    raise exception using errcode = 'P0001',
      message = 'Consignment request has already been processed.';
  end if;

  return query
  select
    r.id,
    r.status,
    r.request_type,
    r.item_id,
    r.mitra_user_id,
    r.distributor_id,
    r.admin_reviewed_by,
    r.admin_reviewed_at,
    r.review_note
  from public.consignment_requests as r
  where r.id = v_request.id;
end;
$function$;

revoke all on function public.admin_review_consignment_request(uuid, uuid, uuid, text, text) from public;
revoke all on function public.admin_review_consignment_request(uuid, uuid, uuid, text, text) from anon;
revoke all on function public.admin_review_consignment_request(uuid, uuid, uuid, text, text) from authenticated;
grant execute on function public.admin_review_consignment_request(uuid, uuid, uuid, text, text) to service_role;

-- 7) Update the Distributor review RPC: it now only accepts requests that were
--    previously reviewed and forwarded by an Admin
--    (status = 'awaiting_distributor_decision' and admin_reviewed_by IS NOT NULL).
--    Approving a new_item still creates the product with
--    lifecycle_status = 'active'. Admin cannot run this RPC (role guard +
--    execute grants restricted to service_role).
create or replace function public.review_consignment_request(
  p_request_id uuid,
  p_distributor_id uuid,
  p_reviewer_id uuid,
  p_decision text,
  p_review_note text DEFAULT NULL::text
)
RETURNS TABLE(
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_request public.consignment_requests%rowtype;
  v_reviewer_metadata jsonb;
  v_item_id uuid;
  v_product_id uuid;
  v_previous_stock numeric;
  v_resulting_stock numeric;
  v_reviewed_at timestamptz := now();
  v_review_note text := nullif(trim(p_review_note), '');
BEGIN
  SELECT raw_app_meta_data
    INTO v_reviewer_metadata
    FROM auth.users
   WHERE id = p_reviewer_id;

  IF NOT FOUND
     OR coalesce(v_reviewer_metadata ->> 'role', '') <> 'distributor' THEN
    RAISE EXCEPTION USING errcode = '42501',
      message = 'Reviewer is not authorized for this distributor workspace.';
  END IF;

  IF p_reviewer_id <> p_distributor_id THEN
    RAISE EXCEPTION USING errcode = '42501',
      message = 'Reviewer is not authorized for this distributor workspace.';
  END IF;

  SELECT *
    INTO v_request
    FROM public.consignment_requests AS r
   WHERE r.id = p_request_id
     AND r.distributor_id = p_distributor_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0002',
      message = 'Consignment request was not found in this distributor workspace.';
  END IF;

  IF v_request.status <> 'awaiting_distributor_decision' THEN
    RAISE EXCEPTION USING errcode = 'P0001',
      message = 'Consignment request has already been processed.';
  END IF;

  IF v_request.admin_reviewed_by IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001',
      message = 'Consignment request must be reviewed by an admin before distributor decision.';
  END IF;

  v_item_id := v_request.item_id;
  v_product_id := v_request.product_id;

  IF p_decision = 'approved'
     AND v_request.request_type = 'new_item' THEN

    IF v_request.proposed_name IS NULL
      OR v_request.proposed_unit IS NULL
      OR v_request.proposed_stock_quantity IS NULL
      OR v_request.proposed_minimum_stock IS NULL THEN
      RAISE EXCEPTION USING errcode = '22023',
        message = 'New-item consignment request is incomplete.';
    END IF;

    INSERT INTO public.products (
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
    VALUES (
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
    RETURNING id INTO v_product_id;

    INSERT INTO public.consignment_items (
      distributor_id,
      mitra_user_id,
      product_id,
      name,
      sku,
      unit,
      stock_quantity,
      minimum_stock
    )
    VALUES (
      p_distributor_id,
      v_request.mitra_user_id,
      v_product_id,
      v_request.proposed_name,
      v_request.proposed_sku,
      v_request.proposed_unit,
      v_request.proposed_stock_quantity,
      v_request.proposed_minimum_stock
    )
    RETURNING id INTO v_item_id;

    v_resulting_stock := v_request.proposed_stock_quantity;

  ELSIF p_decision = 'approved'
    AND v_request.request_type = 'stock_change' THEN

    IF v_request.item_id IS NULL
      OR v_request.proposed_stock_quantity IS NULL THEN
      RAISE EXCEPTION USING errcode = '22023',
        message = 'Stock-change consignment request is incomplete.';
    END IF;

    SELECT ci.stock_quantity, ci.product_id
      INTO v_previous_stock, v_product_id
      FROM public.consignment_items AS ci
     WHERE ci.id = v_request.item_id
       AND ci.distributor_id = p_distributor_id
       AND ci.mitra_user_id = v_request.mitra_user_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING errcode = 'P0002',
        message = 'Consignment item for stock change was not found.';
    END IF;

    v_resulting_stock := v_request.proposed_stock_quantity;

    UPDATE public.consignment_items AS ci
       SET stock_quantity = v_resulting_stock,
           updated_at = v_reviewed_at
     WHERE ci.id = v_request.item_id
       AND ci.distributor_id = p_distributor_id
       AND ci.mitra_user_id = v_request.mitra_user_id;
  END IF;

  UPDATE public.consignment_requests AS r
     SET status = p_decision,
         reviewed_by = p_reviewer_id,
         review_note = v_review_note,
         reviewed_at = v_reviewed_at,
         updated_at = v_reviewed_at,
         item_id = v_item_id,
         product_id = v_product_id
   WHERE r.id = v_request.id
     AND r.distributor_id = p_distributor_id
     AND r.status = 'awaiting_distributor_decision';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0001',
      message = 'Consignment request has already been processed.';
  END IF;

  IF p_decision = 'approved' THEN
    INSERT INTO public.stock_movements (
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
    VALUES (
      p_distributor_id,
      v_request.mitra_user_id,
      v_item_id,
      v_request.id,
      CASE
        WHEN v_request.request_type = 'new_item' THEN 0
        ELSE v_previous_stock
      END,
      CASE
        WHEN v_request.request_type = 'new_item'
          THEN v_resulting_stock
        ELSE v_resulting_stock - v_previous_stock
      END,
      v_resulting_stock,
      CASE
        WHEN v_request.request_type = 'new_item'
          THEN 'initial_stock'
        ELSE 'supplier_stock_change'
      END,
      v_review_note,
      p_reviewer_id
    );
  END IF;

  INSERT INTO public.notifications (
    recipient_user_id,
    distributor_id,
    request_id,
    notification_type,
    title,
    body
  )
  VALUES (
    v_request.mitra_user_id,
    p_distributor_id,
    v_request.id,
    CASE
      WHEN p_decision = 'approved'
        THEN 'request_approved'
      ELSE 'request_rejected'
    END,
    CASE
      WHEN p_decision = 'approved'
        THEN 'Pengajuan disetujui'
      ELSE 'Pengajuan ditolak'
    END,
    CASE
      WHEN p_decision = 'approved'
        THEN 'Pengajuan konsinyasi Anda telah disetujui oleh Distributor.'
      ELSE 'Pengajuan konsinyasi Anda telah ditolak oleh Distributor.'
    END
  );

  RETURN QUERY
  SELECT
    r.id,
    r.status,
    r.request_type,
    r.item_id,
    r.mitra_user_id,
    r.distributor_id,
    r.reviewed_by,
    r.reviewed_at,
    r.review_note
  FROM public.consignment_requests AS r
  WHERE r.id = v_request.id;
END;
$function$;

revoke all on function public.review_consignment_request(uuid, uuid, uuid, text, text) from public;
revoke all on function public.review_consignment_request(uuid, uuid, uuid, text, text) from anon;
revoke all on function public.review_consignment_request(uuid, uuid, uuid, text, text) from authenticated;
grant execute on function public.review_consignment_request(uuid, uuid, uuid, text, text) to service_role;