import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { getPeriodStorageKey } from "../lib/mitra-budget-period";
import { getMitraProductionStock } from "../lib/mitra-production-stock";
import type { BudgetPeriod, MitraProductionBudget } from "../shared/budgets";
import type { MitraProductionHpp } from "../lib/mitra-production-hpp";
import type { MitraProduction } from "../lib/mitra-productions";
import type { MitraProduct } from "../lib/mitra-products";
import type { MitraShipment } from "../lib/mitra-shipments";

type FinanceProductRow = {
  product: MitraProduct;
  sellingPrice: number;
  hppPerUnit: number;
  stockIn: number;
  availableStock: number;
  stockValue: number;
  shippedQuantity: number;
  targetQuantity: number;
  actualQuantity: number;
  achievementPercentage: number;
  estimatedRevenue: number;
  marginEstimasi: number;
};

type FinanceSummary = {
  activePeriod: BudgetPeriod | null;
  totalStockValue: number;
  estimatedRevenue: number;
  productionAchievement: { targetQuantity: number; actualQuantity: number; percentage: number } | null;
  totalShipped: number;
  rows: FinanceProductRow[];
};

const root = resolve(process.cwd());

const kopi: MitraProduct = { id: "kopi", name: "Kopi Bubuk", category: "Minuman", unit: "Pouch", size: "150 g", sellingPrice: 25000, status: "Aktif" };
const keripik: MitraProduct = { id: "keripik", name: "Keripik", category: "Makanan", unit: "Pouch", size: "100 g", sellingPrice: 18000, status: "Aktif" };

function makeProduction(overrides: Partial<MitraProduction> & { id: string; productId: string }): MitraProduction {
  return {
    productionDate: "2026-08-29",
    budgetPeriod: "Bulan",
    targetQuantity: 100,
    actualQuantity: null,
    damagedQuantity: null,
    yieldPercentage: null,
    notes: "",
    resultNotes: "",
    status: "Direncanakan",
    createdAt: "2026-08-29T00:00:00.000Z",
    ...overrides,
  };
}

const doneBulan: MitraProduction = makeProduction({ id: "p1", productId: "kopi", budgetPeriod: "Bulan", targetQuantity: 100, actualQuantity: 80, damagedQuantity: 5, yieldPercentage: 80, status: "Selesai" });
const doneMinggu: MitraProduction = makeProduction({ id: "p2", productId: "kopi", productionDate: "2026-08-28", budgetPeriod: "Minggu", targetQuantity: 50, actualQuantity: 40, damagedQuantity: 2, yieldPercentage: 80, status: "Selesai" });
const plannedBulan: MitraProduction = makeProduction({ id: "p3", productId: "kopi", productionDate: "2026-08-30", budgetPeriod: "Bulan", targetQuantity: 100 });
const doneKeripik: MitraProduction = makeProduction({ id: "p4", productId: "keripik", budgetPeriod: "Bulan", targetQuantity: 60, actualQuantity: 60, damagedQuantity: 0, yieldPercentage: 100, status: "Selesai" });

const hppKopi: MitraProductionHpp = { productId: "kopi", components: [], outputQuantity: 100, totalRawMaterials: 60000, totalSupportingMaterials: 20000, totalLabor: 20000, totalProductionCost: 100000, costPerUnit: 1000, updatedAt: "2026-08-29T00:00:00.000Z" };
const hppKeripik: MitraProductionHpp = { productId: "keripik", components: [], outputQuantity: 100, totalRawMaterials: 120000, totalSupportingMaterials: 40000, totalLabor: 40000, totalProductionCost: 200000, costPerUnit: 2000, updatedAt: "2026-08-29T00:00:00.000Z" };

const budgetBulan: MitraProductionBudget = { productId: "kopi", period: "Bulan", productionBudget: 150000, productionTarget: 120, updatedAt: "2026-09-01T00:00:00.000Z" };
const budgetHari: MitraProductionBudget = { productId: "kopi", period: "Hari", productionBudget: 50000, productionTarget: 30, updatedAt: "2026-08-30T00:00:00.000Z" };
const budgetKeripikBulan: MitraProductionBudget = { productId: "keripik", period: "Bulan", productionBudget: 90000, productionTarget: 60, updatedAt: "2026-09-01T00:00:00.000Z" };

