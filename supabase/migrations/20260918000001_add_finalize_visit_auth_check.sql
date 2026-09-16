-- =============================================================================
-- FINALIZE_VISIT AUTHORIZATION PATCH
-- Adds explicit actor validation to public.finalize_visit
-- SECURITY DEFINER function must validate p_actor_id before any mutations
-- =============================================================================

create or replace function public.finalize_visit(
  p_visit_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to pg_catalog, public
as $fn$
declare
  v_visit public.visits%rowtype;
  v_now timestamptz := now();
  v_card record;
  v_ss record;
  v_oc record;
  v_oc_milik record;
  v_total_amount decimal := 0;
  v_total_paid decimal := 0;
  v_has_sale boolean := false;
  v_transaction_id uuid;
  v_trx_number varchar;
  v_stock_after numeric;
  v_prev_ss numeric;
  v_prev_oc numeric;
  v_added boolean;
  v_movement_note text;

  -- Authorization variables
  v_actor_metadata jsonb;
  v_actor_role text;
  v_actor_tenant_id uuid;
begin
  -- Lock visit
  select * into v_visit from public.visits where id = p_visit_id for update;
  if not found then raise exception 'Visit not found.'; end if;
  if v_visit.status <> 'CHECKED_IN' then raise exception 'Visit must be CHECKED_IN to finalize.'; end if;
  if v_visit.transaction_status is null then raise exception 'transaction_status must be set before finalization.'; end if;

  -- === AUTHORIZATION BLOCK ===
  -- 1. Verify p_actor_id exists in auth.users
  select raw_app_meta_data into v_actor_metadata from auth.users where id = p_actor_id;
  if not found then raise exception 'Actor not found.'; end if;

  -- 2. Get role from app_metadata
  v_actor_role := coalesce(v_actor_metadata ->> 'role', '');

  -- 3. Determine actor tenant per repository rules
  if v_actor_role = 'sys_admin' then
    -- Platform sys_admin: must have active platform_admins membership
    if not exists (
      select 1 from public.platform_admins
      where user_id = p_actor_id and status = 'active'
    ) then
      raise exception 'Platform sys_admin not active.';
    end if;
    v_actor_tenant_id := null;
  elsif v_actor_role = 'distributor' then
    -- Distributor role: user.id IS the distributor_id
    v_actor_tenant_id := p_actor_id;
  else
    -- admin, sales_motoris, mitra_umkm, supervisor, hrd: tenant from app_metadata
    v_actor_tenant_id := case
      when (v_actor_metadata ->> 'distributor_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (v_actor_metadata ->> 'distributor_id')::uuid
      else null
    end;
  end if;

  -- 4. Tenant validation (unless platform sys_admin)
  if v_actor_role <> 'sys_admin' then
    if v_actor_tenant_id is null or v_actor_tenant_id <> v_visit.distributor_id then
      raise exception 'Actor tenant mismatch.';
    end if;

    -- Role-specific authorization
    if v_actor_role = 'sales_motoris' then
      -- Sales can only finalize their own visit
      if v_visit.sales_id <> p_actor_id then
        raise exception 'Sales can only finalize own visit.';
      end if;
    elsif v_actor_role in ('admin', 'distributor') then
      -- Admin/Distributor: tenant match already validated above
      null;
    elsif v_actor_role = 'mitra_umkm' then
      raise exception 'Mitra UMKM not authorized to finalize visit.';
    elsif v_actor_role in ('supervisor', 'hrd') then
      -- NOT VERIFIED in repository — deny by default
      raise exception 'Role not authorized to finalize visit.';
    else
      raise exception 'Role not authorized to finalize visit.';
    end if;
  end if;

  -- === ORIGINAL LOGIC (UNCHANGED) ===
  -- Lock and ensure stock rows exist for all products in cards
  for v_card in
    select product_id from public.visit_product_cards where visit_id = p_visit_id group by product_id order by product_id
  loop
    insert into public.sales_stock (distributor_id, sales_id, product_id, quantity, updated_at)
    values (v_visit.distributor_id, v_visit.sales_id, v_card.product_id, 0, v_now)
    on conflict (sales_id, product_id) do nothing;

    insert into public.outlet_stock (distributor_id, outlet_id, product_id, quantity, ownership_type, updated_at)
    values (v_visit.distributor_id, v_visit.outlet_id, v_card.product_id, 0, 'KONSINYASI', v_now)
    on conflict (outlet_id, product_id, ownership_type) do nothing;

    insert into public.outlet_stock (distributor_id, outlet_id, product_id, quantity, ownership_type, updated_at)
    values (v_visit.distributor_id, v_visit.outlet_id, v_card.product_id, 0, 'MILIK_OUTLET', v_now)
    on conflict (outlet_id, product_id, ownership_type) do nothing;
  end loop;

  -- Lock stock rows for update
  for v_ss in
    select ss.* from public.sales_stock ss
    where ss.sales_id = v_visit.sales_id
      and ss.product_id in (select product_id from public.visit_product_cards where visit_id = p_visit_id)
    order by ss.product_id
  loop null; end loop;

  for v_oc in
    select os.* from public.outlet_stock os
    where os.outlet_id = v_visit.outlet_id
      and os.product_id in (select product_id from public.visit_product_cards where visit_id = p_visit_id)
      and os.ownership_type in ('KONSINYASI', 'MILIK_OUTLET')
    order by os.product_id
  loop null; end loop;

  -- Process each card
  for v_card in
    select * from public.visit_product_cards where visit_id = p_visit_id order by id
  loop
    select quantity into v_prev_ss from public.sales_stock
    where sales_id = v_visit.sales_id and product_id = v_card.product_id;
    select quantity into v_prev_oc from public.outlet_stock
    where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'KONSINYASI';

    v_prev_ss := coalesce(v_prev_ss, 0);
    v_prev_oc := coalesce(v_prev_oc, 0);

    v_stock_after := v_card.stock_before;
    v_added := false;

    if v_visit.transaction_status = 'LUNAS' then
      case v_card.condition
        when 'TOKO_BARU' then
          -- add from sales stock -> outlet, barang MILIK_OUTLET (LUNAS), segera terjual
          if v_card.add_qty > 0 then
            update public.sales_stock set quantity = quantity - v_card.add_qty, updated_at = v_now
            where sales_id = v_visit.sales_id and product_id = v_card.product_id;
            update public.outlet_stock set quantity = quantity + v_card.add_qty, updated_at = v_now
            where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'MILIK_OUTLET';
            insert into public.visit_stock_movements (distributor_id, visit_id, card_id, outlet_id, product_id, movement_type, quantity, prev_sales_stock, prev_outlet_stock, created_by, created_at)
            values (v_visit.distributor_id, p_visit_id, v_card.id, v_visit.outlet_id, v_card.product_id, 'ADD_IN', v_card.add_qty, v_prev_ss, v_prev_oc, p_actor_id, v_now);
            v_prev_oc := v_prev_oc + v_card.add_qty;
          end if;
          if v_card.sales_qty > 0 then
            update public.outlet_stock set quantity = quantity - v_card.sales_qty, updated_at = v_now
            where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'MILIK_OUTLET';
            insert into public.visit_stock_movements (distributor_id, visit_id, card_id, outlet_id, product_id, movement_type, quantity, prev_sales_stock, prev_outlet_stock, created_by, created_at)
            values (v_visit.distributor_id, p_visit_id, v_card.id, v_visit.outlet_id, v_card.product_id, 'SALES_OUT', v_card.sales_qty, v_prev_ss, v_prev_oc, p_actor_id, v_now);
          end if;
          v_stock_after := v_card.add_qty;

        when 'TOKO_BUKA' then
          -- restock dari sales stock -> outlet MILIK_OUTLET (LUNAS)
          if v_card.restock_qty > 0 then
            update public.sales_stock set quantity = quantity - v_card.restock_qty, updated_at = v_now
            where sales_id = v_visit.sales_id and product_id = v_card.product_id;
            update public.outlet_stock set quantity = quantity + v_card.restock_qty, updated_at = v_now
            where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'MILIK_OUTLET';
            insert into public.visit_stock_movements (distributor_id, visit_id, card_id, outlet_id, product_id, movement_type, quantity, prev_sales_stock, prev_outlet_stock, created_by, created_at)
            values (v_visit.distributor_id, p_visit_id, v_card.id, v_visit.outlet_id, v_card.product_id, 'RESTOCK_IN', v_card.restock_qty, v_prev_ss, v_prev_oc, p_actor_id, v_now);
            v_prev_oc := v_prev_oc + v_card.restock_qty;
          end if;
          if v_card.sales_qty > 0 then
            update public.outlet_stock set quantity = quantity - v_card.sales_qty, updated_at = v_now
            where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'MILIK_OUTLET';
            insert into public.visit_stock_movements (distributor_id, visit_id, card_id, outlet_id, product_id, movement_type, quantity, prev_sales_stock, prev_outlet_stock, created_by, created_at)
            values (v_visit.distributor_id, p_visit_id, v_card.id, v_visit.outlet_id, v_card.product_id, 'SALES_OUT', v_card.sales_qty, v_prev_ss, v_prev_oc, p_actor_id, v_now);
          end if;
          v_stock_after := v_card.physical_check + v_card.restock_qty - v_card.sales_qty;

        when 'TOKO_NONAKTIF' then
          -- restock from sales
          if v_card.restock_qty > 0 then
            update public.sales_stock set quantity = quantity - v_card.restock_qty, updated_at = v_now
            where sales_id = v_visit.sales_id and product_id = v_card.product_id;
            update public.outlet_stock set quantity = quantity + v_card.restock_qty, updated_at = v_now
            where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'KONSINYASI';
            insert into public.visit_stock_movements (distributor_id, visit_id, card_id, outlet_id, product_id, movement_type, quantity, prev_sales_stock, prev_outlet_stock, created_by, created_at)
            values (v_visit.distributor_id, p_visit_id, v_card.id, v_visit.outlet_id, v_card.product_id, 'RESTOCK_IN', v_card.restock_qty, v_prev_ss, v_prev_oc, p_actor_id, v_now);
            v_prev_oc := v_prev_oc + v_card.restock_qty;
          end if;
          if v_card.sales_qty > 0 then
            update public.outlet_stock set quantity = quantity - v_card.sales_qty, updated_at = v_now
            where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'KONSINYASI';
            insert into public.visit_stock_movements (distributor_id, visit_id, card_id, outlet_id, product_id, movement_type, quantity, prev_sales_stock, prev_outlet_stock, created_by, created_at)
            values (v_visit.distributor_id, p_visit_id, v_card.id, v_visit.outlet_id, v_card.product_id, 'SALES_OUT', v_card.sales_qty, v_prev_ss, v_prev_oc, p_actor_id, v_now);
          end if;
          -- ownership transfer remaining
          select quantity into v_prev_oc from public.outlet_stock
          where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'KONSINYASI';
          if v_prev_oc > 0 then
            insert into public.outlet_stock (distributor_id, outlet_id, product_id, quantity, ownership_type, updated_at)
            values (v_visit.distributor_id, v_visit.outlet_id, v_card.product_id, v_prev_oc, 'MILIK_OUTLET', v_now)
            on conflict (outlet_id, product_id, ownership_type)
            do update set quantity = outlet_stock.quantity + v_prev_oc, updated_at = v_now;
            update public.outlet_stock set quantity = 0, updated_at = v_now
            where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'KONSINYASI';
            insert into public.visit_stock_movements (distributor_id, visit_id, card_id, outlet_id, product_id, movement_type, quantity, prev_sales_stock, prev_outlet_stock, created_by, created_at)
            values (v_visit.distributor_id, p_visit_id, v_card.id, v_visit.outlet_id, v_card.product_id, 'OWNERSHIP_TRANSFER', v_prev_oc, v_prev_ss, v_prev_oc, p_actor_id, v_now);
          end if;
          v_stock_after := 0;

        when 'TOKO_TUTUP', 'MASIH_STOK' then
          v_stock_after := v_card.stock_before;
          -- No stock movement
      end case;

    else -- KONSINYASI
      case v_card.condition
        when 'TOKO_BARU' then
          if v_card.add_qty > 0 then
            update public.sales_stock set quantity = quantity - v_card.add_qty, updated_at = v_now
            where sales_id = v_visit.sales_id and product_id = v_card.product_id;
            update public.outlet_stock set quantity = quantity + v_card.add_qty, updated_at = v_now
            where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'KONSINYASI';
            insert into public.visit_stock_movements (distributor_id, visit_id, card_id, outlet_id, product_id, movement_type, quantity, prev_sales_stock, prev_outlet_stock, created_by, created_at)
            values (v_visit.distributor_id, p_visit_id, v_card.id, v_visit.outlet_id, v_card.product_id, 'ADD_IN', v_card.add_qty, v_prev_ss, v_prev_oc, p_actor_id, v_now);
          end if;
          v_stock_after := v_card.add_qty;

        when 'TOKO_BUKA' then
          -- laku lama = stock_before - physical_check (old_sales_qty)
          if v_card.old_sales_qty > 0 then
            update public.outlet_stock set quantity = quantity - v_card.old_sales_qty, updated_at = v_now
            where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'KONSINYASI';
            insert into public.visit_stock_movements (distributor_id, visit_id, card_id, outlet_id, product_id, movement_type, quantity, prev_sales_stock, prev_outlet_stock, created_by, created_at)
            values (v_visit.distributor_id, p_visit_id, v_card.id, v_visit.outlet_id, v_card.product_id, 'SALES_OUT', v_card.old_sales_qty, v_prev_ss, v_prev_oc, p_actor_id, v_now);
            v_prev_oc := v_prev_oc - v_card.old_sales_qty;
          end if;
          if v_card.restock_qty > 0 then
            update public.sales_stock set quantity = quantity - v_card.restock_qty, updated_at = v_now
            where sales_id = v_visit.sales_id and product_id = v_card.product_id;
            update public.outlet_stock set quantity = quantity + v_card.restock_qty, updated_at = v_now
            where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'KONSINYASI';
            insert into public.visit_stock_movements (distributor_id, visit_id, card_id, outlet_id, product_id, movement_type, quantity, prev_sales_stock, prev_outlet_stock, created_by, created_at)
            values (v_visit.distributor_id, p_visit_id, v_card.id, v_visit.outlet_id, v_card.product_id, 'RESTOCK_IN', v_card.restock_qty, v_prev_ss, v_prev_oc, p_actor_id, v_now);
            v_prev_oc := v_prev_oc + v_card.restock_qty;
          end if;
          if v_card.return_qty > 0 then
            update public.outlet_stock set quantity = quantity - v_card.return_qty, updated_at = v_now
            where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'KONSINYASI';
            update public.sales_stock set quantity = quantity + v_card.return_qty, updated_at = v_now
            where sales_id = v_visit.sales_id and product_id = v_card.product_id;
            insert into public.visit_stock_movements (distributor_id, visit_id, card_id, outlet_id, product_id, movement_type, quantity, prev_sales_stock, prev_outlet_stock, created_by, created_at)
            values (v_visit.distributor_id, p_visit_id, v_card.id, v_visit.outlet_id, v_card.product_id, 'RETURN_OUT', v_card.return_qty, v_prev_ss, v_prev_oc, p_actor_id, v_now);
            v_prev_oc := v_prev_oc - v_card.return_qty;
          end if;
          v_stock_after := v_card.physical_check + v_card.restock_qty - v_card.return_qty;

        when 'TOKO_NONAKTIF' then
          -- cek fisik, laku lama, sisa ditarik, stock_after=0
          if v_card.sales_qty > 0 then
            update public.outlet_stock set quantity = quantity - v_card.sales_qty, updated_at = v_now
            where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'KONSINYASI';
            insert into public.visit_stock_movements (distributor_id, visit_id, card_id, outlet_id, product_id, movement_type, quantity, prev_sales_stock, prev_outlet_stock, created_by, created_at)
            values (v_visit.distributor_id, p_visit_id, v_card.id, v_visit.outlet_id, v_card.product_id, 'SALES_OUT', v_card.sales_qty, v_prev_ss, v_prev_oc, p_actor_id, v_now);
            v_prev_oc := v_prev_oc - v_card.sales_qty;
          end if;
          if v_prev_oc > 0 then
            update public.outlet_stock set quantity = 0, updated_at = v_now
            where outlet_id = v_visit.outlet_id and product_id = v_card.product_id and ownership_type = 'KONSINYASI';
            update public.sales_stock set quantity = quantity + v_prev_oc, updated_at = v_now
            where sales_id = v_visit.sales_id and product_id = v_card.product_id;
            insert into public.visit_stock_movements (distributor_id, visit_id, card_id, outlet_id, product_id, movement_type, quantity, prev_sales_stock, prev_outlet_stock, created_by, created_at)
            values (v_visit.distributor_id, p_visit_id, v_card.id, v_visit.outlet_id, v_card.product_id, 'RETURN_OUT', v_prev_oc, v_prev_ss, v_prev_oc, p_actor_id, v_now);
          end if;
          v_stock_after := 0;

        when 'TOKO_TUTUP', 'MASIH_STOK' then
          v_stock_after := v_card.stock_before;
      end case;
    end if;

    -- Update card stock_after
    update public.visit_product_cards set stock_after = v_stock_after, updated_at = v_now where id = v_card.id;

    -- REQUIRED PHOTO validation (DBML: finalisasi wajib DITOLAK bila foto wajib belum tersedia)
    if v_card.condition in ('TOKO_BARU', 'TOKO_BUKA', 'TOKO_NONAKTIF', 'MASIH_STOK') then
      if not exists (
        select 1 from public.visit_photos
        where visit_id = p_visit_id and card_id = v_card.id and photo_type = 'FOTO_PRODUK'
      ) then
        raise exception 'Kartu % wajib memiliki foto produk (FOTO_PRODUK).', v_card.id;
      end if;
    end if;
    if v_card.condition in ('TOKO_TUTUP', 'TOKO_NONAKTIF', 'MASIH_STOK') then
      if not exists (
        select 1 from public.visit_photos
        where visit_id = p_visit_id and photo_type = 'FOTO_AKHIR'
      ) then
        raise exception 'Visit wajib memiliki foto akhir (FOTO_AKHIR) untuk kartu %.', v_card.id;
      end if;
      if btrim(coalesce(v_card.alasan, '')) = '' then
        raise exception 'Kartu % wajib memiliki alasan untuk kondisi %.', v_card.id, v_card.condition;
      end if;
    end if;

    -- PAYMENT INVARIANT validation (amount_paid + receivable = amount_due per card)
    if v_card.amount_due > 0 then
      if v_visit.transaction_status = 'LUNAS' and (v_card.amount_paid is null or v_card.amount_paid < v_card.amount_due) then
        raise exception 'Kartu % wajib LUNAS penuh (amount_paid = amount_due).', v_card.id;
      end if;
      if v_card.amount_paid is not null and v_card.amount_paid > v_card.amount_due then
        raise exception 'Kartu % amount_paid melebihi amount_due.', v_card.id;
      end if;
    end if;

    -- Accumulate transaction totals if this card has sales/revenue
    if v_card.amount_due > 0 then
      v_has_sale := true;
      v_total_amount := v_total_amount + v_card.amount_due;
      v_total_paid := v_total_paid + v_card.amount_paid;
    end if;
  end loop;

  -- Create transaction if there are sales
  if v_has_sale and v_total_amount > 0 then
    v_trx_number := 'TRX-' || to_char(v_visit.visit_date, 'YYYYMMDD') || '-' || left(replace(v_visit.id::text, '-', ''), 8);

    insert into public.transactions (distributor_id, visit_id, transaction_number, transaction_status, transaction_date, total_amount, amount_paid, receivable_amount, created_by, created_at, updated_at)
    values (v_visit.distributor_id, p_visit_id, v_trx_number, v_visit.transaction_status, v_visit.visit_date, v_total_amount, v_total_paid, v_total_amount - v_total_paid, p_actor_id, v_now, v_now)
    returning id into v_transaction_id;

    for v_card in
      select * from public.visit_product_cards where visit_id = p_visit_id and amount_due > 0
    loop
      insert into public.transaction_items (distributor_id, transaction_id, visit_product_card_id, product_id, quantity, selling_price, discount, line_total, created_at)
      values (v_visit.distributor_id, v_transaction_id, v_card.id, v_card.product_id, v_card.sales_qty + v_card.old_sales_qty, v_card.selling_price, 0, v_card.amount_due, v_now);
    end loop;
  end if;

  -- Create receivables for unpaid KONSINYASI balances (PAYMENT INVARIANT)
  for v_card in
    select * from public.visit_product_cards where visit_id = p_visit_id and amount_due > 0
  loop
    if v_card.amount_due - coalesce(v_card.amount_paid, 0) > 0 then
      if v_visit.transaction_status = 'KONSINYASI' then
        insert into public.visit_receivables (visit_id, card_id, amount, paid_amount, status, due_date, created_by, created_at, updated_at)
        values (p_visit_id, v_card.id, v_card.amount_due - coalesce(v_card.amount_paid, 0), 0, 'OPEN', null, p_actor_id, v_now, v_now);
      else
        raise exception 'Kartu % tidak boleh memiliki sisa tagihan pada mode LUNAS.', v_card.id;
      end if;
    end if;
  end loop;

  -- Mark cards as APPLIED (status machine DRAFT -> APPLIED)
  update public.visit_product_cards set status = 'APPLIED', updated_at = v_now
  where visit_id = p_visit_id and status = 'DRAFT';

  insert into public.visit_events (visit_id, event_type, actor_id, metadata, created_at)
  values (p_visit_id, 'CARD_APPLIED', p_actor_id, '{}'::jsonb, v_now);

  -- Finalize visit
  update public.visits
  set status = 'FINALIZED', finalized_at = v_now, finalized_by = p_actor_id, checkout_at = v_now, updated_at = v_now
  where id = p_visit_id;

  insert into public.visit_events (visit_id, event_type, actor_id, metadata, created_at)
  values (p_visit_id, 'VISIT_FINALIZED', p_actor_id, jsonb_build_object('transaction_id', v_transaction_id), v_now);

  return jsonb_build_object('visit_id', p_visit_id, 'status', 'FINALIZED', 'transaction_id', v_transaction_id, 'total_amount', v_total_amount);
end;
$fn$;

-- Grants unchanged
revoke all on function public.finalize_visit(uuid, uuid) from public;
revoke all on function public.finalize_visit(uuid, uuid) from anon;
revoke all on function public.finalize_visit(uuid, uuid) from authenticated;
grant execute on function public.finalize_visit(uuid, uuid) to service_role;