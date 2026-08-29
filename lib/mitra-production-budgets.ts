import { useSyncExternalStore } from "react";

export type BudgetPeriod = "Hari" | "Minggu" | "Bulan";

export type MitraProductionBudget = {
  productId: string;
  period: BudgetPeriod;
  productionBudget: number;
  productionTarget: number;
  updatedAt: string;
};

let budgets = new Map<string, MitraProductionBudget>();
const listeners = new Set<() => void>();

function budgetKey(productId: string, period: BudgetPeriod) {
  return `${productId}:${period}`;
}

function emitChange() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMitraProductionBudgets() {
  return budgets;
}

export function getMitraProductionBudget(productId: string, period: BudgetPeriod) {
  return budgets.get(budgetKey(productId, period));
}

function getSnapshot() {
  return budgets;
}

export function useMitraProductionBudgets() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function saveMitraProductionBudget(input: Omit<MitraProductionBudget, "updatedAt">) {
  const budget: MitraProductionBudget = {
    ...input,
    updatedAt: new Date().toISOString(),
  };
  budgets = new Map(budgets).set(budgetKey(input.productId, input.period), budget);
  emitChange();
  return budget;
}
