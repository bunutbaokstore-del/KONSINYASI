-- PHASE 2A.2 P0: RLS and tenant hardening
-- This migration is intentionally limited to RLS/policy hardening.

create or replace function public.current_tenant_id()
returns uuid
language plpgsql
stable
as $$
declare
  role_name text := auth.jwt() -> 'app_metadata' ->> 'role';
  tenant_claim text := auth.jwt() -> 'app_metadata' ->> 'distributor_id';
begin
  if role_name = 'distributor' then
    return auth.uid();
  end if;

  if tenant_claim is null or tenant_claim !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;

  return tenant_claim::uuid;
end;
$$;

drop policy if exists "Mitra can read own consignment items"
  on public.consignment_items;
drop policy if exists "Mitra can read own tenant consignment items"
  on public.consignment_items;
drop policy if exists "Manager can read tenant consignment items"
  on public.consignment_items;

create policy "Mitra can read own tenant consignment items"
  on public.consignment_items
  for select
  to authenticated
  using (
    auth.uid() = mitra_user_id
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'mitra_umkm'
    and public.current_tenant_id() = distributor_id
  );

create policy "Manager can read tenant consignment items"
  on public.consignment_items
  for select
  to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'distributor')
    and public.current_tenant_id() = distributor_id
  );

create or replace function public.prevent_consignment_request_scope_change()
returns trigger
language plpgsql
as $$
begin
  if new.distributor_id is distinct from old.distributor_id
     or new.mitra_user_id is distinct from old.mitra_user_id
     or new.request_type is distinct from old.request_type
     or new.item_id is distinct from old.item_id then
    raise exception 'consignment request ownership fields are immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists consignment_requests_immutable_scope
  on public.consignment_requests;

create trigger consignment_requests_immutable_scope
before update on public.consignment_requests
for each row
execute function public.prevent_consignment_request_scope_change();

drop policy if exists "Admin can review workspace consignment requests"
  on public.consignment_requests;
drop policy if exists "Manager can read tenant consignment requests"
  on public.consignment_requests;

create policy "Manager can review tenant consignment requests"
  on public.consignment_requests
  for update
  to authenticated
  using (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'distributor')
    and public.current_tenant_id() = distributor_id
  )
  with check (
    (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'distributor')
    and public.current_tenant_id() = distributor_id
    and status in ('approved', 'rejected')
    and reviewed_by = auth.uid()
  );
