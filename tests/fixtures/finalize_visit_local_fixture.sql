-- =============================================================================
-- LOCAL TEST FIXTURE ONLY
-- DO NOT RUN AGAINST PRODUCTION
-- 
-- Fixture for LOCAL integration test of public.finalize_visit(uuid, uuid)
-- Run AFTER: npx supabase db reset
-- Target: LOCAL database only (uses fixed UUIDs for key entities;
-- some auxiliary IDs use gen_random_uuid() as they are not referenced)
-- =============================================================================

-- =============================================================================
-- UUID REFERENCE
-- =============================================================================
-- distributor UUID (Tenant A):     11111111-1111-4111-8111-111111111111
-- sys_admin UUID (active):         dddddddd-dddd-dddd-dddd-dddddddddddd
-- admin UUID:                      aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- sales_motoris UUID:              bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
-- product UUID:                    aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
-- outlet UUID:                     77777777-8888-9999-aaaa-bbbbbbbbbbbb
-- rute UUID:                       88888888-9999-aaaa-bbbb-cccccccccccc
-- wilayah UUID:                    99999999-aaaa-bbbb-cccc-dddddddddddd
-- visit UUID:                      00000001-0000-0000-0000-000000000001
-- card UUID:                       cccccccc-cccc-cccc-cccc-cccccccccccc
-- =============================================================================

-- =============================================================================
-- 1. AUTH.USERS (simulated via direct INSERT - local testing workaround)
-- =============================================================================
INSERT INTO auth.users (
    id, 
    raw_app_meta_data, 
    encrypted_password, 
    email_confirmed_at, 
    created_at, 
    updated_at, 
    role, 
    aud
) VALUES
-- Tenant A Distributor (also acts as distributor role)
('11111111-1111-4111-8111-111111111111',
 '{"role": "distributor", "distributor_id": "11111111-1111-4111-8111-111111111111"}',
 'dummy', now(), now(), now(), 'authenticated', 'authenticated'),

-- Tenant A Admin
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
 '{"role": "admin", "distributor_id": "11111111-1111-4111-8111-111111111111"}',
 'dummy', now(), now(), now(), 'authenticated', 'authenticated'),

-- Tenant A Sales Motoris
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
 '{"role": "sales_motoris", "distributor_id": "11111111-1111-4111-8111-111111111111"}',
 'dummy', now(), now(), now(), 'authenticated', 'authenticated'),

-- Platform Sys Admin (active)
('dddddddd-dddd-dddd-dddd-dddddddddddd',
 '{"role": "sys_admin"}',
 'dummy', now(), now(), now(), 'authenticated', 'authenticated');

-- =============================================================================
-- 2. PUBLIC.DISTRIBUTORS
-- =============================================================================
INSERT INTO public.distributors (id, name, code, is_active, created_at, updated_at)
VALUES
('11111111-1111-4111-8111-111111111111', 'Tenant A Distributor', 'DIST-A', true, now(), now());

-- =============================================================================
-- 3. PUBLIC.USERS (app profiles)
-- =============================================================================
INSERT INTO public.users (id, distributor_id, name, email, phone, role, is_active, created_at, updated_at)
VALUES
('11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Tenant A Distributor', 'dist-a@test.local', '08111111111', 'DISTRIBUTOR', true, now(), now()),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Admin A', 'admin-a@test.local', '08111111112', 'ADMIN', true, now(), now()),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'Sales Motoris A', 'sales-a@test.local', '08111111113', 'SALES_MOTORIS', true, now(), now()),
('dddddddd-dddd-dddd-dddd-dddddddddddd', NULL, 'Platform SysAdmin Active', 'sysadmin@test.local', '08111111115', 'PLATFORM_SYS_ADMIN', true, now(), now());

-- =============================================================================
-- 4. PUBLIC.PLATFORM_ADMINS (active sys_admin required for cross-tenant)
-- =============================================================================
INSERT INTO public.platform_admins (user_id, status, created_by, created_at, updated_at)
VALUES
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'active', 'dddddddd-dddd-dddd-dddd-dddddddddddd', now(), now());

-- =============================================================================
-- 4. PRODUCTS
-- =============================================================================
INSERT INTO public.products (
    id, distributor_id, created_by_mitra_user_id, sku, name, unit, 
    category, size, selling_price, lifecycle_status, is_active, created_at, updated_at
) VALUES
('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 
 '11111111-1111-4111-8111-111111111111', 
 NULL, 
 'SKU-001', 'Produk Test 1', 'PCS', 'KATEGORI-1', 'M', 
 10000.00, 'active', true, now(), now());

