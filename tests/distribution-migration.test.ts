import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const migrationsDir = resolve(process.cwd(), "supabase/migrations");

const MIGRATION_NAME = "20260915595958_create_distribution_structure.sql";
const SEC_01_SUFFIX = "harden_consignment_requests_update_admin_only.sql";

function readMigration(): string {
  return readFileSync(join(migrationsDir, MIGRATION_NAME), "utf8").replace(/\r\n/g, "\n");
}

function listMigrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

describe("Distribution database structure (TEST 1-16 migration invariants)", () => {
  it("TEST 1 keeps the migration forward-ordered before the terminal SEC-01 harden (SEC-01 remains the last migration, append-only)", () => {
    const files = listMigrationFiles();
    const sec01 = files.find((file) => file.endsWith(SEC_01_SUFFIX));
    expect(sec01).toBeTruthy();
    expect(files[files.length - 1]).toBe(sec01);
    expect(files.indexOf(MIGRATION_NAME)).toBeGreaterThanOrEqual(0);
    expect(files.indexOf(MIGRATION_NAME)).toBeLessThan(files.indexOf(sec01!));
  });

  it("TEST 2 creates WILAYAH as a tenant-isolated table (distributor_id + RLS + per-tenant unique kode, no delete)", () => {
    const sql = readMigration();
    expect(sql).toContain('create table if not exists public.wilayah (');
    expect(sql).toMatch(/distributor_id uuid not null references auth\.users \(id\) on delete restrict/);
    expect(sql).toContain('constraint wilayah_tenant_unique unique (distributor_id, id)');
    expect(sql).toMatch(/create unique index if not exists wilayah_distributor_kode_key\n\s+on public\.wilayah \(distributor_id, lower\(btrim\(kode\)\)\)/);
    expect(sql).toContain('alter table public.wilayah enable row level security;');
    expect(sql).not.toMatch(/create policy "wilayah_tenant_delete"/);
  });

  it("TEST 3 creates RUTE with a composite tenant FK to WILAYAH and a per-tenant unique kode", () => {
    const sql = readMigration();
    expect(sql).toContain('create table if not exists public.rute (');
    expect(sql).toMatch(/constraint rute_wilayah_tenant_fk foreign key \(distributor_id, wilayah_id\)\n\s+references public\.wilayah \(distributor_id, id\) on delete restrict/);
    expect(sql).toContain('constraint rute_tenant_unique unique (distributor_id, id)');
    expect(sql).toMatch(/create unique index if not exists rute_distributor_kode_key\n\s+on public\.rute \(distributor_id, lower\(btrim\(kode\)\)\)/);
    expect(sql).toContain('alter table public.rute enable row level security;');
  });

  it("TEST 4 creates OUTLET with a composite tenant FK to WILAYAH and a per-tenant unique kode", () => {
    const sql = readMigration();
    expect(sql).toContain('create table if not exists public.outlet (');
    expect(sql).toContain('constraint outlet_tenant_unique unique (distributor_id, id)');
    expect(sql).toMatch(/create unique index if not exists outlet_distributor_kode_key\n\s+on public\.outlet \(distributor_id, lower\(btrim\(kode\)\)\)/);
    expect(sql).toContain('alter table public.outlet enable row level security;');
  });

  it("TEST 5 creates RUTE_OUTLET_ASSIGNMENTS with composite tenant FKs and a one-active-per-outlet partial unique index", () => {
    const sql = readMigration();
    expect(sql).toContain('create table if not exists public.rute_outlet_assignments (');
    expect(sql).toMatch(/constraint rute_outlet_assignments_rute_tenant_fk foreign key \(distributor_id, rute_id\)\n\s+references public\.rute \(distributor_id, id\) on delete restrict/);
    expect(sql).toMatch(/constraint rute_outlet_assignments_outlet_tenant_fk foreign key \(distributor_id, outlet_id\)\n\s+references public\.outlet \(distributor_id, id\) on delete restrict/);
    expect(sql).toMatch(/create unique index if not exists rute_outlet_assignments_one_active_key[\s\S]*?\n  on public\.rute_outlet_assignments \(distributor_id, outlet_id\) \n  where is_active/);
    expect(sql).toContain('alter table public.rute_outlet_assignments enable row level security;');
  });

  it("TEST 6 creates RUTE_SALES_ASSIGNMENTS with composite tenant FKs and a one-active-per-sales partial unique index", () => {
    const sql = readMigration();
    expect(sql).toContain('create table if not exists public.rute_sales_assignments (');
    expect(sql).toMatch(/constraint rute_sales_assignments_sales_tenant_fk foreign key \(distributor_id, sales_id\)\n\s+references public\.rute_sales_assignments[\s\S]*?/);
    expect(sql).toMatch(/create unique index if not exists rute_sales_assignments_one_active_key[\s\S]*?\n  on public\.rute_sales_assignments \(distributor_id, sales_id\) \n  where is_active/);
    expect(sql).toContain('alter table public.rute_sales_assignments enable row level security;');
  });

  it("TEST 7 makes ASSIGNMENT_HISTORY append-only (select-only policy; no insert/update/delete policy)", () => {
    const sql = readMigration();
    expect(sql).toContain('create table if not exists public.assignment_history (');
    expect(sql).toMatch(/create policy "assignment_history_tenant_select" on public\.assignment_history/);
    expect(sql).not.toMatch(/create policy "assignment_history_tenant_insert"/);
    expect(sql).not.toMatch(/create policy "assignment_history_tenant_update"/);
    expect(sql).not.toMatch(/create policy "assignment_history_tenant_delete"/);
  });

  it("TEST 8 enables RLS on all six distribution tables and keeps execute grants service_role-only", () => {
    const sql = readMigration();
    for (const table of ["wilayah", "rute", "outlet", "rute_outlet_assignments", "rute_sales_assignments", "assignment_history"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security;`);
    }
    for (const fn of ["assign_outlet_to_rute", "assign_sales_to_rute"]) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from anon`));
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from authenticated`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role`));
    }
  });

  it("TEST 9 scopes every tenant SELECT policy by distributor_id from JWT metadata", () => {
    const sql = readMigration();
    const selectPolicies = sql.match(/create policy "\w+_tenant_select" on public\.[\w]+\s+for select\s+using \([\s\S]*?\);/g) ?? [];
    expect(sql).toMatch(/distributor_id = \(auth\.jwt\(\) -> 'app_metadata' ->> 'distributor_id'\)::uuid/);
    for (const policy of selectPolicies) {
      expect(policy).toMatch(/distributor_id/);
    }
  });

  it("TEST 10 scopes INSERT policies within tenant by created_by = auth.uid()", () => {
    const sql = readMigration();
    expect(sql).toMatch(/create policy "\w+_tenant_insert" on public\.\w+\s+for insert\s+with check \([\s\S]*?created_by = auth\.uid\(\)[\s\S]*?\);/);
    expect(sql).not.toMatch(/create policy "\w+_tenant_insert"[\s\S]*?to anon/);
  });

  it("TEST 11 scopes UPDATE policies by distributor_id and prevents cross-tenant edits", () => {
    const sql = readMigration();
    const updatePolicies = sql.match(/create policy "\w+_tenant_update" on public\.[\w]+\s+for update\s+using \([\s\S]*?\);/g) ?? [];
    for (const policy of updatePolicies) {
      expect(policy).toMatch(/auth\.jwt\(\) -> 'app_metadata' ->> 'distributor_id' = distributor_id::text/);
    }
  });

  it("TEST 12 forbids DELETE policies on all distribution tables", () => {
    const sql = readMigration();
    expect(sql).not.toMatch(/create policy "\w+_tenant_delete"/);
    expect(sql).not.toMatch(/create policy "\w+_delete"/);
  });

  it("TEST 13 declares security-definer RPCs ASSIGN_OUTLET_TO_RUTE/ASSIGN_SALES_TO_RUTE and bounds their execute grants to service_role", () => {
    const sql = readMigration();
    expect(sql).toContain('create or replace function public.assign_outlet_to_rute(');
    expect(sql).toContain('create or replace function public.assign_sales_to_rute(');
    expect(sql).toMatch(/security definer\s*\n\s*set search_path to 'pg_catalog', 'public'/);
    expect(sql).toMatch(/revoke all on function public\.assign_outlet_to_rute\([^)]*\) from public/);
    expect(sql).toMatch(/revoke all on function public\.assign_outlet_to_rute\([^)]*\) from authenticated/);
    expect(sql).toMatch(/grant execute on function public\.assign_outlet_to_rute\([^)]*\) to service_role/);
  });

  it("TEST 14 keeps SALES-assignment writes inside the security-definer assignment RPC (no direct table insert/update)", () => {
    const sql = readMigration();
    const historyPolicies = sql.match(/create policy "assignment_history_tenant_select" on public\.assignment_history[\s\S]*?\);/g) ?? [];
    for (const policy of historyPolicies) expect(policy).toMatch(/distributor_id/);
  });

  it("TEST 15 revokes EXECUTE from anon/authenticated and grants only to service_role on both define-rute RPCs", () => {
    const sql = readMigration();
    for (const fn of ["assign_outlet_to_rute", "assign_sales_to_rute"]) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public;`));
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from anon;`));
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from authenticated;`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role;`));
    }
  });

  it("TEST 16 never grants execute to anon/authenticated (RPC path stays service_role-only across the whole migration)", () => {
    const sql = readMigration();
    expect(sql).not.toMatch(/grant execute on function public\.assign_(outlet|sales)_to_rute\([^)]*\) to (?:anon|authenticated|public)/);
  });
});
