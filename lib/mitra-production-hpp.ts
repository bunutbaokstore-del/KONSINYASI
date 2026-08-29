import { useSyncExternalStore } from "react";

export type HppComponentType = "Bahan Baku" | "Bahan Penunjang" | "Tenaga Produksi";

export type HppComponent = {
  id: string;
  type: HppComponentType;
  name: string;
  cost: number;
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

let hpps = new Map<string, MitraProductionHpp>();
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function calculateHppSummary(components: HppComponent[], outputQuantity: number) {
  const totalRawMaterials = components.filter((item) => item.type === "Bahan Baku").reduce((sum, item) => sum + item.cost, 0);
  const totalSupportingMaterials = components.filter((item) => item.type === "Bahan Penunjang").reduce((sum, item) => sum + item.cost, 0);
  const totalLabor = components.filter((item) => item.type === "Tenaga Produksi").reduce((sum, item) => sum + item.cost, 0);
  const totalProductionCost = totalRawMaterials + totalSupportingMaterials + totalLabor;
  return { totalRawMaterials, totalSupportingMaterials, totalLabor, totalProductionCost, costPerUnit: outputQuantity > 0 ? totalProductionCost / outputQuantity : 0 };
}

export function getMitraProductionHpp(productId: string) {
  return hpps.get(productId);
}

export function getMitraProductionHpps() {
  return hpps;
}

function getSnapshot() {
  return hpps;
}

export function useMitraProductionHpps() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function saveMitraProductionHpp(draft: HppDraft) {
  const hpp: MitraProductionHpp = { ...draft, ...calculateHppSummary(draft.components, draft.outputQuantity), updatedAt: new Date().toISOString() };
  hpps = new Map(hpps).set(draft.productId, hpp);
  emitChange();
  return hpp;
}
