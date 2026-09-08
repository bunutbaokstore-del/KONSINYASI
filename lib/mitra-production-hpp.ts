import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import type { MitraProductionHpp } from "@/shared/hpp";

export { calculateHppSummary } from "@/shared/hpp";
export type { HppComponent, HppComponentType, HppDraft, HppSummary, MitraProductionHpp } from "@/shared/hpp";

export function useMitraProductionHpps(): Map<string, MitraProductionHpp> {
  const query = trpc.hpp.list.useQuery();
  return useMemo(() => {
    const byProduct = new Map<string, MitraProductionHpp>();
    (query.data ?? []).forEach((hpp) => byProduct.set(hpp.productId, hpp));
    return byProduct;
  }, [query.data]);
}