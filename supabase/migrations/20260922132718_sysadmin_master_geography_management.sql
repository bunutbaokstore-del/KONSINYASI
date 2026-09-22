-- =============================================================================
-- SYSADMIN MASTER GEOGRAPHY MANAGEMENT RPCS
-- SECURITY DEFINER functions for updating, activating, and deleting Master Geography
-- Only executable by service_role; validated by sysAdminProcedure at tRPC layer
-- =============================================================================

-- =============================================================================
-- 1. UPDATE PROVINSI
-- =============================================================================
create or replace function public.update_provinsi(
  p_id uuid,
  p_nama text,
  p_actor_id uuid
) returns public.provinsi
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare
  v_role text;
  v_provinsi public.provinsi%rowtype;
begin
  -- Authorization: sys_admin only
  select raw_app_meta_data ->> 'role' into v_role
  from auth.users where id = p_actor_id;

  if v_role is distinct from 'sys_admin' then
    raise exception using errcode = '42501',
      message = 'Hanya Sysadmin yang dapat memperbarui Provinsi.';
  end if;

  -- Validation
  if p_nama is null or trim(p_nama) = '' then
    raise exception using errcode = '22001', message = 'Nama provinsi wajib diisi.';
  end if;

  if char_length(trim(p_nama)) > 120 then
    raise exception using errcode = '22001', message = 'Nama provinsi maksimal 120 karakter.';
  end if;

  -- Check exists and lock row
  select * into v_provinsi from public.provinsi where id = p_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Provinsi tidak ditemukan.';
  end if;

  -- Update
  update public.provinsi
  set nama = trim(p_nama),
      updated_at = now()
  where id = p_id
  returning * into v_provinsi;

  return v_provinsi;
end;
$fn$;

-- =============================================================================
-- 2. UPDATE KABUPATEN/KOTA
-- =============================================================================
create or replace function public.update_kabupaten_kota(
  p_id uuid,
  p_nama text,
  p_tipe public.kabupaten_kota_tipe,
  p_actor_id uuid
) returns public.kabupaten_kota
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare
  v_role text;
  v_kab public.kabupaten_kota%rowtype;
begin
  -- Authorization: sys_admin only
  select raw_app_meta_data ->> 'role' into v_role
  from auth.users where id = p_actor_id;

  if v_role is distinct from 'sys_admin' then
    raise exception using errcode = '42501',
      message = 'Hanya Sysadmin yang dapat memperbarui Kabupaten/Kota.';
  end if;

  -- Validation
  if p_nama is null or trim(p_nama) = '' then
    raise exception using errcode = '22001', message = 'Nama Kabupaten/Kota wajib diisi.';
  end if;

  if char_length(trim(p_nama)) > 120 then
    raise exception using errcode = '22001', message = 'Nama Kabupaten/Kota maksimal 120 karakter.';
  end if;

  -- Check exists and lock row
  select * into v_kab from public.kabupaten_kota where id = p_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Kabupaten/Kota tidak ditemukan.';
  end if;

  -- Update
  update public.kabupaten_kota
  set nama = trim(p_nama),
      tipe = p_tipe,
      updated_at = now()
  where id = p_id
  returning * into v_kab;

  return v_kab;
end;
$fn$;

-- =============================================================================
-- 3. UPDATE KECAMATAN
-- =============================================================================
create or replace function public.update_kecamatan(
  p_id uuid,
  p_nama text,
  p_actor_id uuid
) returns public.kecamatan
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare
  v_role text;
  v_kec public.kecamatan%rowtype;
begin
  -- Authorization: sys_admin only
  select raw_app_meta_data ->> 'role' into v_role
  from auth.users where id = p_actor_id;

  if v_role is distinct from 'sys_admin' then
    raise exception using errcode = '42501',
      message = 'Hanya Sysadmin yang dapat memperbarui Kecamatan.';
  end if;

  -- Validation
  if p_nama is null or trim(p_nama) = '' then
    raise exception using errcode = '22001', message = 'Nama Kecamatan wajib diisi.';
  end if;

  if char_length(trim(p_nama)) > 120 then
    raise exception using errcode = '22001', message = 'Nama Kecamatan maksimal 120 karakter.';
  end if;

  -- Check exists and lock row
  select * into v_kec from public.kecamatan where id = p_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Kecamatan tidak ditemukan.';
  end if;

  -- Update
  update public.kecamatan
  set nama = trim(p_nama),
      updated_at = now()
  where id = p_id
  returning * into v_kec;

  return v_kec;