function makeShipment(overrides: Partial<MitraShipment> & { id: string; productId: string }): MitraShipment {
  return {
    quantity: 10,
    shipmentDate: "2026-09-01",
    notes: "",
    status: "Direncanakan",
    createdAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

const shippedKopi: MitraShipment = makeShipment({ id: "s1", productId: "kopi", quantity: 30, status: "Dikirim" });
const receivedKopi: MitraShipment = makeShipment({ id: "s2", productId: "kopi", quantity: 10, status: "Diterima", receivedDate: "2026-09-03" });
const plannedKopi: MitraShipment = makeShipment({ id: "s3", productId: "kopi", quantity: 999, shipmentDate: "2026-09-03" });

function getMitraFinanceSummaryMirror(
  products: MitraProduct[],
  hpps: MitraProductionHpp[],
  budgets: MitraProductionBudget[],
  productions: MitraProduction[],
  shipments: MitraShipment[],
): FinanceSummary {
  const activePeriod = budgets.length > 0 ? budgets[0].period : productions.length > 0 ? productions[0].budgetPeriod : null;

  const latestHpp = new Map<string, MitraProductionHpp>();
  for (const hpp of hpps) {
    if (!latestHpp.has(hpp.productId)) latestHpp.set(hpp.productId, hpp);
  }

  const latestBudget = new Map<string, MitraProductionBudget>();
  for (const budget of budgets) {
    const key = getPeriodStorageKey(budget.productId, budget.period);
    if (!latestBudget.has(key)) latestBudget.set(key, budget);
  }

  const stockByProduct = new Map(getMitraProductionStock(products, productions, shipments).map((stock) => [stock.productId, stock]));

  const shippedByProduct = new Map<string, number>();
  for (const shipment of shipments) {
    if (shipment.status === "Direncanakan") continue;
    shippedByProduct.set(shipment.productId, (shippedByProduct.get(shipment.productId) ?? 0) + shipment.quantity);
  }

  let totalStockValue = 0;
  let totalEstimatedRevenue = 0;
  let totalShipped = 0;
  let aggregateTarget = 0;
  let aggregateActual = 0;

  const rows = products.map((product) => {
    const sellingPrice = product.sellingPrice ?? 0;
    const hppPerUnit = latestHpp.get(product.id)?.costPerUnit ?? 0;
    const stockIn = stockByProduct.get(product.id)?.stockIn ?? 0;
    const availableStock = stockByProduct.get(product.id)?.availableStock ?? 0;
    const shippedQuantity = shippedByProduct.get(product.id) ?? 0;
    const stockValue = availableStock * hppPerUnit;
    const estimatedRevenue = stockIn * sellingPrice;

    const periodProductions = activePeriod
      ? productions.filter((production) => production.productId === product.id && production.budgetPeriod === activePeriod)
      : [];
    const budget = activePeriod ? latestBudget.get(getPeriodStorageKey(product.id, activePeriod)) : undefined;
    const targetQuantity = budget ? budget.productionTarget : periodProductions.reduce((sum, production) => sum + production.targetQuantity, 0);
    const actualQuantity = periodProductions
      .filter((production) => production.status === "Selesai")
      .reduce((sum, production) => sum + (production.actualQuantity ?? 0), 0);
    const achievementPercentage = targetQuantity > 0 ? (actualQuantity / targetQuantity) * 100 : 0;
    const marginEstimasi = (sellingPrice - hppPerUnit) * actualQuantity;

    totalStockValue += stockValue;
    totalEstimatedRevenue += estimatedRevenue;
    totalShipped += shippedQuantity;
    aggregateTarget += targetQuantity;
    aggregateActual += actualQuantity;

    return {
      product,
      sellingPrice,
      hppPerUnit,
      stockIn,
      availableStock,
      stockValue,
      shippedQuantity,
      targetQuantity,
      actualQuantity,
      achievementPercentage,
      estimatedRevenue,
      marginEstimasi,
    };
  });

  return {
    activePeriod,
    totalStockValue,
    estimatedRevenue: totalEstimatedRevenue,
    productionAchievement: activePeriod
      ? {
          targetQuantity: aggregateTarget,
          actualQuantity: aggregateActual,
          percentage: aggregateTarget > 0 ? (aggregateActual / aggregateTarget) * 100 : 0,
        }
      : null,
    totalShipped,
    rows,
  };
}

describe("Mitra Finance summary", () => {
  it("returns an empty summary when there is no data", () => {
    const summary = getMitraFinanceSummaryMirror([], [], [], [], []);
    expect(summary).toMatchObject({
      activePeriod: null,
      totalStockValue: 0,
      estimatedRevenue: 0,
      productionAchievement: null,
      totalShipped: 0,
      rows: [],
    });
  });

  it("builds a row for a single product with unit economics", () => {
    const summary = getMitraFinanceSummaryMirror([kopi], [hppKopi], [budgetBulan], [doneBulan], []);
    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0]).toMatchObject({
      product: kopi,
      sellingPrice: 25000,
      hppPerUnit: 1000,
      stockIn: 80,
      availableStock: 80,
      stockValue: 80000,
      shippedQuantity: 0,
      targetQuantity: 120,
      actualQuantity: 80,
      estimatedRevenue: 2000000,
    });
    expect(summary).toMatchObject({ activePeriod: "Bulan", totalStockValue: 80000, estimatedRevenue: 2000000, totalShipped: 0 });
  });

  it("calculates stock as the sum of completed actual quantities, excluding planned events", () => {
    const summary = getMitraFinanceSummaryMirror([kopi], [hppKopi], [budgetBulan], [doneBulan, doneMinggu, plannedBulan], []);
    expect(summary.rows[0].stockIn).toBe(120);
    expect(summary.rows[0].availableStock).toBe(120);
  });

  it("deducts shipped and received quantities from available stock", () => {
    const summary = getMitraFinanceSummaryMirror([kopi], [hppKopi], [budgetBulan], [doneBulan, doneMinggu], [shippedKopi, receivedKopi]);
    expect(summary.rows[0].shippedQuantity).toBe(40);
    expect(summary.rows[0].availableStock).toBe(80);
  });

  it("values stock at cost using HPP per unit", () => {
    const summary = getMitraFinanceSummaryMirror([kopi], [hppKopi], [budgetBulan], [doneBulan, doneMinggu], []);
    expect(summary.rows[0].stockValue).toBe(120000);
    expect(summary.totalStockValue).toBe(120000);
  });

  it("estimates revenue from completed actual output times selling price", () => {
    const summary = getMitraFinanceSummaryMirror([kopi], [hppKopi], [budgetBulan], [doneBulan, doneMinggu], []);
    expect(summary.rows[0].estimatedRevenue).toBe(3000000);
    expect(summary.estimatedRevenue).toBe(3000000);
  });

  it("derives the active period from the newest budget, then production, then null", () => {
    expect(getMitraFinanceSummaryMirror([kopi], [hppKopi], [budgetBulan, budgetHari], [], []).activePeriod).toBe("Bulan");
    expect(getMitraFinanceSummaryMirror([kopi], [hppKopi], [], [doneMinggu], []).activePeriod).toBe("Minggu");
    expect(getMitraFinanceSummaryMirror([kopi], [hppKopi], [], [], []).activePeriod).toBeNull();
  });

  it("uses the budget target for the active period", () => {
    const summary = getMitraFinanceSummaryMirror([kopi], [hppKopi], [budgetBulan], [doneBulan, plannedBulan], []);
    expect(summary.rows[0].targetQuantity).toBe(120);
  });

  it("falls back to production event targets when no budget exists for the active period", () => {
    const summary = getMitraFinanceSummaryMirror([kopi], [hppKopi], [], [doneBulan, plannedBulan], []);
    expect(summary.rows[0].targetQuantity).toBe(200);
    expect(summary.rows[0].actualQuantity).toBe(80);
  });

  it("computes the achievement percentage from actual over target", () => {
    const summary = getMitraFinanceSummaryMirror([kopi], [hppKopi], [budgetBulan], [doneBulan], []);
    expect(summary.rows[0].achievementPercentage).toBeCloseTo(66.6667, 3);
    expect(summary.productionAchievement).toMatchObject({ targetQuantity: 120, actualQuantity: 80 });
    expect(summary.productionAchievement?.percentage).toBeCloseTo(66.6667, 3);
  });

  it("returns zero for achievement when the target is zero and never falls back", () => {
    const zeroTarget: MitraProductionBudget = { ...budgetBulan, productionTarget: 0 };
    const summary = getMitraFinanceSummaryMirror([kopi], [hppKopi], [zeroTarget], [doneBulan, plannedBulan], []);
    expect(summary.rows[0].targetQuantity).toBe(0);
    expect(summary.rows[0].achievementPercentage).toBe(0);
    expect(summary.productionAchievement?.percentage).toBe(0);
  });

  it("treats a missing HPP as zero cost per unit", () => {
    const summary = getMitraFinanceSummaryMirror([kopi], [], [budgetBulan], [doneBulan, doneMinggu], []);
    expect(summary.rows[0].hppPerUnit).toBe(0);
    expect(summary.rows[0].stockValue).toBe(0);
  });

  it("uses selling price zero for revenue and computes the margin formula as-is", () => {
    const freeProduct: MitraProduct = { ...kopi, sellingPrice: 0 };
    const summary = getMitraFinanceSummaryMirror([freeProduct], [hppKopi], [budgetBulan], [doneBulan], []);
    expect(summary.rows[0].stockValue).toBe(80000);
    expect(summary.rows[0].estimatedRevenue).toBe(0);
    expect(summary.rows[0].marginEstimasi).toBe(-80000);
  });

  it("never counts damaged quantity as actual output", () => {
    const summary = getMitraFinanceSummaryMirror([kopi], [hppKopi], [budgetBulan], [doneBulan], []);
    expect(summary.rows[0].stockIn).toBe(80);
    expect(summary.rows[0].actualQuantity).toBe(80);
  });

  it("computes the estimated margin from unit contribution over active-period actual output", () => {
    const summary = getMitraFinanceSummaryMirror([kopi], [hppKopi], [budgetBulan], [doneBulan], []);
    expect(summary.rows[0].marginEstimasi).toBe((25000 - 1000) * 80);
  });

  it("aggregates multiple products into a single summary", () => {
    const summary = getMitraFinanceSummaryMirror([kopi, keripik], [hppKopi, hppKeripik], [budgetBulan, budgetKeripikBulan], [doneBulan, doneMinggu, doneKeripik], []);
    expect(summary.rows).toHaveLength(2);
    expect(summary.totalStockValue).toBe(120000 + 60 * 2000);
    expect(summary.estimatedRevenue).toBe(3000000 + 60 * 18000);
    expect(summary.productionAchievement).toMatchObject({ targetQuantity: 120 + 60, actualQuantity: 80 + 60 });
  });

  it("never sums budgets across periods and only uses the active period", () => {
    const doubleBudgetKopi: MitraProductionBudget[] = [
      budgetBulan,
      { ...budgetHari, productionTarget: 60 },
    ];
    const productions: MitraProduction[] = [
      makeProduction({ id: "bk1", productId: "kopi", budgetPeriod: "Bulan", targetQuantity: 100, actualQuantity: 150, status: "Selesai" }),
      makeProduction({ id: "bk2", productId: "kopi", budgetPeriod: "Hari", targetQuantity: 60 }),
    ];
    const summary = getMitraFinanceSummaryMirror([kopi], [hppKopi], doubleBudgetKopi, productions, []);
    expect(summary.activePeriod).toBe("Bulan");
    expect(summary.rows[0].targetQuantity).toBe(120);
    expect(summary.rows[0].actualQuantity).toBe(150);
  });

  it("ignores planned shipments when calculating shipped quantity and available stock", () => {
    const summary = getMitraFinanceSummaryMirror([kopi], [hppKopi], [budgetBulan], [doneBulan, doneMinggu], [plannedKopi]);
    expect(summary.rows[0].shippedQuantity).toBe(0);
    expect(summary.rows[0].availableStock).toBe(120);
    expect(summary.totalShipped).toBe(0);
  });

  it("keeps the derived layer pure with no client identity and no Supabase access", () => {
    const source = readFileSync(join(root, "lib/mitra-finance.ts"), "utf8");
    expect(source).toContain("useMitraProducts(");
    expect(source).toContain("useMitraProductionHpps(");
    expect(source).toContain("useMitraProductionBudgets(");
    expect(source).toContain("useMitraProductions(");
    expect(source).toContain("useMitraShipments(");
    expect(source).toContain("useMemo(");
    expect(source).not.toContain("distributorId");
    expect(source).not.toContain("mitraUserId");
    expect(source).not.toContain('from("');
    expect(source).not.toContain("supabase");
  });
});