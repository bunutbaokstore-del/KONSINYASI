import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const routersSource = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
const procedureStart = routersSource.indexOf("mitraDashboard: router({");
const procedureEnd = routersSource.indexOf("  }),\n});", procedureStart);
const procedureSource = routersSource.slice(procedureStart, procedureEnd);

describe("Mitra Consignment Item Product relation query", () => {
  it("exposes the direct Product Master relation and valid Stock Change candidates", () => {
    expect(procedureStart).toBeGreaterThanOrEqual(0);
    expect(procedureSource).toContain("stock: supabaseProtectedProcedure.query");
    expect(procedureSource).toContain("id, product_id, name, sku, unit, stock_quantity, minimum_stock, updated_at, product:products(id, name, sku, unit, lifecycle_status)");
    expect(procedureSource).toContain("productId: item.product_id ?? null");
    expect(procedureSource).toContain("productName: item.product?.[0]?.name ?? null");
    expect(procedureSource).toContain("const stockChangeItems = items.filter((item) => item.productId && item.productName)");
  });

  it("keeps Mitra and Distributor scoping server-derived", () => {
    expect(procedureSource).toContain('if (role !== "mitra_umkm")');
    expect(procedureSource).toContain("const distributorId = getDistributorId(ctx.supabaseUser)");
    expect(procedureSource).toContain('.eq("mitra_user_id", ctx.supabaseUser.id)');
    expect(procedureSource).toContain('.eq("distributor_id", distributorId)');
    expect(procedureSource).not.toContain("input.mitraUserId");
    expect(procedureSource).not.toContain("input.distributorId");
  });

  it("does not use local identity mapping or mutate data", () => {
    expect(procedureSource).not.toContain("useMitraProducts");
    expect(procedureSource).not.toContain("demo-kopi-arabika");
    expect(procedureSource).not.toContain("localStorage");
    expect(procedureSource).not.toMatch(/\.(insert|update|delete)\s*\(/);
  });
});
