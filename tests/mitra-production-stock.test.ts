import { describe, expect, it } from "vitest";

import { getMitraProductionStock, getMitraProductionStockSummary } from "../lib/mitra-production-stock";
import type { MitraProduction } from "../lib/mitra-productions";
import type { MitraProduct } from "../lib/mitra-products";

const products: MitraProduct[] = [
  { id: "kopi", name: "Kopi Bubuk", category: "Minuman", unit: "Pouch", size: "150 g", sellingPrice: 25000, status: "Aktif" },
  { id: "keripik", name: "Keripik", category: "Makanan", unit: "Pouch", size: "100 g", sellingPrice: 18000, status: "Aktif" },
];
const productions: MitraProduction[] = [
  { id: "finished", productId: "kopi", productionDate: "2026-08-29", budgetPeriod: "Bulan", targetQuantity: 100, actualQuantity: 92, damagedQuantity: 8, yieldPercentage: 92, notes: "", resultNotes: "", status: "Selesai", createdAt: "2026-08-29T00:00:00.000Z" },
  { id: "planned", productId: "kopi", productionDate: "2026-08-30", budgetPeriod: "Bulan", targetQuantity: 100, actualQuantity: null, damagedQuantity: null, yieldPercentage: null, notes: "", resultNotes: "", status: "Direncanakan", createdAt: "2026-08-30T00:00:00.000Z" },
];

describe("Mitra production stock", () => {
  it("includes only completed production actual quantities", () => {
    const summary = getMitraProductionStockSummary(products, productions);
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({ productId: "kopi", stockIn: 92, availableStock: 92 });
    expect(summary[0]?.history.map((item) => item.id)).toEqual(["finished"]);
  });

  it("keeps stock readable by product and returns zero for products without completed output", () => {
    const stock = getMitraProductionStock(products, productions);
    expect(stock.find((item) => item.productId === "keripik")).toMatchObject({ productName: "Keripik", stockIn: 0, availableStock: 0, history: [] });
  });
});