-- =============================================================================
-- 5. OUTLETS
-- =============================================================================
INSERT INTO public.outlets (
    id, distributor_id, kode, nama, nama_pemilik, no_hp, alamat,
    latitude, longitude, gps_radius_m, status, foto_depan_url,
    created_by, created_at, updated_at
) VALUES
('77777777-8888-9999-aaaa-bbbbbbbbbbbb', 
 '11111111-1111-4111-8111-111111111111', 
 'OUT-A1', 'Outlet A1', 'Pemilik A1', '081234567890', 'Jl. Test No. 1',
 -6.200000, 106.816666, 100, 'ACTIVE', NULL,
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), now());

-- =============================================================================
-- 5. WILAYAH
-- =============================================================================
INSERT INTO public.wilayah (
    id, distributor_id, kode, nama, keterangan, is_active, created_by, created_at, updated_at
) VALUES
('99999999-aaaa-bbbb-cccc-dddddddddddd', 
 '11111111-1111-4111-8111-111111111111', 
 'WIL-A', 'Wilayah A', 'Wilayah A', true, 
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), now());

-- =============================================================================
-- 6. RUTE
-- =============================================================================
INSERT INTO public.rute (
    id, distributor_id, wilayah_id, kode, nama, keterangan, is_active, created_by, created_at, updated_at
) VALUES
('88888888-9999-aaaa-bbbb-cccccccccccc', 
 '11111111-1111-4111-8111-111111111111', 
 '99999999-aaaa-bbbb-cccc-dddddddddddd', 
 'RUTE-A1', 'Rute A1', 'Rute A1', true, 
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), now());

-- =============================================================================
-- 7. RUTE_SALES_ASSIGNMENTS (active assignment for sales)
-- =============================================================================
INSERT INTO public.rute_sales_assignments (
    id, distributor_id, rute_id, sales_id, assigned_at, ended_at, assigned_by, created_at
) VALUES
(gen_random_uuid(), 
 '11111111-1111-4111-8111-111111111111', 
 '88888888-9999-aaaa-bbbb-cccccccccccc', 
 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 
 now(), NULL, 
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now());

-- =============================================================================
-- 7b. RUTE_OUTLET_ASSIGNMENTS
-- =============================================================================
INSERT INTO public.rute_outlet_assignments (
    id, distributor_id, rute_id, outlet_id, assigned_at, ended_at, assigned_by, created_at
) VALUES
(gen_random_uuid(), 
 '11111111-1111-4111-8111-111111111111', 
 '88888888-9999-aaaa-bbbb-cccccccccccc', 
 '77777777-8888-9999-aaaa-bbbbbbbbbbbb', 
 now(), NULL, 
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now());

-- =============================================================================
-- 8. STOCK TABLES
-- =============================================================================

-- SALES_STOCK (pre-seeded for ADD_IN/RESTOCK_IN)
INSERT INTO public.sales_stock (
    id, distributor_id, sales_id, product_id, quantity, updated_at
) VALUES
(gen_random_uuid(), 
 '11111111-1111-4111-8111-111111111111', 
 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 
 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 
 100, now());

-- OUTLET_STOCK (pre-seeded for LUNAS TOKO_BARU - MILIK_OUTLET ownership)
INSERT INTO public.outlet_stock (
    id, distributor_id, outlet_id, product_id, quantity, ownership_type, updated_at
) VALUES
(gen_random_uuid(), 
 '11111111-1111-4111-8111-111111111111', 
 '77777777-8888-9999-aaaa-bbbbbbbbbbbb', 
 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 
 100, 'MILIK_OUTLET', now());



-- =============================================================================
-- 9. VISITS (status CHECKED_IN)
-- =============================================================================
INSERT INTO public.visits (
    id, distributor_id, outlet_id, sales_id, rute_id, 
    visit_date, status, transaction_status, 
    checkin_at, checkin_latitude, checkin_longitude,
    checkout_at, notes, finalized_at, finalized_by,
    created_at, updated_at
) VALUES
('00000001-0000-0000-0000-000000000001', 
 '11111111-1111-4111-8111-111111111111',
 '77777777-8888-9999-aaaa-bbbbbbbbbbbb',
 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
 '88888888-9999-aaaa-bbbb-cccccccccccc',
 CURRENT_DATE, 
 'CHECKED_IN', 
 'LUNAS', 
 now() - interval '1 hour', 
 -6.200000, 106.816666,
 NULL, NULL, NULL, NULL,
 now(), now());

-- =============================================================================
-- 10. VISIT_PRODUCT_CARDS
-- =============================================================================
-- Scenario: LUNAS TOKO_BARU (simplest - only ADD_IN and SALES_OUT, MILIK_OUTLET ownership)
-- stock_before=0, add_qty=10, sales_qty=10, restock_qty=0, return_qty=0
-- ownership: MILIK_OUTLET for both ADD_IN and SALES_OUT
INSERT INTO public.visit_product_cards (
    id, visit_id, product_id, status, condition,
    stock_before, physical_check, add_qty, restock_qty, old_sales_qty, 
    sales_qty, return_qty, stock_after,
    selling_price, payment_status, amount_due, amount_paid,
    alasan, created_at, updated_at
) VALUES
('cccccccc-cccc-cccc-cccc-cccccccccccc',
 '00000001-0000-0000-0000-000000000001',
 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
 'DRAFT', 'TOKO_BARU',
 0, 0, 10, 0, 0,
 10, 0, 10,
 10000.00, 'LUNAS', 100000.00, 100000.00,
 NULL, now(), now());

