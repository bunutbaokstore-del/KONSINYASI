import { describe, expect, it } from "vitest";

import { getMitraStockRecap } from "../lib/mitra-stock-recap";
import type { MitraProductionHpp } from "../lib/mitra-production-hpp";
import type { MitraProduction } from "../lib/mitra-productions";
import type { MitraProduct } from "../lib/mitra-products";

const products: MitraProduct[] = [
  { id: "kopi", name: "Kopi Bubuk", category: "Minuman", unit: "Pouch", size: "150 g", sellingPrice: 25000, status: "Aktif" },
  { id: "keripik", name: "Keripik", category: "Makanan", unit: "Pouch", size: "100 g", sellingPrice: 18000, status: "Aktif" },
];
const productions: MitraProduction[] = [
  { id: "done-1", productId: "kopi", productionDate: "2026-08-29", budgetPeriod: "Bulan", targetQuantity: 100, actualQuantity: 80, damagedQuantity: 5, yieldPercentage: 80, notes: "", resultNotes: "", status: "Selesai", createdAt: "2026-08-29T00:00:00.000Z" },
  { id: "done-2", productId: "kopi", productionDate: "2026-08-28", budgetPeriod: "Minggu", targetQuantity: 50, actualQuantity: 40, damagedQuantity: 2, yieldPercentage: 80, notes: "", resultNotes: "", status: "Selesai", createdAt: "2026-08-28T00:00:00.000Z" },
  { id: "planned", productId: "kopi", productionDate: "2026-08-30", budgetPeriod: "Bulan", targetQuantity: 100, actualQuantity: null, damagedQuantity: null, yieldPercentage: null, notes: "", resultNotes: "", status: "Direncanakan", createdAt: "2026-08-30T00:00:00.000Z" },
];
const hpp: MitraProductionHpp = { productId: "kopi", components: [], outputQuantity: 100, totalRawMaterials: 60000, totalSupportingMaterials: 20000, totalLabor: 20000, totalProductionCost: 100000, costPerUnit: 1000, updatedAt: "2026-08-29T00:00:00.000Z" };

describe("Mitra stock recap", () => {
  it("reconciles completed production, actual output, stock, and HPP value", () => {
    const recap = getMitraStockRecap(products, productions, new Map([["kopi", hpp]]));
    expect(recap).toMatchObject({ totalCompleted: 2, totalActual: 120, stockIn: 120, stockAvailable: 120, stockValue: 120000 });
    expect(recap.rows[0]).toMatchObject({ product: products[0], stockValue: 120000, hppPerUnit: 1000 });
  });

  it("filters the same stock data by product and period", () => {
    const recap = getMitraStockRecap(products, productions, new Map([["kopi", hpp]]), { productId: "kopi", period: "Minggu" });
    expect(recap).toMatchObject({ totalCompleted: 1, totalActual: 40, stockIn: 40, stockAvailable: 40, stockValue: 40000 });
  });
});
