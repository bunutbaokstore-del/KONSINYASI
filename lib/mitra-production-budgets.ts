import { useMemo } from "react";
import { trpc } from "./trpc";
import { getPeriodStorageKey } from "./mitra-budget-period";
import type { BudgetPeriod, MitraProductionBudget } from "@/shared/budgets";

export type { BudgetInput, BudgetPeriod, MitraProductionBudget } from "@/shared/budgets";

export function useMitraProductionBudgets(): Map<string, MitraProductionBudget> {
  const query = trpc.budgets.list.useQuery();
  return useMemo(() => {
    const byKey = new Map<string, MitraProductionBudget>();
    (query.data ?? []).forEach((budget) => byKey.set(getPeriodStorageKey(budget.productId, budget.period), budget));
    return byKey;
  }, [query.data]);
}