end;
$fn$;

-- =============================================================================
-- 4. UPDATE DESA
-- =============================================================================
create or replace function public.update_desa(
  p_id uuid,
  p_nama text,
  p_kode_pos text,
  p_actor_id uuid
) returns public.desa
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare
  v_role text;
  v_desa public.desa%rowtype;
begin
  -- Authorization: sys_admin only
  select raw_app_meta_data ->> 'role' into v_role
  from auth.users where id = p_actor_id;

  if v_role is distinct from 'sys_admin' then
    raise exception using errcode = '42501',
      message = 'Hanya Sysadmin yang dapat memperbarui Desa/Kelurahan.';
  end if;

  -- Validation
  if p_nama is null or trim(p_nama) = '' then
    raise exception using errcode = '22001', message = 'Nama Desa/Kelurahan wajib diisi.';
  end if;

  if char_length(trim(p_nama)) > 120 then
    raise exception using errcode = '22001', message = 'Nama Desa/Kelurahan maksimal 120 karakter.';
  end if;

  if p_kode_pos is not null and char_length(trim(p_kode_pos)) > 10 then
    raise exception using errcode = '22001', message = 'Kode pos maksimal 10 karakter.';
  end if;

  -- Check exists and lock row
  select * into v_desa from public.desa where id = p_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Desa/Kelurahan tidak ditemukan.';
  end if;

  -- Update
  update public.desa
  set nama = trim(p_nama),
      kode_pos = nullif(trim(p_kode_pos), ''),
      updated_at = now()
  where id = p_id
  returning * into v_desa;

  return v_desa;
end;
$fn$;

-- =============================================================================
-- 5. SET PROVINSI ACTIVE
-- =============================================================================
create or replace function public.set_provinsi_active(
  p_id uuid,
  p_is_active boolean,
  p_actor_id uuid
) returns public.provinsi
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare
  v_role text;
  v_provinsi public.provinsi%rowtype;
begin
  -- Authorization: sys_admin only
  select raw_app_meta_data ->> 'role' into v_role
  from auth.users where id = p_actor_id;

  if v_role is distinct from 'sys_admin' then
    raise exception using errcode = '42501',
      message = 'Hanya Sysadmin yang dapat mengubah status Provinsi.';
  end if;

  -- Check exists and lock row
  select * into v_provinsi from public.provinsi where id = p_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Provinsi tidak ditemukan.';
  end if;

  -- Update
  update public.provinsi
  set is_active = p_is_active,
      updated_at = now()
  where id = p_id
  returning * into v_provinsi;

  return v_provinsi;
end;
$fn$;

-- =============================================================================
-- 6. SET KABUPATEN/KOTA ACTIVE
-- =============================================================================
create or replace function public.set_kabupaten_kota_active(
  p_id uuid,
  p_is_active boolean,
  p_actor_id uuid
) returns public.kabupaten_kota
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare
  v_role text;
  v_kab public.kabupaten_kota%rowtype;
begin
  -- Authorization: sys_admin only
  select raw_app_meta_data ->> 'role' into v_role
  from auth.users where id = p_actor_id;

  if v_role is distinct from 'sys_admin' then
    raise exception using errcode = '42501',
      message = 'Hanya Sysadmin yang dapat mengubah status Kabupaten/Kota.';
  end if;

  -- Check exists and lock row
  select * into v_kab from public.kabupaten_kota where id = p_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Kabupaten/Kota tidak ditemukan.';
  end if;

  -- Update
  update public.kabupaten_kota
  set is_active = p_is_active,
      updated_at = now()
  where id = p_id
  returning * into v_kab;

  return v_kab;
end;
$fn$;

