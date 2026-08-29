import type { MitraProductionBudget } from "@/lib/mitra-production-budgets";
import type { MitraProductionHpp } from "@/lib/mitra-production-hpp";
import type { MitraProduction } from "@/lib/mitra-productions";
import type { MitraProduct } from "@/lib/mitra-products";

export type ProductionDashboardSummary = {
  targetQuantity: number;
  actualQuantity: number;
  achievementPercentage: number;
  totalHpp: number;
  hppPerUnit: number;
  estimatedRevenue: number;
  recentProductions: MitraProduction[];
};

export function getMitraProductionDashboardSummary(product: MitraProduct | null, budgets: Map<string, MitraProductionBudget>, productions: MitraProduction[], hpps: Map<string, MitraProductionHpp>): ProductionDashboardSummary {
  if (!product) return { targetQuantity: 0, actualQuantity: 0, achievementPercentage: 0, totalHpp: 0, hppPerUnit: 0, estimatedRevenue: 0, recentProductions: [] };
  const productProductions = productions.filter((production) => production.productId === product.id);
  const targetFromBudgets = Array.from(budgets.values()).filter((budget) => budget.productId === product.id).reduce((sum, budget) => sum + budget.productionTarget, 0);
  const targetQuantity = targetFromBudgets || productProductions.reduce((sum, production) => sum + production.targetQuantity, 0);
  const actualQuantity = productProductions.reduce((sum, production) => sum + (production.actualQuantity ?? 0), 0);
  const hpp = hpps.get(product.id);
  return { targetQuantity, actualQuantity, achievementPercentage: targetQuantity > 0 ? (actualQuantity / targetQuantity) * 100 : 0, totalHpp: hpp?.totalProductionCost ?? 0, hppPerUnit: hpp?.costPerUnit ?? 0, estimatedRevenue: actualQuantity * product.sellingPrice, recentProductions: [...productProductions].sort((left, right) => right.productionDate.localeCompare(left.productionDate)).slice(0, 3) };
}
