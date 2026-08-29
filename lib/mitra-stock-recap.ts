import { getMitraProductionStock } from "./mitra-production-stock";
import type { MitraProductionHpp } from "./mitra-production-hpp";
import type { MitraProduction } from "./mitra-productions";
import type { BudgetPeriod } from "./mitra-production-budgets";
import type { MitraProduct } from "./mitra-products";

export type StockRecapFilter = { productId?: string; period?: BudgetPeriod };
export type StockRecap = { totalCompleted: number; totalActual: number; stockIn: number; stockAvailable: number; stockValue: number; rows: Array<{ product: MitraProduct; totalCompleted: number; totalActual: number; stockIn: number; stockAvailable: number; stockValue: number; hppPerUnit: number }> };

export function getMitraStockRecap(products: MitraProduct[], productions: MitraProduction[], hpps: Map<string, MitraProductionHpp>, filter: StockRecapFilter = {}): StockRecap {
  const rows = getMitraProductionStock(products, productions).filter((stock) => !filter.productId || stock.productId === filter.productId).map((stock) => {
    const product = products.find((item) => item.id === stock.productId);
    if (!product) return null;
    const history = stock.history.filter((production) => !filter.period || production.budgetPeriod === filter.period);
    const totalActual = history.reduce((sum, production) => sum + (production.actualQuantity ?? 0), 0);
    const hppPerUnit = hpps.get(product.id)?.costPerUnit ?? 0;
    return { product, totalCompleted: history.length, totalActual, stockIn: totalActual, stockAvailable: totalActual, stockValue: totalActual * hppPerUnit, hppPerUnit };
  }).filter((row): row is NonNullable<typeof row> => Boolean(row));
  return { totalCompleted: rows.reduce((sum, row) => sum + row.totalCompleted, 0), totalActual: rows.reduce((sum, row) => sum + row.totalActual, 0), stockIn: rows.reduce((sum, row) => sum + row.stockIn, 0), stockAvailable: rows.reduce((sum, row) => sum + row.stockAvailable, 0), stockValue: rows.reduce((sum, row) => sum + row.stockValue, 0), rows };
}
