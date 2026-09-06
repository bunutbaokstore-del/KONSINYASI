import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "components/mitra-distribution.tsx"), "utf8");

describe("Mitra Supplier Request persistent UI", () => {
  it("uses the persistent New Item mutation with only frozen business fields", () => {
    expect(source).toContain("trpc.supplier.submitNewItem.useMutation()");
    expect(source).toContain("name: name.trim()");
    expect(source).toContain("sku: sku.trim() || null");
    expect(source).toContain("unit: unit.trim()");
    expect(source).toContain("proposedStockQuantity: parsedStock");
    expect(source).toContain("proposedMinimumStock: parsedMinimum");
    expect(source).toContain("reason: reason.trim()");
    expect(source).not.toContain("mitra_user_id");
    expect(source).not.toContain("distributor_id");
    expect(source).not.toContain("product_id");
  });

  it("uses authoritative stockChangeItems and sends itemId directly", () => {
    expect(source).toContain("trpc.mitraDashboard.stock.useQuery()");
    expect(source).toContain("const stockChangeItems = useMemo(() => stockQuery.data?.stockChangeItems ?? [], [stockQuery.data?.stockChangeItems])");
    expect(source).toContain("trpc.supplier.submitStockChange.useMutation()");
    expect(source).toContain("await submitStockChange.mutateAsync({ itemId, proposedStockQuantity: parsedStock, reason: reason.trim() })");
    expect(source).toContain("Stok Setelah Perubahan");
    expect(source).not.toContain("products.find");
    expect(source).not.toContain("saveMitraSupplyRequest");
    expect(source).not.toContain("reviewMitraSupplyRequest");
  });

  it("uses persistent history and handles query/mutation states without local fallback", () => {
    expect(source).toContain("trpc.supplier.requests.useQuery()");
    expect(source).toContain("await utils.supplier.requests.invalidate()");
    expect(source).toContain("await requestsQuery.refetch()");
    expect(source).toContain("query.isLoading");
    expect(source).toContain("query.isError");
    expect(source).toContain("isSubmitting");
    expect(source).toContain("request.reviewNote");
    expect(source).not.toContain("approvedQuantity");
    expect(source).not.toContain("useMitraSupplyRequests");
  });
});
