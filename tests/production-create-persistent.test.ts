import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "app/(tabs)/production.tsx"), "utf8");

describe("Persistent Production CREATE", () => {
  it("uses the locked createPlanned mutation and persistent product selector", () => {
    expect(source).toContain("trpc.productionEvents.createPlanned.useMutation");
    expect(source).toContain("trpc.products.list.useQuery()");
    expect(source).toContain("products={productsQuery.data ?? []}");
    expect(source).toContain("PersistentProductOption");
    expect(source).not.toContain("saveMitraProduction(");
    expect(source).not.toContain("trpc.productionEvents.create.useMutation");
  });

  it("sends only the locked createPlanned input fields", () => {
    const createCall = source.slice(source.indexOf("createProductionMutation.mutate("), source.indexOf("createProductionMutation.mutate(") + 260);
    expect(source).toContain("productId: selectedProductId");
    expect(source).toContain("productionDate: productionDate.trim()");
    expect(source).toContain("budgetPeriod: period");
    expect(source).toContain("targetQuantity: quantity");
    expect(source).toContain("notes: notes.trim()");
    expect(createCall).not.toContain("distributorId:");
    expect(createCall).not.toContain("mitraUserId:");
    expect(createCall).not.toContain("actualQuantity:");
    expect(createCall).not.toContain("damagedQuantity:");
    expect(createCall).not.toContain("yieldPercentage:");
    expect(createCall).not.toContain("resultNotes:");
  });

  it("handles persistent product loading, error, empty, and mutation pending states", () => {
    expect(source).toContain("productsLoading ?");
    expect(source).toContain("productsError ?");
    expect(source).toContain("products.length === 0 ?");
    expect(source).toContain("isSaving={createProductionMutation.isPending}");
    expect(source).toContain("Menyimpan...");
    expect(source).not.toContain("productsQuery.data ?? products");
  });

  it("invalidates the persistent production list after success", () => {
    expect(source).toContain("await utils.productionEvents.list.invalidate()");
    expect(source).toContain("Produksi berhasil disimpan ke Production Event.");
  });

  it("keeps COMPLETE legacy and does not mutate stock from CREATE", () => {
    expect(source).toContain("updateMitraProductionResult({");
    expect(source).not.toContain("trpc.productionEvents.complete.useMutation");
    expect(source).not.toContain("complete_mitra_production_event");
    expect(source).not.toContain("stockMutation");
    expect(source).not.toContain("stock_movements");
  });

  it("keeps Production READ persistent", () => {
    expect(source).toContain("const persistentProductions: MitraProduction[]");
    expect(source).toContain("view === \"list\" ? persistentProductions");
    expect(source).toContain("view === \"results\" ? persistentProductions");
    expect(source).toContain("view === \"history\" ? historyProductions");
  });
});
