export type BudgetPeriod = "Hari" | "Minggu" | "Bulan";

export type MitraProductionBudget = {
  productId: string;
  period: BudgetPeriod;
  productionBudget: number;
  productionTarget: number;
  updatedAt: string;
};

export type BudgetInput = {
  productId: string;
  period: BudgetPeriod;
  productionBudget: number;
  productionTarget: number;
};