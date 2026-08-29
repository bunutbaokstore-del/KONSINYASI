import type { MitraProduction } from "@/lib/mitra-productions";
import type { MitraProductionHpp } from "@/lib/mitra-production-hpp";

export type ProductionHistoryFilter = {
  productId?: string;
  productionDate?: string;
};

export function filterMitraProductionHistory(productions: MitraProduction[], filter: ProductionHistoryFilter) {
  return productions.filter((production) => (!filter.productId || production.productId === filter.productId) && (!filter.productionDate || production.productionDate === filter.productionDate));
}

export function getHistoryHpp(hpps: Map<string, MitraProductionHpp>, productId: string) {
  return hpps.get(productId);
}
