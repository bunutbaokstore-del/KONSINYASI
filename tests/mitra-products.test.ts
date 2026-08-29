import { describe, expect, it } from "vitest";

import { addMitraProduct, formatProductPrice, getMitraProducts } from "../lib/mitra-products";

describe("Mitra product source", () => {
  it("provides demo products through the shared source", () => {
    const products = getMitraProducts();

    expect(products.length).toBeGreaterThan(0);
    expect(products[0]).toMatchObject({
      name: expect.any(String),
      category: expect.any(String),
      unit: expect.any(String),
      size: expect.any(String),
      sellingPrice: expect.any(Number),
      status: expect.stringMatching(/^(Aktif|Nonaktif)$/),
    });
  });

  it("adds a product to the same source used by consumers", () => {
    const product = addMitraProduct({
      name: "Produk Uji",
      category: "Makanan",
      unit: "Pcs",
      size: "1 pcs",
      sellingPrice: 12500,
      status: "Aktif",
    });

    expect(getMitraProducts()).toContainEqual(product);
    expect(formatProductPrice(product.sellingPrice)).toBe("Rp 12.500");
  });
});
