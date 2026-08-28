create table if not exists public.consignment_items (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references auth.users(id) on delete cascade,
  mitra_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  sku text check (sku is null or char_length(btrim(sku)) <= 80),
  unit text not null default 'pcs' check (char_length(btrim(unit)) between 1 and 40),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  minimum_stock integer not null default 0 check (minimum_stock >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists consignment_items_mitra_idx
  on public.consignment_items (mitra_user_id, updated_at desc);

create index if not exists consignment_items_distributor_idx
  on public.consignment_items (distributor_id, updated_at desc);

alter table public.consignment_items enable row level security;

create policy "Mitra can read own consignment items"
  on public.consignment_items
  for select
  to authenticated
  using (
    auth.uid() = mitra_user_id
    or auth.uid() = distributor_id
    or (
      coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'distributor')
      and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
    )
  );

create policy "Mitra can insert own consignment items"
  on public.consignment_items
  for insert
  to authenticated
  with check (
    auth.uid() = mitra_user_id
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'mitra_umkm'
  );

create policy "Mitra can update own consignment items"
  on public.consignment_items
  for update
  to authenticated
  using (
    auth.uid() = mitra_user_id
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'mitra_umkm'
  )
  with check (
    auth.uid() = mitra_user_id
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'mitra_umkm'
  );

create policy "Mitra can delete own consignment items"
  on public.consignment_items
  for delete
  to authenticated
  using (
    auth.uid() = mitra_user_id
    and auth.jwt() -> 'app_metadata' ->> 'role' = 'mitra_umkm'
  );
