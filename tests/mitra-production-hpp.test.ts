import { describe, expect, it } from "vitest";

import { calculateHppSummary } from "../shared/hpp";

describe("Mitra production HPP", () => {
  it("calculates material, supporting, labor, total, and unit cost", () => {
    const summary = calculateHppSummary([
      { id: "raw-1", type: "Bahan Baku", name: "Kopi Biji", cost: 120000 },
      { id: "support-1", type: "Bahan Penunjang", name: "Kemasan", cost: 30000 },
      { id: "labor-1", type: "Tenaga Produksi", name: "Sangrai", cost: 50000 },
    ], 100);

    expect(summary).toEqual({ totalRawMaterials: 120000, totalSupportingMaterials: 30000, totalLabor: 50000, totalProductionCost: 200000, costPerUnit: 2000 });
  });

  it("returns zero totals when there are no components", () => {
    const summary = calculateHppSummary([], 30);

    expect(summary).toEqual({ totalRawMaterials: 0, totalSupportingMaterials: 0, totalLabor: 0, totalProductionCost: 0, costPerUnit: 0 });
  });
});
