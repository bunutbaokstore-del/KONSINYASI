-- Fix Kecamatan kode_bps length from 6 to 7 digits
-- BPS Master File Desa uses 7-digit Kecamatan codes

ALTER TABLE public.kecamatan
ALTER COLUMN kode_bps TYPE varchar(7);