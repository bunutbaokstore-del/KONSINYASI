import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "app/(tabs)/production.tsx"), "utf8");

describe("Production READ persistent migration", () => {
  it("uses productionEvents.list as the READ source", () => {
    expect(source).toContain("trpc.productionEvents.list.useQuery()");
    expect(source).toContain("const persistentProductions: MitraProduction[]");
    expect(source).toContain("view === \"list\" ? persistentProductions");
    expect(source).toContain("view === \"history\" ? historyProductions");
    expect(source).toContain("view === \"results\" ? persistentProductions");
    expect(source).toContain("<ResultForm colors={colors} productions={persistentProductions}");
  });

  it("renders loading, error, and empty states without a silent local fallback", () => {
    expect(source).toContain("productionEventsQuery.isLoading");
    expect(source).toContain("productionEventsQuery.isError");
    expect(source).toContain("Belum ada produksi.");
    expect(source).not.toContain("productionEventsQuery.data ?? legacyProductions");
    expect(source).not.toContain("const legacyProductions = getMitraProductions()");
    expect(source).not.toContain("const productions = legacyProductions");
  });

  it("keeps CREATE and COMPLETE on persistent event mutations", () => {
    expect(source).toContain("trpc.productionEvents.createPlanned.useMutation");
    expect(source).not.toContain("saveMitraProduction(");
    expect(source).toContain("trpc.productionEvents.complete.useMutation");
    expect(source).not.toContain("updateMitraProductionResult(");
    expect(source).not.toContain("trpc.productionEvents.create.useMutation()");
  });

  it("uses persistent products for names on persistent production records", () => {
    expect(source).toContain("trpc.products.list.useQuery()");
    expect(source).toContain("productsQuery.data?.find((product) => product.id === item.productId)?.name");
  });
});
