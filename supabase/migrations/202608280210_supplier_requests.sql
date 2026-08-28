drop policy if exists "Mitra can insert own consignment items" on public.consignment_items;
drop policy if exists "Mitra can update own consignment items" on public.consignment_items;
drop policy if exists "Mitra can delete own consignment items" on public.consignment_items;

create table if not exists public.consignment_requests (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references auth.users(id) on delete cascade,
  mitra_user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid references public.consignment_items(id) on delete cascade,
  request_type text not null check (request_type in ('new_item', 'stock_change')),
  proposed_name text check (proposed_name is null or char_length(btrim(proposed_name)) between 1 and 160),
  proposed_sku text check (proposed_sku is null or char_length(btrim(proposed_sku)) <= 80),
  proposed_unit text check (proposed_unit is null or char_length(btrim(proposed_unit)) between 1 and 40),
  proposed_stock_quantity integer check (proposed_stock_quantity is null or proposed_stock_quantity >= 0),
  proposed_minimum_stock integer check (proposed_minimum_stock is null or proposed_minimum_stock >= 0),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text check (review_note is null or char_length(btrim(review_note)) <= 500),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists consignment_requests_scope_idx on public.consignment_requests (distributor_id, status, created_at desc);
create index if not exists consignment_requests_mitra_idx on public.consignment_requests (mitra_user_id, status, created_at desc);

alter table public.consignment_requests enable row level security;

create policy "Supplier can read own consignment requests"
  on public.consignment_requests for select to authenticated
  using (auth.uid() = mitra_user_id);

create policy "Admin can read workspace consignment requests"
  on public.consignment_requests for select to authenticated
  using (
    auth.uid() = distributor_id
    or (
      auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
      and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
    )
  );

create policy "Supplier can submit own consignment requests"
  on public.consignment_requests for insert to authenticated
  with check (
    auth.uid() = mitra_user_id
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'mitra_umkm'
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

create policy "Admin can review workspace consignment requests"
  on public.consignment_requests for update to authenticated
  using (
    auth.uid() = distributor_id
    or (
      auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
      and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
    )
  )
  with check (
    status in ('approved', 'rejected')
    and reviewed_by = auth.uid()
  );
