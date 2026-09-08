import { useMemo } from "react";
import { trpc } from "./trpc";

export type ProductStatus = "Aktif" | "Nonaktif";

export type MitraProduct = {
  id: string;
  name: string;
  category: string;
  unit: string;
  size: string;
  sellingPrice: number;
  status: ProductStatus;
};

type ProductDto = {
  id: string;
  name: string;
  unit: string;
  category: string | null;
  size: string | null;
  sellingPrice: number | null;
  lifecycleStatus: string;
};

function toMitraProduct(dto: ProductDto): MitraProduct {
  return {
    id: dto.id,
    name: dto.name,
    category: dto.category ?? "",
    unit: dto.unit,
    size: dto.size ?? "",
    sellingPrice: dto.sellingPrice ?? 0,
    status: dto.lifecycleStatus === "active" ? "Aktif" : "Nonaktif",
  };
}

export function useMitraProducts(): MitraProduct[] {
  const query = trpc.products.list.useQuery(undefined);
  return useMemo(() => (query.data ?? []).map(toMitraProduct), [query.data]);
}

export function formatProductPrice(price: number) {
  return `Rp ${new Intl.NumberFormat("id-ID").format(price)}`;
}
