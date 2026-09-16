-- =============================================================================
-- LOCAL TEST FIXTURE ONLY
-- DO NOT RUN AGAINST PRODUCTION
-- 
-- Authorization test fixture for public.finalize_visit(uuid, uuid)
-- Run AFTER: npx supabase db reset AND finalize_visit_local_fixture.sql
-- Target: LOCAL database only (uses fixed UUIDs for key entities;
-- some auxiliary IDs use gen_random_uuid() as they are not referenced)
-- =============================================================================

-- =============================================================================
-- UUID REFERENCE (EXTENDS base fixture - ALL NEW UUIDs to avoid collisions)
-- =============================================================================
-- Base fixture UUIDs (DO NOT REUSE):
-- distributor UUID (Tenant A):     11111111-1111-4111-8111-111111111111
-- sys_admin UUID (active):         dddddddd-dddd-dddd-dddd-dddddddddddd
-- admin UUID (Tenant A):           aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- sales_motoris UUID (A1):         bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
-- product UUID:                    aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
-- outlet UUID (A1):                77777777-8888-9999-aaaa-bbbbbbbbbbbb
-- rute UUID (A):                   88888888-9999-aaaa-bbbb-cccccccccccc
-- wilayah UUID (A):                99999999-aaaa-bbbb-cccc-dddddddddddd
-- visit UUID (T01):                00000001-0000-0000-0000-000000000001
-- card UUID (T01):                 cccccccc-cccc-cccc-cccc-cccccccccccc
-- mitra_umkm UUID (base):          ffffffff-ffff-ffff-ffff-ffffffffffff
-- admin UUID (Tenant A):           aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- sys_admin UUID (active):         dddddddd-dddd-dddd-dddd-dddddddddddd

-- NEW UUIDs for authorization tests (ALL UNIQUE, no collision with base):
-- distributor UUID (Tenant B):     f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0  (same as admin_b)
-- admin UUID (Tenant B):           f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0
-- sales_motoris UUID (A2):         12121212-1212-1212-1212-121212121212
-- sales_motoris UUID (A3):         14141414-1414-1414-1414-141414141414
-- mitra_umkm UUID:                 13131313-1313-1313-1313-131313131313
-- sys_admin UUID (inactive):       eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee
-- product UUID (same):             aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
-- outlet UUID (A2):                99999999-9999-9999-9999-999999999999
-- outlet UUID (Tenant B):          88888888-8888-8888-8888-888888888888
-- rute UUID (Tenant B):            b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0
-- wilayah UUID (Tenant B):         c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0
-- visit UUID (T02):                00000002-0000-0000-0000-000000000002
-- visit UUID (Tenant B):           00000003-0000-0000-0000-000000000003
-- card UUID (AZ01/AZ03/AZ04):      d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0
-- card UUID (Tenant B):            e0e0e0e0-e0e0-e0e0-e0e0-e0e0e0e0e0e0
-- outlet UUID (Tenant B):          88888888-8888-8888-8888-888888888888
-- rute UUID (Tenant B):            b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0
-- wilayah UUID (Tenant B):         c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0
-- =============================================================================

-- =============================================================================
-- 1. AUTH.USERS (additional actors for negative tests)
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
-- Tenant B Admin
('f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0',
 '{"role": "admin", "distributor_id": "f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0"}',
 'dummy', now(), now(), now(), 'authenticated', 'authenticated'),

-- Tenant A Sales Motoris 2 (actor AZ01)
('12121212-1212-1212-1212-121212121212',
 '{"role": "sales_motoris", "distributor_id": "11111111-1111-4111-8111-111111111111"}',
 'dummy', now(), now(), now(), 'authenticated', 'authenticated'),

-- Mitra UMKM (Tenant A)
('13131313-1313-1313-1313-131313131313',
 '{"role": "mitra_umkm", "distributor_id": "11111111-1111-4111-8111-111111111111"}',
 'dummy', now(), now(), now(), 'authenticated', 'authenticated'),

-- Sys Admin Inactive (not in platform_admins)
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
 '{"role": "sys_admin"}',
 'dummy', now(), now(), now(), 'authenticated', 'authenticated'),

-- Sales A3 (owner of T02) - NEW sales user for T02
('14141414-1414-1414-1414-141414141414',
 '{"role": "sales_motoris", "distributor_id": "11111111-1111-4111-8111-111111111111"}',
 'dummy', now(), now(), now(), 'authenticated', 'authenticated');

-- =============================================================================
-- 2. PUBLIC.DISTRIBUTORS (Tenant B)
-- FK: distributors.id -> auth.users(id)
-- Must be inserted AFTER auth.users for the same ID
-- =============================================================================
INSERT INTO public.distributors (id, name, code, is_active, created_at, updated_at)
VALUES
('f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0', 'Tenant B Distributor', 'DIST-B', true, now(), now());

