import { describe, expect, it } from "vitest";

import { getMitraProductions, saveMitraProduction, updateMitraProductionResult } from "../lib/mitra-productions";

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

  it("stores the result on the original production and marks it complete", () => {
    const production = getMitraProductions()[0];
    if (!production) throw new Error("Production fixture was not created");

    const updated = updateMitraProductionResult({
      id: production.id,
      actualQuantity: 92,
      damagedQuantity: 8,
      yieldPercentage: 92,
      resultNotes: "Delapan unit rusak saat pengemasan",
    });

    expect(updated).toMatchObject({
      id: production.id,
      actualQuantity: 92,
      damagedQuantity: 8,
      yieldPercentage: 92,
      resultNotes: "Delapan unit rusak saat pengemasan",
      status: "Selesai",
    });
    expect(getMitraProductions().find((item) => item.id === production.id)).toEqual(updated);
  });
});
