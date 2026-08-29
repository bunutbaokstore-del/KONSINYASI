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
  damagedQuantity: number | null;
  yieldPercentage: number | null;
  notes: string;
  resultNotes: string;
  status: ProductionStatus;
  createdAt: string;
};

export type NewMitraProduction = Omit<MitraProduction, "id" | "createdAt" | "status" | "actualQuantity" | "damagedQuantity" | "yieldPercentage" | "resultNotes">;

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

export function updateMitraProductionResult(input: { id: string; actualQuantity: number; damagedQuantity: number; yieldPercentage: number; resultNotes: string }) {
  let updatedProduction: MitraProduction | undefined;
  productions = productions.map((production) => {
    if (production.id !== input.id) return production;
    updatedProduction = { ...production, actualQuantity: input.actualQuantity, damagedQuantity: input.damagedQuantity, yieldPercentage: input.yieldPercentage, resultNotes: input.resultNotes, status: "Selesai" };
    return updatedProduction;
  });
  if (updatedProduction) emitChange();
  return updatedProduction;
}

export function saveMitraProduction(input: NewMitraProduction) {
  const production: MitraProduction = {
    ...input,
    id: `production-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: "Direncanakan",
    actualQuantity: null,
    damagedQuantity: null,
    yieldPercentage: null,
    resultNotes: "",
    createdAt: new Date().toISOString(),
  };
  productions = [production, ...productions];
  emitChange();
  return production;
}
