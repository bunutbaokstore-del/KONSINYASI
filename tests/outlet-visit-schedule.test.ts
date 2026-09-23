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
const createOutlet = sliceProcedure(routersSrc, "createOutlet", "updateOutlet");
const setOutletActive = sliceProcedure(routersSrc, "setOutletActive", "uploadOutletPhoto");
const createOutletInputType = routersSrc.slice(routersSrc.indexOf("type CreateOutletInput = {"), routersSrc.indexOf("async function createOutletForTenant("));
const createOutletFn = routersSrc.slice(routersSrc.indexOf("async function createOutletForTenant("), routersSrc.indexOf("async function assignOutletToRute("));

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

  it("V10 createOutlet schema accepts optional visitDays (create flow), preserving all existing required fields", () => {
    expect(createOutlet).toMatch(/visitDays: z\.array\(z\.enum\(\["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"\]\)\)\.optional\(\)/);
    expect(createOutlet).toContain("nama: z.string().trim().min(2");
    expect(createOutlet).toContain("desaId: z.string().uuid().nullable().optional()");
  });
});

describe("Create outlet + visit days (static invariants)", () => {
  it("C1 createOutletForTenant persists schedule via the deployed RPC when visitDays is provided", () => {
    expect(createOutletFn).toContain('rpc("bulk_upsert_outlet_visit_schedule"');
    expect(createOutletFn.split('rpc("bulk_upsert_outlet_visit_schedule"').length - 1).toBe(1);
  });

  it("C2 all provided days are forwarded intact (array passed as a whole, no slicing/filtering)", () => {
    expect(createOutletFn).toContain("p_days: args.input.visitDays");
    expect(createOutletFn).not.toMatch(/p_days: args\.input\.visitDays\[|\.slice\(|\.filter\(/);
  });

  it("C3 tenant and actor derive exclusively from trusted server context, never from client args", () => {
    expect(createOutletFn).toContain("p_distributor_id: args.distributorId");
    expect(createOutletFn).toContain("p_assigned_by: args.actorId");
    expect(createOutletFn).not.toMatch(/p_distributor_id: args\.input\./);
    expect(createOutletFn).not.toMatch(/p_assigned_by: args\.input\./);
  });

  it("C4 undefined visitDays skips the RPC (outlet created exactly as existing behavior)", () => {
    expect(createOutletFn).toMatch(/if \(args\.input\.visitDays !== undefined\)/);
    expect(createOutletFn).toMatch(/args\.input\.visitDays !== undefined/);
    expect(createOutletFn).not.toMatch(/visitDays === undefined/);
    expect(createOutletInputType).toContain("visitDays?: DayOfWeek[];");
  });

  it("C5 empty array [] is forwarded so the RPC creates the outlet with no schedule rows", () => {
    const guardIdx = createOutletFn.indexOf("if (args.input.visitDays !== undefined)");
    const returnIdx = createOutletFn.indexOf("return toOutletRecord");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(returnIdx).toBeGreaterThan(guardIdx);
    const block = createOutletFn.slice(guardIdx, returnIdx);
    expect(block).toContain('rpc("bulk_upsert_outlet_visit_schedule"');
    expect(block).not.toMatch(/if\s*\(args\.input\.visitDays\.length/);
    expect(migrationSrc).toContain("where array_length(p_days, 1) > 0");
  });

  it("C6 duplicate-day conflict is mapped through rpcFailure (23505 → CONFLICT)", () => {
    expect(createOutletFn).toContain("if (rpcError) rpcFailure(rpcError);");
    const rpcFailureBlock = routersSrc.slice(routersSrc.indexOf("function rpcFailure("), routersSrc.indexOf("async function createOutletForTenant("));
    expect(rpcFailureBlock).toContain('code === "23505"');
    expect(rpcFailureBlock).toContain('code === "42501"');
    expect(rpcFailureBlock).toContain('code === "P0002"');
    expect(migrationSrc).toContain("constraint outlet_visit_schedule_outlet_day_unique unique (distributor_id, outlet_id, day_of_week)");
  });

  it("C7 createOutlet stays admin-only via adminTenantProcedure with a tenant workspace", () => {
    expect(createOutlet.startsWith("createOutlet: adminTenantProcedure.mutation"));
    expect(createOutlet).toContain("const distributorId = getDistributorId(ctx.supabaseUser)");
    expect(createOutlet).toContain("createOutletForTenant({ actorId: ctx.supabaseUser!.id, distributorId, input })");
  });
});

describe("Inactive outlet preserves visit days (static invariants)", () => {
  it("I1 setOutletActive only flips outlets.status; it never touches the visit schedule", () => {
    expect(setOutletActive).toContain('.update({ status: input.isActive ? "ACTIVE" : "INACTIVE"');
    expect(setOutletActive).not.toContain('from("outlet_visit_schedule")');
    expect(setOutletActive).not.toContain('rpc("bulk_upsert_outlet_visit_schedule"');
    expect(setOutletActive).not.toMatch(/delete\(\)/);
    expect(setOutletActive).not.toMatch(/visitDays/);
  });

  it("I2 the schedule table has no cascade delete and no status-based delete trigger", () => {
    expect(migrationSrc).not.toMatch(/on delete cascade/);
    expect(migrationSrc).not.toMatch(/trigger/);
    expect(migrationSrc).toContain("references public.outlets(id) on delete restrict");
    expect(migrationSrc).not.toMatch(/delete from public\.outlet_visit_schedule[^;]*status/);
  });

  it("I3 reactivating preserves previously stored days (same status-only mutation, schedule rows untouched)", () => {
    const activeBlock = setOutletActive.slice(setOutletActive.indexOf("input.isActive"));
    expect(activeBlock).toContain('"ACTIVE"');
    expect(activeBlock).not.toContain('from("outlet_visit_schedule")');
    expect(activeBlock).not.toContain('rpc("bulk_upsert_outlet_visit_schedule"');
  });
});