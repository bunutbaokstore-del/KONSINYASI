import { describe, expect, it } from "vitest";

import { getMitraProductions, saveMitraProduction } from "../lib/mitra-productions";

describe("Mitra production list", () => {
  it("saves a planned production with its product, date, period, and budget target", () => {
    const saved = saveMitraProduction({
      productId: "demo-kopi-arabika",
      productionDate: "2026-08-29",
      budgetPeriod: "Bulan",
      targetQuantity: 100,
      notes: "Produksi batch akhir bulan",
    });

    expect(saved).toMatchObject({
      productId: "demo-kopi-arabika",
      productionDate: "2026-08-29",
      budgetPeriod: "Bulan",
      targetQuantity: 100,
      notes: "Produksi batch akhir bulan",
      status: "Direncanakan",
      actualQuantity: null,
    });
    expect(getMitraProductions()).toContainEqual(saved);
  });
});
