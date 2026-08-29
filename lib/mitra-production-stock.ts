import type { MitraProduction } from "@/lib/mitra-productions";
import type { MitraProduct } from "@/lib/mitra-products";

export type ProductionStockSummary = {
  productId: string;
  productName: string;
  stockIn: number;
  availableStock: number;
  history: MitraProduction[];
};

export function getMitraProductionStock(products: MitraProduct[], productions: MitraProduction[]) {
  return products.map((product) => {
    const completed = productions.filter((production) => production.productId === product.id && production.status === "Selesai");
    const stockIn = completed.reduce((sum, production) => sum + (production.actualQuantity ?? 0), 0);
    return { productId: product.id, productName: product.name, stockIn, availableStock: stockIn, history: [...completed].sort((left, right) => right.productionDate.localeCompare(left.productionDate)) } satisfies ProductionStockSummary;
  });
}

export function getMitraProductionStockSummary(products: MitraProduct[], productions: MitraProduction[]) {
  return getMitraProductionStock(products, productions).filter((summary) => summary.stockIn > 0);
}