-- =============================================================================
-- 3. PUBLIC.USERS (additional profiles)
-- FK: users.id -> auth.users(id), users.distributor_id -> distributors(id)
-- =============================================================================
INSERT INTO public.users (id, distributor_id, name, email, phone, role, is_active, created_at, updated_at)
VALUES
-- Tenant B Admin
('f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0', 'f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0', 'Admin B', 'admin-b@test.local', '08222222222', 'ADMIN', true, now(), now()),
-- Tenant A Sales Motoris 2 (actor AZ01)
('12121212-1212-1212-1212-121212121212', '11111111-1111-4111-8111-111111111111', 'Sales Motoris A2', 'sales-a2@test.local', '08111111114', 'SALES_MOTORIS', true, now(), now()),
-- Mitra UMKM
('13131313-1313-1313-1313-131313131313', '11111111-1111-4111-8111-111111111111', 'Mitra A', 'mitra-a@test.local', '08111111116', 'MITRA_UMKM', true, now(), now()),
-- Sys Admin Inactive (not in platform_admins)
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', NULL, 'Platform SysAdmin Inactive', 'sysadmin-inactive@test.local', '08111111116', 'PLATFORM_SYS_ADMIN', true, now(), now()),
-- Sales A3 (owner of T02) - NEW sales user for T02
('14141414-1414-1414-1414-141414141414', '11111111-1111-4111-8111-111111111111', 'Sales Motoris A3', 'sales-a3@test.local', '08111111117', 'SALES_MOTORIS', true, now(), now());

-- =============================================================================
-- 2. PUBLIC.PLATFORM_ADMINS (only active sys_admin from base fixture)
-- =============================================================================
-- Already has active sys_admin from base fixture (dddddddd-dddd-dddd-dddd-dddddddddddd)
-- Inactive sys_admin (eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee) intentionally NOT inserted

-- =============================================================================
-- 3. OUTLET & RUTE for Tenant B (for tenant isolation test)
-- =============================================================================
-- Minimal Tenant B infrastructure - only what's needed for admin_b to be valid
-- Outlet, wilayah, rute for Tenant B are NOT needed for authorization tests
-- (authorization only checks actor tenant vs visit tenant)

-- =============================================================================
-- RUTE_ASSIGNMENTS for Tenant B (NOT NEEDED for authorization tests)
-- =============================================================================
-- Not needed for authorization tests - removed

-- =============================================================================
-- 3. STOCK for Tenant B (NOT NEEDED for authorization tests)
-- =============================================================================
-- Stock for Tenant B is not needed for authorization tests
-- Authorization only checks actor tenant vs visit tenant
-- Stock is only used during finalize_visit execution, not during authorization

-- =============================================================================
-- 4. VISIT for authorization tests (CHECKED_IN, not finalized)
-- =============================================================================
-- Visit T02: Tenant A, owned by sales_a3 (14141414-...), LUNAS TOKO_BARU
-- Used for: AZ01 (sales_a2 not owner), AZ03 (mitra_umkm), AZ04 (sys_admin inactive)
-- sales_a1 already has T01 (FINALIZED after base test), so T02 can be CHECKED_IN for sales_a3
INSERT INTO public.visits (
    id, distributor_id, outlet_id, sales_id, rute_id, 
    visit_date, status, transaction_status, 
    checkin_at, checkin_latitude, checkin_longitude,
    checkout_at, notes, finalized_at, finalized_by,
    created_at, updated_at
) VALUES
('00000002-0000-0000-0000-000000000002', 
 '11111111-1111-4111-8111-111111111111',
 '77777777-8888-9999-aaaa-bbbbbbbbbbbb',
 '14141414-1414-1414-1414-141414141414',  -- sales_a3 (NEW owner)
 '88888888-9999-aaaa-bbbb-cccccccccccc',
 CURRENT_DATE, 
 'CHECKED_IN', 
 'LUNAS', 
 now() - interval '1 hour', 
 -6.200000, 106.816666,
 NULL, NULL, NULL, NULL,
 now(), now());

-- =============================================================================
-- 5. VISIT_PRODUCT_CARDS
-- =============================================================================
-- Card for Visit T02: LUNAS TOKO_BARU (simplest scenario)
INSERT INTO public.visit_product_cards (
    id, visit_id, product_id, status, condition,
    stock_before, physical_check, add_qty, restock_qty, old_sales_qty, 
    sales_qty, return_qty, stock_after,
    selling_price, payment_status, amount_due, amount_paid,
    alasan, created_at, updated_at
) VALUES
('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0',
 '00000002-0000-0000-0000-000000000002',
 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
 'DRAFT', 'TOKO_BARU',
 0, 0, 10, 0, 0,
 10, 0, 10,
 10000.00, 'LUNAS', 100000.00, 100000.00,
 NULL, now(), now());