-- =============================================================================
-- 7. SET KECAMATAN ACTIVE
-- =============================================================================
create or replace function public.set_kecamatan_active(
  p_id uuid,
  p_is_active boolean,
  p_actor_id uuid
) returns public.kecamatan
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare
  v_role text;
  v_kec public.kecamatan%rowtype;
begin
  -- Authorization: sys_admin only
  select raw_app_meta_data ->> 'role' into v_role
  from auth.users where id = p_actor_id;

  if v_role is distinct from 'sys_admin' then
    raise exception using errcode = '42501',
      message = 'Hanya Sysadmin yang dapat mengubah status Kecamatan.';
  end if;

  -- Check exists and lock row
  select * into v_kec from public.kecamatan where id = p_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Kecamatan tidak ditemukan.';
  end if;

  -- Update
  update public.kecamatan
  set is_active = p_is_active,
      updated_at = now()
  where id = p_id
  returning * into v_kec;

  return v_kec;
end;
$fn$;

-- =============================================================================
-- 8. SET DESA ACTIVE
-- =============================================================================
create or replace function public.set_desa_active(
  p_id uuid,
  p_is_active boolean,
  p_actor_id uuid
) returns public.desa
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare
  v_role text;
  v_desa public.desa%rowtype;
begin
  -- Authorization: sys_admin only
  select raw_app_meta_data ->> 'role' into v_role
  from auth.users where id = p_actor_id;

  if v_role is distinct from 'sys_admin' then
    raise exception using errcode = '42501',
      message = 'Hanya Sysadmin yang dapat mengubah status Desa/Kelurahan.';
  end if;

  -- Check exists and lock row
  select * into v_desa from public.desa where id = p_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Desa/Kelurahan tidak ditemukan.';
  end if;

  -- Update
  update public.desa
  set is_active = p_is_active,
      updated_at = now()
  where id = p_id
  returning * into v_desa;

  return v_desa;
end;
$fn$;

-- =============================================================================
-- 9. DELETE PROVINSI
-- =============================================================================
create or replace function public.delete_provinsi(
  p_id uuid,
  p_actor_id uuid
) returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare
  v_role text;
  v_child_count int;
begin
  -- Authorization: sys_admin only
  select raw_app_meta_data ->> 'role' into v_role
  from auth.users where id = p_actor_id;

  if v_role is distinct from 'sys_admin' then
    raise exception using errcode = '42501',
      message = 'Hanya Sysadmin yang dapat menghapus Provinsi.';
  end if;

  -- Check if any Kabupaten/Kota exists (child check)
  select count(*) into v_child_count
  from public.kabupaten_kota
  where provinsi_id = p_id;

  if v_child_count > 0 then
    raise exception using errcode = '22003',
      message = 'Provinsi tidak dapat dihapus karena masih memiliki Kabupaten/Kota.';
  end if;

  -- Delete (will fail if any other FK constraint exists)
  delete from public.provinsi where id = p_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Provinsi tidak ditemukan.';
  end if;
end;
$fn$;

-- =============================================================================
-- 10. DELETE KABUPATEN/KOTA
-- =============================================================================
create or replace function public.delete_kabupaten_kota(
  p_id uuid,
  p_actor_id uuid
) returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare
  v_role text;
  v_kec_count int;
  v_desa_count int;
begin
  -- Authorization: sys_admin only
  select raw_app_meta_data ->> 'role' into v_role
  from auth.users where id = p_actor_id;

  if v_role is distinct from 'sys_admin' then
    raise exception using errcode = '42501',
      message = 'Hanya Sysadmin yang dapat menghapus Kabupaten/Kota.';
  end if;

  -- Check if any Kecamatan exists (child check)
  select count(*) into v_kec_count
  from public.kecamatan
  where kabupaten_kota_id = p_id;

  if v_kec_count > 0 then
    raise exception using errcode = '22003',
      message = 'Kabupaten/Kota tidak dapat dihapus karena masih memiliki Kecamatan.';
  end if;

  -- Check if any Desa exists (child check)
  select count(*) into v_desa_count
  from public.desa
  where kabupaten_kota_id = p_id;

  if v_desa_count > 0 then
    raise exception using errcode = '22003',
      message = 'Kabupaten/Kota tidak dapat dihapus karena masih memiliki Desa.';
  end if;

  -- Delete (will fail if any other FK constraint exists)
  delete from public.kabupaten_kota where id = p_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Kabupaten/Kota tidak ditemukan.';
  end if;
