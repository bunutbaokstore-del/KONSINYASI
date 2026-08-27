create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  distributor_id uuid not null references auth.users(id) on delete restrict,
  full_name text not null check (char_length(trim(full_name)) >= 2),
  phone text not null check (char_length(trim(phone)) >= 8),
  emergency_contact_name text not null check (char_length(trim(emergency_contact_name)) >= 2),
  emergency_contact_relation text not null check (char_length(trim(emergency_contact_relation)) >= 2),
  emergency_contact_phone text not null check (char_length(trim(emergency_contact_phone)) >= 8),
  address text not null check (char_length(trim(address)) >= 10),
  ktp_storage_path text not null unique,
  ktp_original_name text not null,
  ktp_content_type text not null check (ktp_content_type in ('image/jpeg', 'image/png', 'image/webp')),
  ktp_uploaded_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists user_profiles_distributor_id_idx on public.user_profiles (distributor_id);

alter table public.user_profiles enable row level security;

create policy user_profiles_select_by_workspace on public.user_profiles
  for select to authenticated
  using (
    user_id = auth.uid()
    or distributor_id = auth.uid()
    or (
      auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
      and distributor_id::text = auth.jwt() -> 'app_metadata' ->> 'distributor_id'
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-ktp', 'user-ktp', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;

create policy user_ktp_select_by_workspace on storage.objects
  for select to authenticated
  using (
    bucket_id = 'user-ktp'
    and (storage.foldername(name))[1] = coalesce(auth.jwt() -> 'app_metadata' ->> 'distributor_id', auth.uid()::text)
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
    )
  );
