import { useMemo } from "react";
import { trpc } from "./trpc";
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

type ProductionDto = {
  id: string;
  productId: string;
  productionDate: string;
  budgetPeriod: string;
  targetQuantity: number;
  actualQuantity: number | null;
  damagedQuantity: number;
  yieldPercentage: number | null;
  notes: string;
  resultNotes: string;
  status: string;
  createdAt: string;
};

function toMitraProduction(dto: ProductionDto): MitraProduction {
  return {
    id: dto.id,
    productId: dto.productId,
    productionDate: dto.productionDate,
    budgetPeriod: dto.budgetPeriod as BudgetPeriod,
    targetQuantity: dto.targetQuantity,
    actualQuantity: dto.actualQuantity,
    damagedQuantity: dto.status === "planned" ? null : dto.damagedQuantity,
    yieldPercentage: dto.yieldPercentage,
    notes: dto.notes,
    resultNotes: dto.resultNotes,
    status: dto.status === "completed" ? "Selesai" : "Direncanakan",
    createdAt: dto.createdAt,
  };
}

export function useMitraProductions(): MitraProduction[] {
  const query = trpc.productionEvents.list.useQuery(undefined);
  return useMemo(() => (query.data ?? []).map(toMitraProduction), [query.data]);
}