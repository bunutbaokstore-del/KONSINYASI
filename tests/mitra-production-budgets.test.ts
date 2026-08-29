import { describe, expect, it } from "vitest";

import { getMitraProductionBudget, saveMitraProductionBudget } from "../lib/mitra-production-budgets";

describe("Mitra production budgets", () => {
  it("saves and reads a budget by product and period", () => {
    const saved = saveMitraProductionBudget({
      productId: "demo-kopi-arabika",
      period: "Bulan",
      productionBudget: 1500000,
      productionTarget: 100,
    });

    expect(getMitraProductionBudget("demo-kopi-arabika", "Bulan")).toEqual(saved);
    expect(getMitraProductionBudget("demo-kopi-arabika", "Minggu")).toBeUndefined();
  });

  it("updates only the same product-period configuration", () => {
    saveMitraProductionBudget({ productId: "demo-kopi-arabika", period: "Hari", productionBudget: 50000, productionTarget: 4 });
    saveMitraProductionBudget({ productId: "demo-kopi-arabika", period: "Hari", productionBudget: 75000, productionTarget: 6 });

    expect(getMitraProductionBudget("demo-kopi-arabika", "Hari")).toMatchObject({ productionBudget: 75000, productionTarget: 6 });
    expect(getMitraProductionBudget("demo-kopi-arabika", "Bulan")).toMatchObject({ productionBudget: 1500000, productionTarget: 100 });
  });
});
