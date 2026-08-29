import { describe, expect, it } from "vitest";

import { calculateHppSummary, getMitraProductionHpp, saveMitraProductionHpp } from "../lib/mitra-production-hpp";

describe("Mitra production HPP", () => {
  it("calculates material, supporting, labor, total, and unit cost", () => {
    const summary = calculateHppSummary([
      { id: "raw-1", type: "Bahan Baku", name: "Kopi Biji", cost: 120000 },
      { id: "support-1", type: "Bahan Penunjang", name: "Kemasan", cost: 30000 },
      { id: "labor-1", type: "Tenaga Produksi", name: "Sangrai", cost: 50000 },
    ], 100);

    expect(summary).toEqual({ totalRawMaterials: 120000, totalSupportingMaterials: 30000, totalLabor: 50000, totalProductionCost: 200000, costPerUnit: 2000 });
  });

  it("saves and reads HPP independently by productId", () => {
    saveMitraProductionHpp({ productId: "demo-kopi-arabika", components: [], outputQuantity: 100 });
    saveMitraProductionHpp({ productId: "demo-keripik-pisang", components: [{ id: "raw-2", type: "Bahan Baku", name: "Pisang", cost: 90000 }], outputQuantity: 30 });

    expect(getMitraProductionHpp("demo-kopi-arabika")?.totalProductionCost).toBe(0);
    expect(getMitraProductionHpp("demo-keripik-pisang")).toMatchObject({ productId: "demo-keripik-pisang", totalProductionCost: 90000, costPerUnit: 3000 });
  });
});
