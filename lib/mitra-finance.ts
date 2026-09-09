import { useMemo } from "react";
import { getPeriodStorageKey } from "./mitra-budget-period";
import { getMitraProductionStock } from "./mitra-production-stock";
import {
  useMitraProductionBudgets,
  type BudgetPeriod,
  type MitraProductionBudget,
} from "./mitra-production-budgets";
import { type MitraProductionHpp, useMitraProductionHpps } from "./mitra-production-hpp";
import { type MitraProduction, useMitraProductions } from "./mitra-productions";
import { type MitraProduct, useMitraProducts } from "./mitra-products";
import { type MitraShipment, useMitraShipments } from "./mitra-shipments";

export type FinanceProductRow = {
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

export type FinanceSummary = {
  activePeriod: BudgetPeriod | null;
  totalStockValue: number;
  estimatedRevenue: number;
  productionAchievement: { targetQuantity: number; actualQuantity: number; percentage: number } | null;
  totalShipped: number;
  rows: FinanceProductRow[];
};

export function getMitraFinanceSummary(
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
    const targetQuantity = budget
      ? budget.productionTarget
      : periodProductions.reduce((sum, production) => sum + production.targetQuantity, 0);
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

export function useMitraFinance(): FinanceSummary {
  const products = useMitraProducts();
  const hpps = useMitraProductionHpps();
  const budgets = useMitraProductionBudgets();
  const productions = useMitraProductions();
  const shipments = useMitraShipments();

  return useMemo(
    () => getMitraFinanceSummary(products, Array.from(hpps.values()), Array.from(budgets.values()), productions, shipments),
    [products, hpps, budgets, productions, shipments],
  );
}