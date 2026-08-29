import { useSyncExternalStore } from "react";

import type { BudgetPeriod } from "@/lib/mitra-production-budgets";

export type ProductionStatus = "Direncanakan" | "Selesai";

export type MitraProduction = {
  id: string;
  productId: string;
  productionDate: string;
  budgetPeriod: BudgetPeriod;
  targetQuantity: number;
  actualQuantity: number | null;
  notes: string;
  status: ProductionStatus;
  createdAt: string;
};

export type NewMitraProduction = Omit<MitraProduction, "id" | "createdAt" | "status" | "actualQuantity">;

let productions: MitraProduction[] = [];
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMitraProductions() {
  return productions;
}

export function useMitraProductions() {
  return useSyncExternalStore(subscribe, getMitraProductions, getMitraProductions);
}

export function saveMitraProduction(input: NewMitraProduction) {
  const production: MitraProduction = {
    ...input,
    id: `production-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: "Direncanakan",
    actualQuantity: null,
    createdAt: new Date().toISOString(),
  };
  productions = [production, ...productions];
  emitChange();
  return production;
}
