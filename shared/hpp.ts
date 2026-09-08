export type HppComponentType = "Bahan Baku" | "Bahan Penunjang" | "Tenaga Produksi";

export type HppComponent = {
  id: string;
  type: HppComponentType;
  name: string;
  cost: number;
};

export type HppSummary = {
  totalRawMaterials: number;
  totalSupportingMaterials: number;
  totalLabor: number;
  totalProductionCost: number;
  costPerUnit: number;
};

export type MitraProductionHpp = {
  productId: string;
  components: HppComponent[];
  outputQuantity: number;
  totalRawMaterials: number;
  totalSupportingMaterials: number;
  totalLabor: number;
  totalProductionCost: number;
  costPerUnit: number;
  updatedAt: string;
};

export type HppDraft = Omit<MitraProductionHpp, "updatedAt" | "totalRawMaterials" | "totalSupportingMaterials" | "totalLabor" | "totalProductionCost" | "costPerUnit">;

export function calculateHppSummary(components: HppComponent[], outputQuantity: number): HppSummary {
  const totalRawMaterials = components.filter((item) => item.type === "Bahan Baku").reduce((sum, item) => sum + item.cost, 0);
  const totalSupportingMaterials = components.filter((item) => item.type === "Bahan Penunjang").reduce((sum, item) => sum + item.cost, 0);
  const totalLabor = components.filter((item) => item.type === "Tenaga Produksi").reduce((sum, item) => sum + item.cost, 0);
  const totalProductionCost = totalRawMaterials + totalSupportingMaterials + totalLabor;
  return { totalRawMaterials, totalSupportingMaterials, totalLabor, totalProductionCost, costPerUnit: outputQuantity > 0 ? totalProductionCost / outputQuantity : 0 };
}