import { describe, expect, it } from "vitest";

import { getAvailableStock, getMitraShipments, saveMitraShipment, updateMitraShipmentStatus } from "../lib/mitra-shipments";
import type { MitraProduction } from "../lib/mitra-productions";
import type { MitraProduct } from "../lib/mitra-products";

const products: MitraProduct[] = [{ id: "kopi", name: "Kopi Bubuk", category: "Minuman", unit: "Pouch", size: "150 g", sellingPrice: 25000, status: "Aktif" }];
const productions: MitraProduction[] = [{ id: "done", productId: "kopi", productionDate: "2026-08-29", budgetPeriod: "Bulan", targetQuantity: 100, actualQuantity: 100, damagedQuantity: 0, yieldPercentage: 100, notes: "", resultNotes: "", status: "Selesai", createdAt: "2026-08-29T00:00:00.000Z" }];

describe("Mitra shipments", () => {
  it("saves a planned shipment from Master Product stock and reduces available stock when sent", () => {
    const shipment = saveMitraShipment({ distributorName: "Distributor Nusantara", productId: "kopi", quantity: 25, shipmentDate: "2026-08-29", notes: "Kirim batch pertama" }, products, productions);
    expect(shipment).toMatchObject({ productId: "kopi", quantity: 25, status: "Direncanakan" });
    expect(getAvailableStock(products, productions, "kopi")).toBe(100);
    const sent = updateMitraShipmentStatus(shipment.id, "Dikirim", products, productions);
    expect(sent?.status).toBe("Dikirim");
    expect(getAvailableStock(products, productions, "kopi")).toBe(75);
    expect(getMitraShipments()).toContainEqual(sent);
  });

  it("rejects shipments above available stock and supports Diterima", () => {
    expect(() => saveMitraShipment({ distributorName: "Distributor Lokal", productId: "kopi", quantity: 101, shipmentDate: "2026-08-29", notes: "" }, products, productions)).toThrow("melebihi stok tersedia");
    const planned = saveMitraShipment({ distributorName: "Distributor Lokal", productId: "kopi", quantity: 10, shipmentDate: "2026-08-29", notes: "" }, products, productions);
    expect(updateMitraShipmentStatus(planned.id, "Diterima", products, productions)?.status).toBe("Diterima");
  });
});