-- =============================================================================
-- VISIT_PHOTOS (required for TOKO_BARU - FOTO_PRODUK)
-- =============================================================================
INSERT INTO public.visit_photos (id, visit_id, card_id, photo_type, photo_url, created_by, created_at)
VALUES
(gen_random_uuid(), 
 '00000002-0000-0000-0000-000000000002', 
 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0',
 'FOTO_PRODUK', 
 'https://test.local/foto_produk.jpg', 
 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now());

-- =============================================================================
-- STOCK for Visit T02 (reuse same product)
-- =============================================================================
-- Sales stock for sales_a3 (owner of T02, Tenant A)
INSERT INTO public.sales_stock (
    id, distributor_id, sales_id, product_id, quantity, updated_at
) VALUES
(gen_random_uuid(), 
 '11111111-1111-4111-8111-111111111111', 
 '14141414-1414-1414-1414-141414141414',  -- sales_a3
 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 
 100, now());

-- Sales stock for sales_a2 (actor AZ01, Tenant A)
INSERT INTO public.sales_stock (
    id, distributor_id, sales_id, product_id, quantity, updated_at
) VALUES
(gen_random_uuid(), 
 '11111111-1111-4111-8111-111111111111', 
 '12121212-1212-1212-1212-121212121212',  -- sales_a2
 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 
 100, now());

-- Outlet stock for outlet A1 (same outlet as T01/T02) - MILIK_OUTLET
-- DO NOT INSERT - base fixture already has outlet_stock for outlet A1 + product + MILIK_OUTLET = 100
-- finalize_visit will use the existing row

-- =============================================================================
-- RUTE_ASSIGNMENTS for Tenant A (sales_a3 needs active assignment)
-- =============================================================================
INSERT INTO public.rute_sales_assignments (
    id, distributor_id, rute_id, sales_id, assigned_at, ended_at, assigned_by, created_at
) VALUES
(gen_random_uuid(), 
 '11111111-1111-4111-8111-111111111111', 
 '88888888-9999-aaaa-bbbb-cccccccccccc', 
 '14141414-1414-1414-1414-141414141414',  -- sales_a3
 now(), NULL, 
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now());

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Check all FK relationships for new entities
SELECT 'FK Check - Tenant B distributor' as check_name, 
       d.id, d.name, d.code, d.is_active
FROM public.distributors d
WHERE d.id = 'f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0';

SELECT 'FK Check - Tenant B admin' as check_name,
       u.id, u.distributor_id, u.role, u.is_active
FROM public.users u
WHERE u.id = 'f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0';

SELECT 'FK Check - sales_a2 assignment' as check_name,
       rsa.id, rsa.distributor_id, rsa.rute_id, rsa.sales_id, rsa.ended_at
FROM public.rute_sales_assignments rsa
WHERE rsa.sales_id = '12121212-1212-1212-1212-121212121212'
  AND rsa.distributor_id = '11111111-1111-4111-8111-111111111111'
  AND rsa.ended_at IS NULL;

SELECT 'FK Check - sales_a3 assignment' as check_name,
       rsa.id, rsa.distributor_id, rsa.rute_id, rsa.sales_id, rsa.ended_at
FROM public.rute_sales_assignments rsa
WHERE rsa.sales_id = '14141414-1414-1414-1414-141414141414'
  AND rsa.distributor_id = '11111111-1111-4111-8111-111111111111'
  AND rsa.ended_at IS NULL;

SELECT 'FK Check - Visit T02' as check_name, 
       v.id, v.distributor_id, v.outlet_id, v.sales_id, v.rute_id, v.status, v.transaction_status
FROM public.visits v
WHERE v.id = '00000002-0000-0000-0000-000000000002';

SELECT 'FK Check - Visit T02 card' as check_name,
       c.id, c.visit_id, c.product_id, c.condition, c.status
FROM public.visit_product_cards c
WHERE c.visit_id = '00000002-0000-0000-0000-000000000002';

SELECT 'Check - sys_admin inactive' as check_name,
       u.id, u.raw_app_meta_data
FROM auth.users u
WHERE u.id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

SELECT 'Check - platform_admins (inactive sys_admin NOT present)' as check_name,
       pa.user_id, pa.status
FROM public.platform_admins pa
WHERE pa.user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

-- Verify enums
SELECT 'Enum check - visit_status T02' as check_name, v.status
FROM public.visits v WHERE v.id = '00000002-0000-0000-0000-000000000002';

SELECT 'Enum check - transaction_status T02' as check_name, v.transaction_status
FROM public.visits v WHERE v.id = '00000002-0000-0000-0000-000000000002';

SELECT 'Enum check - visit_condition' as check_name, c.condition
FROM public.visit_product_cards c WHERE c.id = 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0';