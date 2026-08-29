import { describe, expect, it } from "vitest";
import { getApprovedSupplyRemaining, reviewMitraSupplyRequest, saveMitraSupplyRequest } from "../lib/mitra-supply-requests";
import type { MitraProduct } from "../lib/mitra-products";

const products: MitraProduct[] = [{ id: "kopi", name: "Kopi Bubuk", category: "Minuman", unit: "Pouch", size: "150 g", sellingPrice: 25000, status: "Aktif" }];

describe("Mitra supply requests", () => {
  it("saves a pending request from Master Produk without changing stock", () => {
    const request = saveMitraSupplyRequest({ productId: "kopi", quantity: 40 }, products);
    expect(request).toMatchObject({ productId: "kopi", quantity: 40, approvedQuantity: null, status: "Menunggu Persetujuan" });
  });
  it("supports approval and rejection with remaining approved quantity", () => {
    const approved = saveMitraSupplyRequest({ productId: "kopi", quantity: 20 }, products);
    expect(reviewMitraSupplyRequest(approved.id, "approved", 15).status).toBe("Disetujui");
    expect(getApprovedSupplyRemaining(approved.id, [{ supplyRequestId: approved.id, quantity: 5 }])).toBe(10);
    const rejected = saveMitraSupplyRequest({ productId: "kopi", quantity: 10 }, products);
    expect(reviewMitraSupplyRequest(rejected.id, "rejected").status).toBe("Ditolak");
    expect(getApprovedSupplyRemaining(rejected.id, [])).toBe(0);
  });
  it("rejects approval above the requested quantity", () => {
    const request = saveMitraSupplyRequest({ productId: "kopi", quantity: 10 }, products);
    expect(() => reviewMitraSupplyRequest(request.id, "approved", 11)).toThrow("tidak melebihi jumlah supply");
  });
});
