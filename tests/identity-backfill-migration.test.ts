import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const migrationsDir = resolve(process.cwd(), "supabase/migrations");

const MIGRATION_NAME = "20260920000000_backfill_identity_mirror.sql";
const V14_NAME = "20260917000000_create_consignment_domain_v14.sql";
const LAST_BEFORE_NAME = "20260919000001_fix_receive_mitra_shipment_stock_column.sql";
const NEW_LAST_NAME = "20260921000000_create_outlet_visit_schedule.sql";

function readMigration(): string {
  return readFileSync(join(migrationsDir, MIGRATION_NAME), "utf8").replace(/\r\n/g, "\n");
}

function readV14(): string {
  return readFileSync(join(migrationsDir, V14_NAME), "utf8").replace(/\r\n/g, "\n");
}

function listMigrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

describe("Identity mirror backfill migration (TEST 1-9 invariants)", () => {
  it("TEST 1 keeps the migration forward-ordered after the last applied migration and v14", () => {
    const files = listMigrationFiles();
    const index = files.indexOf(MIGRATION_NAME);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeGreaterThan(files.indexOf(LAST_BEFORE_NAME));
    expect(index).toBeGreaterThan(files.indexOf(V14_NAME));
    expect(index).toBeLessThan(files.indexOf(NEW_LAST_NAME));
  });

  it("TEST 2 is re-runnable: every INSERT into the mirror tables uses ON CONFLICT DO NOTHING", () => {
    const sql = readMigration();
    const insertBlocks = [...sql.matchAll(/insert into public\.(distributors|users)\b[\s\S]*?;/g)].map((m) => m[0]);
    expect(insertBlocks.length).toBe(2);
    for (const block of insertBlocks) {
      expect(block).toMatch(/on conflict \(id\) do nothing/);
    }
  });

  it("TEST 3 inserts DISTRIBUTORS for role='distributor' identities only (tenant roots)", () => {
    const sql = readMigration();
    const distributorBlock = sql.split(/insert into public\.(?:distributors|users)\b/)[1];
    expect(distributorBlock).toContain(`u.raw_app_meta_data ->> 'role' = 'distributor'`);
    expect(distributorBlock).toMatch(/from auth\.users u/);
  });

  it("TEST 4 covers every public.user_role enum value with the approved metadata->enum mapping", () => {
    const sql = readMigration();
    const enumValue = readV14().match(/create type public\.user_role as enum \(([^)]+)\)/)?.[1] ?? "";
    const enumMembers = enumValue.split(",").map((v) => v.trim().replace(/'/g, ""));
    expect(enumMembers).toContain("DISTRIBUTOR");
    expect(enumMembers).toContain("PLATFORM_SYS_ADMIN");

    const mapping: [string, string][] = [
      ["distributor", "DISTRIBUTOR"],
      ["admin", "ADMIN"],
      ["sales_motoris", "SALES_MOTORIS"],
      ["hrd", "HRD"],
      ["supervisor", "SUPERVISOR"],
      ["mitra_umkm", "MITRA_UMKM"],
      ["sys_admin", "PLATFORM_SYS_ADMIN"],
    ];
    for (const [metadataRole, enumRole] of mapping) {
      expect(sql).toContain(`when '${metadataRole}' then '${enumRole}'::public.user_role`);
    }
  });

  it("TEST 5 maps distributor_id by role: self for distributor, NULL for sys_admin, JWT metadata otherwise", () => {
    const sql = readMigration();
    expect(sql).toContain(`when u.raw_app_meta_data ->> 'role' = 'distributor' then u.id`);
    expect(sql).toContain(`when u.raw_app_meta_data ->> 'role' = 'sys_admin' then null`);
    expect(sql).toMatch(/u\.raw_app_meta_data ->> 'distributor_id'/);
  });

  it("TEST 6 mirrors is_active from app_metadata.status and name from full_name/email fallback", () => {
    const sql = readMigration();
    expect(sql).toContain(`coalesce(u.raw_app_meta_data ->> 'status', 'active') <> 'disabled'`);
    expect(sql).toContain(`u.raw_user_meta_data ->> 'full_name'`);
    expect(sql).toMatch(/coalesce\(/);
  });

  it("TEST 7 does NOT modify auth.users, create triggers, rename roles, or seed credentials", () => {
    const sql = readMigration();
    expect(sql).not.toMatch(/insert\s+into\s+auth\.users/i);
    expect(sql).not.toMatch(/update\s+auth\.users/i);
    expect(sql).not.toMatch(/delete\s+from\s+auth\.users/i);
    expect(sql).not.toMatch(/create\s+trigger/i);
    expect(sql).not.toMatch(/alter\s+table\s+auth\.users/i);
    expect(sql).not.toMatch(/rename/i);
    expect(sql).not.toMatch(/encrypted_password/i);
  });

  it("TEST 8 does not change geography/domain schema and touches no other tables than the two mirrors", () => {
    const sql = readMigration();
    const writeTargets = [...sql.matchAll(/insert into public\.(\w+)/g)].map((m) => m[1]);
    expect(writeTargets.sort()).toEqual(["distributors", "users"]);
    expect(sql).not.toMatch(/wilayah|rute|outlet|geo|provinsi|kabupaten|desa/i);
  });

  it("TEST 9 enforces FK ordering: distributors are written before users (distributor self FK)", () => {
    const sql = readMigration();
    const distributorAt = sql.indexOf("insert into public.distributors");
    const usersAt = sql.indexOf("insert into public.users");
    expect(distributorAt).toBeGreaterThan(-1);
    expect(usersAt).toBeGreaterThan(distributorAt);
  });
});