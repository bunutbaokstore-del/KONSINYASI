import { describe, expect, it } from "vitest";

import { filterMitraProductionHistory } from "../lib/mitra-production-history";
import type { MitraProduction } from "../lib/mitra-productions";

const productions: MitraProduction[] = [
  { id: "p1", productId: "kopi", productionDate: "2026-08-28", budgetPeriod: "Bulan", targetQuantity: 100, actualQuantity: 92, damagedQuantity: 8, yieldPercentage: 92, notes: "", resultNotes: "", status: "Selesai", createdAt: "2026-08-28T00:00:00.000Z" },
  { id: "p2", productId: "keripik", productionDate: "2026-08-29", budgetPeriod: "Minggu", targetQuantity: 50, actualQuantity: null, damagedQuantity: null, yieldPercentage: null, notes: "", resultNotes: "", status: "Direncanakan", createdAt: "2026-08-29T00:00:00.000Z" },
];

describe("Mitra production history selectors", () => {
  it("filters the shared production records by product and date", () => {
    expect(filterMitraProductionHistory(productions, { productId: "kopi" }).map((item) => item.id)).toEqual(["p1"]);
    expect(filterMitraProductionHistory(productions, { productionDate: "2026-08-29" }).map((item) => item.id)).toEqual(["p2"]);
    expect(filterMitraProductionHistory(productions, { productId: "kopi", productionDate: "2026-08-29" })).toEqual([]);
  });
});
