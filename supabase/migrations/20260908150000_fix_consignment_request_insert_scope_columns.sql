-- PHASE 5 OPEN-2 (fix)
-- Fix the column-resolution bug in the INSERT policy "Supplier can submit own
-- scoped requests": qualify the outer consignment_requests columns explicitly
-- so the ownership subqueries compare against the new request row, not the
-- aliased inner tables. Forward-only; supersedes the buggy policy from
-- 20260908140000 without editing that migration.

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
         where ci.id = consignment_requests.item_id
           and ci.mitra_user_id = consignment_requests.mitra_user_id
           and ci.distributor_id = consignment_requests.distributor_id
      )
    )
    and (
      product_id is null
      or exists (
        select 1
          from public.products p
         where p.id = consignment_requests.product_id
           and p.distributor_id = consignment_requests.distributor_id
      )
    )
  );