-- =============================================================================
-- 11. VISIT_PHOTOS (required for TOKO_BARU - FOTO_PRODUK)
-- =============================================================================
INSERT INTO public.visit_photos (id, visit_id, card_id, photo_type, photo_url, created_by, created_at)
VALUES
(gen_random_uuid(), 
 '00000001-0000-0000-0000-000000000001', 
 'cccccccc-cccc-cccc-cccc-cccccccccccc',
 'FOTO_PRODUK', 
 'https://test.local/foto_produk.jpg', 
 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now());

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
-- Run these after fixture to verify data integrity

-- Check all FK relationships
SELECT 'FK Check - visits' as check_name, 
       v.id, v.distributor_id, v.outlet_id, v.sales_id, v.rute_id, v.status
FROM public.visits v
WHERE v.id = '00000001-0000-0000-0000-000000000001';

SELECT 'FK Check - visit_product_cards' as check_name,
       c.id, c.visit_id, c.product_id, c.condition, c.status
FROM public.visit_product_cards c
WHERE c.visit_id = '00000001-0000-0000-0000-000000000001';

SELECT 'FK Check - rute_sales_assignments' as check_name,
       rsa.id, rsa.distributor_id, rsa.rute_id, rsa.sales_id, rsa.ended_at
FROM public.rute_sales_assignments rsa
WHERE rsa.sales_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  AND rsa.distributor_id = '11111111-1111-4111-8111-111111111111'
  AND rsa.ended_at IS NULL;

SELECT 'FK Check - rute_outlet_assignments' as check_name,
       roa.id, roa.distributor_id, roa.rute_id, roa.outlet_id, roa.ended_at
FROM public.rute_outlet_assignments roa
WHERE roa.outlet_id = '77777777-8888-9999-aaaa-bbbbbbbbbbbb'
  AND roa.distributor_id = '11111111-1111-4111-8111-111111111111'
  AND roa.ended_at IS NULL;

SELECT 'FK Check - sales_stock' as check_name,
       ss.id, ss.distributor_id, ss.sales_id, ss.product_id, ss.quantity
FROM public.sales_stock ss
WHERE ss.sales_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  AND ss.product_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

SELECT 'FK Check - outlet_stock' as check_name,
       os.id, os.distributor_id, os.outlet_id, os.product_id, os.quantity, os.ownership_type
FROM public.outlet_stock os
WHERE os.outlet_id = '77777777-8888-9999-aaaa-bbbbbbbbbbbb'
  AND os.product_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

SELECT 'Check - platform_admins' as check_name,
       pa.user_id, pa.status
FROM public.platform_admins pa
WHERE pa.user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

SELECT 'Check - auth.users raw_app_meta_data' as check_name,
       u.id, u.raw_app_meta_data
FROM auth.users u
WHERE u.id IN (
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'dddddddd-dddd-dddd-dddd-dddddddddddd'
);

-- Verify enums
SELECT 'Enum check - visit_status' as check_name, v.status
FROM public.visits v WHERE v.id = '00000001-0000-0000-0000-000000000001';

SELECT 'Enum check - visit_condition' as check_name, c.condition
FROM public.visit_product_cards c WHERE c.id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

SELECT 'Enum check - transaction_status' as check_name, v.transaction_status
FROM public.visits v WHERE v.id = '00000001-0000-0000-0000-000000000001';

SELECT 'Enum check - card_status' as check_name, c.status
FROM public.visit_product_cards c WHERE c.id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

SELECT 'Enum check - payment_status' as check_name, c.payment_status
FROM public.visit_product_cards c WHERE c.id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

SELECT 'Enum check - ownership_type' as check_name, os.ownership_type
FROM public.outlet_stock os
WHERE os.outlet_id = '77777777-8888-9999-aaaa-bbbbbbbbbbbb'
  AND os.product_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

SELECT 'Enum check - visit_status' as check_name, unnest(enum_range(NULL::visit_status)) as valid_status;
SELECT 'Enum check - visit_condition' as check_name, unnest(enum_range(NULL::visit_condition)) as valid_condition;
SELECT 'Enum check - transaction_status' as check_name, unnest(enum_range(NULL::transaction_status)) as valid_txn_status;
SELECT 'Enum check - card_status' as check_name, unnest(enum_range(NULL::card_status)) as valid_card_status;
SELECT 'Enum check - payment_status' as check_name, unnest(enum_range(NULL::payment_status)) as valid_payment_status;
SELECT 'Enum check - ownership_type' as check_name, unnest(enum_range(NULL::ownership_type)) as valid_ownership_type;