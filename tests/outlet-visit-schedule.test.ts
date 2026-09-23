import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

function read(relative: string): string {
  return readFileSync(resolve(root, relative), "utf8").replace(/\r\n/g, "\n");
}

const routersSrc = read("server/routers.ts");
const migrationSrc = read("supabase/migrations/20260921000000_create_outlet_visit_schedule.sql");

function sliceProcedure(src: string, name: string, nextName: string): string {
  const start = src.indexOf(`${name}: adminTenantProcedure`);
  const end = src.indexOf(`${nextName}: adminTenantProcedure`);
  return src.slice(start, end);
}

const updateOutlet = sliceProcedure(routersSrc, "updateOutlet", "setOutletActive");
const listOutlet = sliceProcedure(routersSrc, "listOutlet", "createOutlet");

describe("Outlet visit schedule write path (static invariants)", () => {
  it("V1 updateOutlet invokes the deployed RPC bulk_upsert_outlet_visit_schedule when visitDays is provided", () => {
    expect(updateOutlet).toContain('adminClient.rpc("bulk_upsert_outlet_visit_schedule"');
    expect(updateOutlet).toContain("p_outlet_id: input.outletId");
    expect(updateOutlet).toContain("p_days: input.visitDays");
  });

  it("V2 tenant and actor come from the trusted server context, never from client input", () => {
    expect(updateOutlet).toContain("p_distributor_id: distributorId");
    expect(updateOutlet).toContain("p_assigned_by: ctx.supabaseUser!.id");
    expect(updateOutlet).not.toMatch(/p_distributor_id:\s*input\./);
    expect(updateOutlet).not.toMatch(/p_assigned_by:\s*input\./);
  });

  it("V3 empty visitDays is forwarded to the RPC so the schedule is wiped (no client-side skip)", () => {
    const guardIdx = updateOutlet.indexOf("if (input.visitDays !== undefined) {");
    const fetchIdx = updateOutlet.indexOf("const { data: outletData }");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(fetchIdx).toBeGreaterThan(guardIdx);
    const rpcBlock = updateOutlet.slice(guardIdx, fetchIdx);
    expect(rpcBlock).toContain('rpc("bulk_upsert_outlet_visit_schedule"');
    expect(rpcBlock).toContain("p_days: input.visitDays");
    expect(rpcBlock).not.toMatch(/if\s*\(input\.visitDays\.length/);
    expect(migrationSrc).toContain("where array_length(p_days, 1) > 0");
  });

  it("V4 undefined visitDays does not touch the schedule (write guarded by undefined check)", () => {
    const guardIdx = updateOutlet.indexOf("if (input.visitDays !== undefined) {");
    const fetchIdx = updateOutlet.indexOf("const { data: outletData }");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(fetchIdx).toBeGreaterThan(guardIdx);
    const rpcCall = 'rpc("bulk_upsert_outlet_visit_schedule"';
    expect(updateOutlet.split(rpcCall).length - 1).toBe(1);
    const rpcIdx = updateOutlet.indexOf(rpcCall);
    expect(rpcIdx).toBeGreaterThan(guardIdx);
    expect(rpcIdx).toBeLessThan(fetchIdx);
    expect(updateOutlet).toMatch(/hasVisitDays\s*=\s*input\.visitDays !== undefined/);
  });

  it("V5 RPC errors are mapped through rpcFailure (42501 FORBIDDEN, P0002 NOT_FOUND, 23505 CONFLICT)", () => {
    expect(updateOutlet).toContain("if (rpcError) rpcFailure(rpcError);");
    const rpcFailureBlock = routersSrc.slice(routersSrc.indexOf("function rpcFailure("), routersSrc.indexOf("function generateOutletKode("));
    expect(rpcFailureBlock).toContain('code === "42501"');
    expect(rpcFailureBlock).toContain('code === "P0002"');
    expect(rpcFailureBlock).toContain('code === "23505"');
  });

  it("V6 updateOutlet stays admin-only via adminTenantProcedure and requires a tenant workspace", () => {
    expect(updateOutlet.startsWith("updateOutlet: adminTenantProcedure.mutation"));
    expect(updateOutlet).toContain("const distributorId = getDistributorId(ctx.supabaseUser)");
    expect(updateOutlet).toContain('code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan."');
  });

  it("V7 visitDays-only requests are accepted (no BAD_REQUEST when only visitDays changes)", () => {
    expect(updateOutlet).toMatch(/!hasOutletData && !hasDesaId && !hasVisitDays/);
    expect(updateOutlet).not.toMatch(/!hasOutletData && !hasDesaId\)/);
  });

  it("V8 read-after-write: the returned record uses the persisted schedule, not a hardcoded empty list", () => {
    expect(updateOutlet).toContain("let scheduleDays: DayOfWeek[] = [];");
    expect(updateOutlet).toContain("toOutletRecord(outletData!, null, null, scheduleDays, desaInfo)");
    expect(updateOutlet).not.toContain("toOutletRecord(outletData!, null, null, [], desaInfo)");
  });

  it("V9 listOutlet reads schedule rows from outlet_visit_schedule and forwards them to the outlet record", () => {
    expect(listOutlet).toContain('.from("outlet_visit_schedule")');
    expect(listOutlet).toContain('select("outlet_id, day_of_week")');
    expect(listOutlet).toContain("visitDaysByOutlet.get(outlet.id) ?? []");
  });

  it("V10 createOutlet does NOT accept visitDays (out of scope for this checkpoint)", () => {
    const createOutlet = sliceProcedure(routersSrc, "createOutlet", "updateOutlet");
    expect(createOutlet).not.toMatch(/visitDays/);
  });
});