end;
$fn$;

-- =============================================================================
-- 11. DELETE KECAMATAN
-- =============================================================================
create or replace function public.delete_kecamatan(
  p_id uuid,
  p_actor_id uuid
) returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare
  v_role text;
  v_desa_count int;
begin
  -- Authorization: sys_admin only
  select raw_app_meta_data ->> 'role' into v_role
  from auth.users where id = p_actor_id;

  if v_role is distinct from 'sys_admin' then
    raise exception using errcode = '42501',
      message = 'Hanya Sysadmin yang dapat menghapus Kecamatan.';
  end if;

  -- Check if any Desa exists (child check)
  select count(*) into v_desa_count
  from public.desa
  where kecamatan_id = p_id;

  if v_desa_count > 0 then
    raise exception using errcode = '22003',
      message = 'Kecamatan tidak dapat dihapus karena masih memiliki Desa.';
  end if;

  -- Delete (will fail if any other FK constraint exists)
  delete from public.kecamatan where id = p_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Kecamatan tidak ditemukan.';
  end if;
end;
$fn$;

-- =============================================================================
-- 12. DELETE DESA
-- =============================================================================
create or replace function public.delete_desa(
  p_id uuid,
  p_actor_id uuid
) returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare
  v_role text;
  v_wilayah_desa_count int;
begin
  -- Authorization: sys_admin only
  select raw_app_meta_data ->> 'role' into v_role
  from auth.users where id = p_actor_id;

  if v_role is distinct from 'sys_admin' then
    raise exception using errcode = '42501',
      message = 'Hanya Sysadmin yang dapat menghapus Desa/Kelurahan.';
  end if;

  -- Check if any wilayah_desa assignment exists (blocks delete)
  select count(*) into v_wilayah_desa_count
  from public.wilayah_desa
  where desa_id = p_id;

  if v_wilayah_desa_count > 0 then
    raise exception using errcode = '22003',
      message = 'Desa/Kelurahan tidak dapat dihapus karena masih digunakan pada Wilayah.';
  end if;

  -- Delete - outlets.desa_id is ON DELETE SET NULL, so outlets survive
  delete from public.desa where id = p_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Desa/Kelurahan tidak ditemukan.';
  end if;
end;
$fn$;

-- =============================================================================
-- GRANTS: SECURITY DEFINER functions executable only by service_role
-- =============================================================================
revoke all on function public.update_provinsi(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.update_provinsi(uuid, text, uuid) to service_role;

revoke all on function public.update_kabupaten_kota(uuid, text, kabupaten_kota_tipe, uuid) from public, anon, authenticated;
grant execute on function public.update_kabupaten_kota(uuid, text, kabupaten_kota_tipe, uuid) to service_role;

revoke all on function public.update_kecamatan(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.update_kecamatan(uuid, text, uuid) to service_role;

revoke all on function public.update_desa(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.update_desa(uuid, text, text, uuid) to service_role;

revoke all on function public.set_provinsi_active(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.set_provinsi_active(uuid, boolean, uuid) to service_role;

revoke all on function public.set_kabupaten_kota_active(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.set_kabupaten_kota_active(uuid, boolean, uuid) to service_role;

revoke all on function public.set_kecamatan_active(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.set_kecamatan_active(uuid, boolean, uuid) to service_role;

revoke all on function public.set_desa_active(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.set_desa_active(uuid, boolean, uuid) to service_role;

revoke all on function public.delete_provinsi(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_provinsi(uuid, uuid) to service_role;

revoke all on function public.delete_kabupaten_kota(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_kabupaten_kota(uuid, uuid) to service_role;

revoke all on function public.delete_kecamatan(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_kecamatan(uuid, uuid) to service_role;

revoke all on function public.delete_desa(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_desa(uuid, uuid) to service_role;