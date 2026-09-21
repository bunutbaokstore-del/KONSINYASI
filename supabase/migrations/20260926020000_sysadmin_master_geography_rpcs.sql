-- =============================================================================
-- SYSADMIN MASTER GEOGRAPHY RPCS
-- SECURITY DEFINER functions for creating Master Geography
-- Only executable by service_role; validated by sysAdminProcedure at tRPC layer
-- =============================================================================

-- =============================================================================
-- 1. CREATE PROVINSI
-- =============================================================================
create or replace function public.create_provinsi(
  p_nama text,
  p_actor_id uuid
) returns public.provinsi
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare
  v_role text;
  v_new public.provinsi%rowtype;
begin
  -- Authorization: sys_admin only
  select raw_app_meta_data ->> 'role' into v_role
  from auth.users where id = p_actor_id;
  
  if v_role is distinct from 'sys_admin' then
    raise exception using errcode = '42501', 
      message = 'Hanya Sysadmin yang dapat membuat Provinsi.';
  end if;
  
  -- Validation
  if p_nama is null or trim(p_nama) = '' then
    raise exception using errcode = '22001', message = 'Nama provinsi wajib diisi.';
  end if;
  
  if char_length(trim(p_nama)) > 120 then
    raise exception using errcode = '22001', message = 'Nama provinsi maksimal 120 karakter.';
  end if;
  
  -- Insert with kode_bps = NULL
  insert into public.provinsi (kode_bps, nama)
  values (null, trim(p_nama))
  returning * into v_new;
  
  return v_new;
end;
$fn$;

-- =============================================================================
-- 2. CREATE KABUPATEN/KOTA
-- =============================================================================
create or replace function public.create_kabupaten_kota(
  p_provinsi_id uuid,
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
  v_provinsi public.provinsi%rowtype;
  v_new public.kabupaten_kota%rowtype;
begin
  -- Authorization: sys_admin only
  select raw_app_meta_data ->> 'role' into v_role
  from auth.users where id = p_actor_id;
  
  if v_role is distinct from 'sys_admin' then
    raise exception using errcode = '42501', 
      message = 'Hanya Sysadmin yang dapat membuat Kabupaten/Kota.';
  end if;
  
  -- Validate parent exists
  select * into v_provinsi from public.provinsi where id = p_provinsi_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Provinsi tidak ditemukan.';
  end if;
  
  -- Validation
  if p_nama is null or trim(p_nama) = '' then
    raise exception using errcode = '22001', message = 'Nama Kabupaten/Kota wajib diisi.';
  end if;
  
  if char_length(trim(p_nama)) > 120 then
    raise exception using errcode = '22001', message = 'Nama Kabupaten/Kota maksimal 120 karakter.';
  end if;
  
  -- Insert with kode_bps = NULL
  insert into public.kabupaten_kota (provinsi_id, kode_bps, nama, tipe)
  values (p_provinsi_id, null, trim(p_nama), p_tipe)
  returning * into v_new;
  
  return v_new;
end;
$fn$;

-- =============================================================================
-- 3. CREATE KECAMATAN
-- =============================================================================
create or replace function public.create_kecamatan(
  p_kabupaten_kota_id uuid,
  p_nama text,
  p_actor_id uuid
) returns public.kecamatan
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $fn$
declare
  v_role text;
  v_kab public.kabupaten_kota%rowtype;
  v_new public.kecamatan%rowtype;
begin
  -- Authorization: sys_admin only
  select raw_app_meta_data ->> 'role' into v_role
  from auth.users where id = p_actor_id;
  
  if v_role is distinct from 'sys_admin' then
    raise exception using errcode = '42501', 
      message = 'Hanya Sysadmin yang dapat membuat Kecamatan.';
  end if;
  
  -- Validate parent exists
  select * into v_kab from public.kabupaten_kota where id = p_kabupaten_kota_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Kabupaten/Kota tidak ditemukan.';
  end if;
  
  -- Validation
  if p_nama is null or trim(p_nama) = '' then
    raise exception using errcode = '22001', message = 'Nama Kecamatan wajib diisi.';
  end if;
  
  if char_length(trim(p_nama)) > 120 then
    raise exception using errcode = '22001', message = 'Nama Kecamatan maksimal 120 karakter.';
  end if;
  
  -- Insert with kode_bps = NULL (varchar(7) already fixed)
  insert into public.kecamatan (kabupaten_kota_id, kode_bps, nama)
  values (p_kabupaten_kota_id, null, trim(p_nama))
  returning * into v_new;
  
  return v_new;
end;
$fn$;

-- =============================================================================
-- 4. CREATE DESA
-- =============================================================================
create or replace function public.create_desa(
  p_kabupaten_kota_id uuid,
  p_kecamatan_id uuid,
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
  v_kab public.kabupaten_kota%rowtype;
  v_kec public.kecamatan%rowtype;
  v_new public.desa%rowtype;
begin
  -- Authorization: sys_admin only
  select raw_app_meta_data ->> 'role' into v_role
  from auth.users where id = p_actor_id;
  
  if v_role is distinct from 'sys_admin' then
    raise exception using errcode = '42501', 
      message = 'Hanya Sysadmin yang dapat membuat Desa/Kelurahan.';
  end if;
  
  -- Validate parent Kabupaten/Kota exists
  select * into v_kab from public.kabupaten_kota where id = p_kabupaten_kota_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Kabupaten/Kota tidak ditemukan.';
  end if;
  
  -- Validate parent Kecamatan exists
  select * into v_kec from public.kecamatan where id = p_kecamatan_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Kecamatan tidak ditemukan.';
  end if;
  
  -- Validate Kecamatan belongs to Kabupaten/Kota
  if v_kec.kabupaten_kota_id <> p_kabupaten_kota_id then
    raise exception using errcode = '22003', message = 'Kecamatan tidak berada di Kabupaten/Kota ini.';
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
  
  -- Insert with kode_bps = NULL
  insert into public.desa (kabupaten_kota_id, kecamatan_id, kode_bps, nama, kode_pos)
  values (p_kabupaten_kota_id, p_kecamatan_id, null, trim(p_nama), nullif(trim(p_kode_pos), ''))
  returning * into v_new;
  
  return v_new;
end;
$fn$;

-- =============================================================================
-- GRANTS: SECURITY DEFINER functions executable only by service_role
-- =============================================================================
revoke all on function public.create_provinsi(text, uuid) from public, anon, authenticated;
grant execute on function public.create_provinsi(text, uuid) to service_role;

revoke all on function public.create_kabupaten_kota(uuid, text, kabupaten_kota_tipe, uuid) from public, anon, authenticated;
grant execute on function public.create_kabupaten_kota(uuid, text, kabupaten_kota_tipe, uuid) to service_role;

revoke all on function public.create_kecamatan(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.create_kecamatan(uuid, text, uuid) to service_role;

revoke all on function public.create_desa(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_desa(uuid, uuid, text, text, uuid) to service_role;