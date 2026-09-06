CREATE OR REPLACE FUNCTION public.review_consignment_request(
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

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION USING errcode = 'P0001',
      message = 'Consignment request has already been processed.';
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
      lifecycle_status
    )
    VALUES (
      p_distributor_id,
      v_request.mitra_user_id,
      v_request.proposed_name,
      v_request.proposed_sku,
      v_request.proposed_unit,
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
     AND r.status = 'pending';

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
        ELSE 'stock_change'
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
        THEN 'Pengajuan konsinyasi Anda telah disetujui.'
      ELSE 'Pengajuan konsinyasi Anda telah ditolak.'
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