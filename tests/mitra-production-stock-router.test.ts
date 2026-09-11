import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routersSource = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
const procedureStart = routersSource.indexOf("mitraProductionStock: router({");
const procedureEnd = routersSource.indexOf("mitraDashboard: router({", procedureStart);
const procedureSource = routersSource.slice(procedureStart, procedureEnd);

describe("Persistent Mitra Production Stock READ procedure", () => {
  it("defines the expected read-only procedure and persistent source shape", () => {
    expect(procedureStart).toBeGreaterThanOrEqual(0);
    expect(procedureEnd).toBeGreaterThan(procedureStart);
    expect(procedureSource).toContain("list: supabaseProtectedProcedure.query");
    expect(procedureSource).toContain('.from("mitra_production_stock")');
    expect(procedureSource).toContain("id, distributor_id, mitra_user_id, product_id, available_quantity, created_at, updated_at");
    expect(procedureSource).toContain("product:products(");
    expect(procedureSource).toContain("availableQuantity: row.available_quantity");
    expect(procedureSource).toContain("return (data ?? []).map");
    expect(procedureSource).not.toMatch(/\.(insert|update|delete)\s*\(/);
  });

  it("enforces Mitra, Distributor, and Admin role gates with workspace isolation", () => {
    expect(procedureSource).toContain('role !== "mitra_umkm"');
    expect(procedureSource).toContain('role !== "distributor"');
    expect(procedureSource).toContain('role !== "admin"');
    expect(procedureSource).toContain("const distributorId = getDistributorId(ctx.supabaseUser)");
    expect(procedureSource).toContain('.eq("distributor_id", distributorId)');
    expect(procedureSource).toContain('.eq("mitra_user_id", ctx.supabaseUser!.id)');
  });

  it("handles empty results without a mutation or client-side tenant fallback", () => {
    expect(procedureSource).toContain("data ?? []");
    expect(procedureSource).not.toContain("localStorage");
    expect(procedureSource).not.toContain("fake");
    expect(procedureSource).not.toContain("seed");
  });
});
