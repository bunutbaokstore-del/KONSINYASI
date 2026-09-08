-- PHASE 5 OPEN-2
-- Restrict authenticated Mitra INSERT on public.consignment_requests so that
-- item_id/product_id references are constrained to the caller's own tenant
-- scope. Forward-only and backward-compatible.

drop policy if exists "Supplier can submit own scoped requests"
  on public.consignment_requests;

create policy "Supplier can submit own scoped requests"
  on public.consignment_requests
  for insert
  to authenticated
  with check (
    auth.uid() = mitra_user_id
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'mitra_umkm'
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and (
      (
        request_type = 'new_item'
        and item_id is null
      )
      or
      (
        request_type = 'stock_change'
        and item_id is not null
      )
    )
    and (
      item_id is null
      or exists (
        select 1
          from public.consignment_items ci
         where ci.id = item_id
           and ci.mitra_user_id = mitra_user_id
           and ci.distributor_id = distributor_id
      )
    )
    and (
      product_id is null
      or exists (
        select 1
          from public.products p
         where p.id = product_id
           and p.distributor_id = distributor_id
      )
    )
  );

revoke insert on public.consignment_requests from anon;