-- =============================================================================
-- MAKE MASTER GEOGRAPHY CODES OPTIONAL
-- Make kode_bps nullable on all 4 Master Geography tables
-- Allows SysAdmin to create geography manually without BPS codes
-- =============================================================================

-- 1. PROVINSI: kode_bps varchar(2) -> nullable
ALTER TABLE public.provinsi
ALTER COLUMN kode_bps DROP NOT NULL;

-- 2. KABUPATEN_KOTA: kode_bps varchar(4) -> nullable
ALTER TABLE public.kabupaten_kota
ALTER COLUMN kode_bps DROP NOT NULL;

-- 3. KECAMATAN: kode_bps varchar(7) -> nullable
-- (length already fixed to 7 in 20260926000000)
ALTER TABLE public.kecamatan
ALTER COLUMN kode_bps DROP NOT NULL;

-- 4. DESA: kode_bps varchar(10) -> nullable
ALTER TABLE public.desa
ALTER COLUMN kode_bps DROP NOT NULL;

-- =============================================================================
-- VERIFICATION QUERIES (for manual verification after apply)
-- =============================================================================
-- SELECT column_name, is_nullable, data_type, character_maximum_length
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name IN ('provinsi', 'kabupaten_kota', 'kecamatan', 'desa')
--   AND column_name = 'kode_bps'
-- ORDER BY table_name;

-- Expected after migration:
-- table_name     | column_name | is_nullable | data_type | character_maximum_length
-- ---------------|-------------|-------------|-----------|------------------------
-- provinsi       | kode_bps    | YES         | character varying | 2
-- kabupaten_kota | kode_bps    | YES         | character varying | 4
-- kecamatan      | kode_bps    | YES         | character varying | 7
-- desa           | kode_bps    | YES         | character varying | 10

-- UNIQUE constraints remain intact (PostgreSQL allows multiple NULLs in UNIQUE index)
-- FK constraints remain intact
-- PK constraints remain intact