-- PHASE ADMIN-OPERASIONAL-01D
-- Product Master foundation. Forward-only and backward-compatible.

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references auth.users(id) on delete cascade,
  created_by_mitra_user_id uuid references auth.users(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  sku text check (sku is null or char_length(btrim(sku)) <= 80),
  unit text not null default 'pcs' check (char_length(btrim(unit)) between 1 and 40),
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_distributor_idx
  on public.products (distributor_id, lifecycle_status, updated_at desc);

create unique index if not exists products_distributor_sku_unique_idx
  on public.products (distributor_id, lower(btrim(sku)))
  where sku is not null;

alter table public.consignment_requests
  add column if not exists product_id uuid references public.products(id) on delete set null;

alter table public.consignment_items
  add column if not exists product_id uuid references public.products(id) on delete set null;

create index if not exists consignment_requests_product_idx
  on public.consignment_requests (product_id, status, created_at desc);

create index if not exists consignment_items_product_idx
  on public.consignment_items (product_id, updated_at desc);

alter table public.products enable row level security;

drop policy if exists "Distributor can read own products" on public.products;
create policy "Distributor can read own products"
  on public.products for select to authenticated
  using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'distributor'
    and auth.uid() = distributor_id
  );

drop policy if exists "Admin can read workspace products" on public.products;
create policy "Admin can read workspace products"
  on public.products for select to authenticated
  using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
  );

drop policy if exists "Mitra can read assigned products" on public.products;
create policy "Mitra can read assigned products"
  on public.products for select to authenticated
  using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'mitra_umkm'
    and exists (
      select 1
        from public.consignment_items item
       where item.product_id = products.id
         and item.mitra_user_id = auth.uid()
         and item.distributor_id = products.distributor_id
    )
  );

-- No automatic backfill is performed. Existing inventory and requests remain valid
-- with nullable product_id until an identity-safe mapping is approved.

create or replace function public.review_consignment_request(
  p_request_id uuid,
  p_distributor_id uuid,
  p_reviewer_id uuid,
  p_decision text,
  p_review_note text
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
as $$
declare
  v_request public.consignment_requests%rowtype;
  v_reviewer_metadata jsonb;
  v_reviewer_role text;
  v_reviewer_distributor_id text;
  v_item_id uuid;
  v_product_id uuid;
  v_previous_stock integer := 0;
  v_resulting_stock integer;
  v_review_note text := nullif(btrim(coalesce(p_review_note, '')), '');
  v_reviewed_at timestamptz := timezone('utc', now());
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = 'Invalid consignment review decision.';
  end if;

  if v_review_note is not null and char_length(v_review_note) > 500 then
    raise exception using errcode = '22001', message = 'Consignment review note exceeds 500 characters.';
  end if;

  select app_metadata into v_reviewer_metadata from auth.users where id = p_reviewer_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Consignment reviewer was not found.';
  end if;

  v_reviewer_role := v_reviewer_metadata ->> 'role';
  v_reviewer_distributor_id := v_reviewer_metadata ->> 'distributor_id';
  if not (v_reviewer_role = 'distributor' and p_reviewer_id = p_distributor_id) then
    raise exception using errcode = '42501', message = 'Reviewer is not authorized for this distributor workspace.';
  end if;

  select * into v_request
    from public.consignment_requests
   where id = p_request_id and distributor_id = p_distributor_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Consignment request was not found in this distributor workspace.';
  end if;

  if v_request.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'Consignment request has already been processed.';
  end if;

  v_item_id := v_request.item_id;
  v_product_id := v_request.product_id;

  if p_decision = 'approved' and v_request.request_type = 'new_item' then
    if v_request.proposed_name is null
      or v_request.proposed_unit is null
      or v_request.proposed_stock_quantity is null
      or v_request.proposed_minimum_stock is null then
      raise exception using errcode = '22023', message = 'New-item consignment request is incomplete.';
    end if;

    insert into public.products (
      distributor_id,
      created_by_mitra_user_id,
      name,
      sku,
      unit,
      lifecycle_status
    ) values (
      p_distributor_id,
      v_request.mitra_user_id,
      v_request.proposed_name,
      v_request.proposed_sku,
      v_request.proposed_unit,
      'active'
    ) returning id into v_product_id;

    insert into public.consignment_items (
      distributor_id,
      mitra_user_id,
      product_id,
      name,
      sku,
      unit,
      stock_quantity,
      minimum_stock
    ) values (
      p_distributor_id,
      v_request.mitra_user_id,
      v_product_id,
      v_request.proposed_name,
      v_request.proposed_sku,
      v_request.proposed_unit,
      v_request.proposed_stock_quantity,
      v_request.proposed_minimum_stock
    ) returning id into v_item_id;

    v_resulting_stock := v_request.proposed_stock_quantity;
  elsif p_decision = 'approved' and v_request.request_type = 'stock_change' then
    if v_request.item_id is null or v_request.proposed_stock_quantity is null then
      raise exception using errcode = '22023', message = 'Stock-change consignment request is incomplete.';
    end if;

    select stock_quantity, product_id into v_previous_stock, v_product_id
      from public.consignment_items
     where id = v_request.item_id
       and distributor_id = p_distributor_id
       and mitra_user_id = v_request.mitra_user_id
     for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Consignment item for stock change was not found.';
    end if;

    v_resulting_stock := v_request.proposed_stock_quantity;
    update public.consignment_items
       set stock_quantity = v_resulting_stock,
           updated_at = v_reviewed_at
     where id = v_request.item_id
       and distributor_id = p_distributor_id
       and mitra_user_id = v_request.mitra_user_id;
  end if;

  update public.consignment_requests
     set status = p_decision,
         reviewed_by = p_reviewer_id,
         review_note = v_review_note,
         reviewed_at = v_reviewed_at,
         updated_at = v_reviewed_at,
         item_id = v_item_id,
         product_id = v_product_id
   where id = v_request.id
     and distributor_id = p_distributor_id
     and status = 'pending';
  if not found then
    raise exception using errcode = 'P0001', message = 'Consignment request has already been processed.';
  end if;

  if p_decision = 'approved' then
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
    ) values (
      p_distributor_id,
      v_request.mitra_user_id,
      v_item_id,
      v_request.id,
      v_previous_stock,
      v_resulting_stock - v_previous_stock,
      v_resulting_stock,
      case when v_request.request_type = 'new_item' then 'initial_stock' else 'supplier_stock_change' end,
      v_request.reason,
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
  ) values (
    v_request.mitra_user_id,
    p_distributor_id,
    v_request.id,
    case when p_decision = 'approved' then 'request_approved' else 'request_rejected' end,
    case when p_decision = 'approved' then 'Pengajuan supplier disetujui' else 'Pengajuan supplier ditolak' end,
    case
      when p_decision = 'approved' then 'Pengajuan Anda telah disetujui dan data resmi sudah diperbarui.'
      when v_review_note is not null then 'Pengajuan Anda ditolak: ' || v_review_note
      else 'Pengajuan Anda ditolak.'
    end
  );

  return query
  select v_request.id, p_decision, v_request.request_type, v_item_id,
         v_request.mitra_user_id, p_distributor_id, p_reviewer_id,
         v_reviewed_at, v_review_note;
end;
$$;

revoke all on function public.review_consignment_request(uuid, uuid, uuid, text, text) from public;
grant execute on function public.review_consignment_request(uuid, uuid, uuid, text, text) to service_role;
