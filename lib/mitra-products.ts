import { useSyncExternalStore } from "react";

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

export type NewMitraProduct = Omit<MitraProduct, "id">;

const DEFAULT_PRODUCTS: MitraProduct[] = [
  {
    id: "demo-kopi-arabika",
    name: "Kopi Arabika Biji",
    category: "Minuman",
    unit: "Gram",
    size: "250 g",
    sellingPrice: 45000,
    status: "Aktif",
  },
  {
    id: "demo-keripik-pisang",
    name: "Keripik Pisang Original",
    category: "Makanan",
    unit: "Pouch",
    size: "100 g",
    sellingPrice: 18000,
    status: "Aktif",
  },
];

let products = DEFAULT_PRODUCTS;
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMitraProducts() {
  return products;
}

function getSnapshot() {
  return getMitraProducts();
}

export function useMitraProducts() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function addMitraProduct(product: NewMitraProduct) {
  const newProduct: MitraProduct = {
    ...product,
    id: `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
  products = [...products, newProduct];
  emitChange();
  return newProduct;
}

export function formatProductPrice(price: number) {
  return `Rp ${new Intl.NumberFormat("id-ID").format(price)}`;
}
