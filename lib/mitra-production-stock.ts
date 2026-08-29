import type { MitraProduction } from "@/lib/mitra-productions";
import type { MitraProduct } from "@/lib/mitra-products";
import type { MitraShipment } from "./mitra-shipments";

export type ProductionStockSummary = {
  productId: string;
  productName: string;
  stockIn: number;
  availableStock: number;
  history: MitraProduction[];
};

export function getMitraProductionStock(products: MitraProduct[], productions: MitraProduction[], shipments: MitraShipment[] = []) {
  return products.map((product) => {
    const completed = productions.filter((production) => production.productId === product.id && production.status === "Selesai");
    const stockIn = completed.reduce((sum, production) => sum + (production.actualQuantity ?? 0), 0);
    const shipped = shipments.filter((shipment) => shipment.productId === product.id && shipment.status !== "Direncanakan").reduce((sum, shipment) => sum + shipment.quantity, 0);
    return { productId: product.id, productName: product.name, stockIn, availableStock: Math.max(0, stockIn - shipped), history: [...completed].sort((left, right) => right.productionDate.localeCompare(left.productionDate)) } satisfies ProductionStockSummary;
  });
}

export function getMitraProductionStockSummary(products: MitraProduct[], productions: MitraProduction[], shipments: MitraShipment[] = []) {
  return getMitraProductionStock(products, productions, shipments).filter((summary) => summary.stockIn > 0);
}
