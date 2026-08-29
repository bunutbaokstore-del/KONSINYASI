import { describe, expect, it } from "vitest";

import { getMitraProductionDashboardSummary } from "../lib/mitra-production-dashboard";
import type { MitraProductionBudget } from "../lib/mitra-production-budgets";
import type { MitraProductionHpp } from "../lib/mitra-production-hpp";
import type { MitraProduction } from "../lib/mitra-productions";
import type { MitraProduct } from "../lib/mitra-products";

const product: MitraProduct = { id: "kopi", name: "Kopi Bubuk", category: "Minuman", unit: "Pouch", size: "150 g", sellingPrice: 25000, status: "Aktif" };
const budget: MitraProductionBudget = { productId: "kopi", period: "Bulan", productionBudget: 1000000, productionTarget: 100, updatedAt: "2026-08-29T00:00:00.000Z" };
const production: MitraProduction = { id: "production-1", productId: "kopi", productionDate: "2026-08-29", budgetPeriod: "Bulan", targetQuantity: 100, actualQuantity: 80, damagedQuantity: 5, yieldPercentage: 80, notes: "", resultNotes: "", status: "Selesai", createdAt: "2026-08-29T00:00:00.000Z" };
const hpp: MitraProductionHpp = { productId: "kopi", components: [], outputQuantity: 100, totalRawMaterials: 100000, totalSupportingMaterials: 20000, totalLabor: 30000, totalProductionCost: 150000, costPerUnit: 1500, updatedAt: "2026-08-29T00:00:00.000Z" };

describe("Mitra production dashboard", () => {
  it("derives dashboard metrics from the shared stores", () => {
    const summary = getMitraProductionDashboardSummary(product, new Map([["kopi:Bulan", budget]]), [production], new Map([["kopi", hpp]]));
    expect(summary).toMatchObject({ targetQuantity: 100, actualQuantity: 80, achievementPercentage: 80, totalHpp: 150000, hppPerUnit: 1500, estimatedRevenue: 2000000 });
    expect(summary.recentProductions).toEqual([production]);
  });

  it("returns safe zero values when there is no selected product or data", () => {
    expect(getMitraProductionDashboardSummary(null, new Map(), [], new Map())).toEqual({ targetQuantity: 0, actualQuantity: 0, achievementPercentage: 0, totalHpp: 0, hppPerUnit: 0, estimatedRevenue: 0, recentProductions: [] });
  });
});
