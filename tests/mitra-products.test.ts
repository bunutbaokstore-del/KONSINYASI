import { describe, expect, it } from "vitest";

type ProductStatus = "Aktif" | "Nonaktif";

type MitraProduct = {
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

function formatProductPrice(price: number) {
  return `Rp ${new Intl.NumberFormat("id-ID").format(price)}`;
}

describe("Mitra product source", () => {
  it("maps a complete products.list DTO into MitraProduct", () => {
    const dto: ProductDto = {
      id: "6f0c8f9e-9f3b-4c21-b8a5-32d9e1c54a08",
      name: "Kopi Arabika Biji",
      category: "Minuman",
      unit: "Gram",
      size: "250 g",
      sellingPrice: 45000,
      lifecycleStatus: "active",
    };

    const product = toMitraProduct(dto);

    expect(product).toEqual({
      id: "6f0c8f9e-9f3b-4c21-b8a5-32d9e1c54a08",
      name: "Kopi Arabika Biji",
      category: "Minuman",
      unit: "Gram",
      size: "250 g",
      sellingPrice: 45000,
      status: "Aktif",
    });
  });

  it("coerces null category to an empty string", () => {
    const product = toMitraProduct({
      id: "c4f88b79-1bed-4cd3-a33a-4b9c0f6a2dd1",
      name: "Keripik Pisang Original",
      category: null,
      unit: "Pouch",
      size: "100 g",
      sellingPrice: 18000,
      lifecycleStatus: "active",
    });

    expect(product.category).toBe("");
  });

  it("coerces null size to an empty string", () => {
    const product = toMitraProduct({
      id: "c4f88b79-1bed-4cd3-a33a-4b9c0f6a2dd1",
      name: "Keripik Pisang Original",
      category: "Makanan",
      unit: "Pouch",
      size: null,
      sellingPrice: 18000,
      lifecycleStatus: "active",
    });

    expect(product.size).toBe("");
  });

  it("coerces null sellingPrice to zero", () => {
    const product = toMitraProduct({
      id: "c4f88b79-1bed-4cd3-a33a-4b9c0f6a2dd1",
      name: "Keripik Pisang Original",
      category: "Makanan",
      unit: "Pouch",
      size: "100 g",
      sellingPrice: null,
      lifecycleStatus: "active",
    });

    expect(product.sellingPrice).toBe(0);
  });

  it("maps active lifecycle to Aktif and inactive to Nonaktif", () => {
    const active = toMitraProduct({
      id: "6f0c8f9e-9f3b-4c21-b8a5-32d9e1c54a08",
      name: "Kopi Arabika Biji",
      category: null,
      unit: "Gram",
      size: null,
      sellingPrice: null,
      lifecycleStatus: "active",
    });
    const inactive = toMitraProduct({
      id: "6f0c8f9e-9f3b-4c21-b8a5-32d9e1c54a08",
      name: "Kopi Arabika Biji",
      category: null,
      unit: "Gram",
      size: null,
      sellingPrice: null,
      lifecycleStatus: "inactive",
    });

    expect(active.status).toBe("Aktif");
    expect(inactive.status).toBe("Nonaktif");
  });

  it("preserves the real UUID instead of a demo id", () => {
    const uuid = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";
    const product = toMitraProduct({
      id: uuid,
      name: "Sambal Ijo",
      category: "Makanan",
      unit: "Pcs",
      size: "1 pcs",
      sellingPrice: 12500,
      lifecycleStatus: "active",
    });

    expect(product.id).toBe(uuid);
    expect(product.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("formats the selling price with id-ID currency layout", () => {
    expect(formatProductPrice(12500)).toBe("Rp 12.500");
    expect(formatProductPrice(18000)).toBe("Rp 18.000");
    expect(formatProductPrice(0)).toBe("Rp 0");
  });
});
