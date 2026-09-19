-- Outlet Photos Storage Policies
-- Tenant-scoped RLS policies for bucket 'outlet-photos'
-- Path structure: {distributor_id}/{outlet_id}/{uuid}.{ext}
-- Example: 550e8400-e29b-41d4-a716-446655440000/550e8400-e29b-41d4-a716-446655440001/a1b2c3d4.jpg

-- SELECT: Authenticated users can read outlet photos from their own distributor
-- Matches outlets_tenant_select: distributor + admin + sales_motoris (via assignment)
-- For storage, we allow distributor and admin to read; sales_motoris can read via assignment check on outlets table
create policy outlet_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'outlet-photos'
    and (
      -- Distributor owns all photos in their folder
      (storage.foldername(name))[1] = auth.jwt() -> 'app_metadata' ->> 'distributor_id'
      -- Admin can read all photos in their workspace
      or (
        auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
        and (storage.foldername(name))[1] = auth.jwt() -> 'app_metadata' ->> 'distributor_id'
      )
      -- Platform sys_admin can read all
      or (auth.jwt() -> 'app_metadata' ->> 'role') = 'platform_sys_admin'
    )
  );

-- INSERT: Only admin and distributor can upload outlet photos
-- Must be in their own distributor folder
-- Outlet ID validation happens in mutation (tenant isolation)
create policy outlet_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'outlet-photos'
    and auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
    and (storage.foldername(name))[1] = auth.jwt() -> 'app_metadata' ->> 'distributor_id'
    -- Path must have at least 2 segments: distributor_id/outlet_id/filename
    and array_length(storage.foldername(name), 1) >= 2
  );

-- UPDATE: Only admin and distributor can update (replace) outlet photos
-- Must be in their own distributor folder
create policy outlet_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'outlet-photos'
    and auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
    and (storage.foldername(name))[1] = auth.jwt() -> 'app_metadata' ->> 'distributor_id'
  )
  with check (
    bucket_id = 'outlet-photos'
    and auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
    and (storage.foldername(name))[1] = auth.jwt() -> 'app_metadata' ->> 'distributor_id'
  );

-- DELETE: Only admin and distributor can delete outlet photos
-- Must be in their own distributor folder
create policy outlet_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'outlet-photos'
    and auth.jwt() -> 'app_metadata' ->> 'role' in ('admin', 'distributor')
    and (storage.foldername(name))[1] = auth.jwt() -> 'app_metadata' ->> 'distributor_id'
  );