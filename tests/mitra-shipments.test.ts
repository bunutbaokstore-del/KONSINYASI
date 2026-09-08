import { describe, expect, it } from "vitest";

type ShipmentStatus = "Direncanakan" | "Dikirim" | "Diterima";

type MitraShipment = {
  id: string;
  productId: string;
  quantity: number;
  shipmentDate: string;
  notes: string;
  status: ShipmentStatus;
  receivedDate?: string;
  receivedNotes?: string;
  createdAt: string;
};

type ShipmentDto = {
  id: string;
  distributorId: string;
  mitraUserId: string;
  productId: string;
  consignmentItemId: string;
  quantity: number;
  status: string;
  shipmentDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  shippedAt: string | null;
  receivedAt: string | null;
  receivedBy: string | null;
  receivedNotes: string | null;
};

function toMitraShipment(dto: ShipmentDto): MitraShipment {
  return {
    id: dto.id,
    productId: dto.productId,
    quantity: dto.quantity,
    shipmentDate: dto.shipmentDate,
    notes: dto.notes,
    status: dto.status === "received" ? "Diterima" : dto.status === "shipped" ? "Dikirim" : "Direncanakan",
    receivedDate: dto.receivedAt ? dto.receivedAt.slice(0, 10) : undefined,
    receivedNotes: dto.receivedNotes ?? "",
    createdAt: dto.createdAt,
  };
}

const SHIPMENT_ID = "b3f0d5c1-8a42-4c9e-9d2f-5e7a8b1c3d42";
const PRODUCT_ARABIKA_ID = "6f0c8f9e-9f3b-4c21-b8a5-32d9e1c54a08";

function makeDto(overrides: Partial<ShipmentDto> = {}): ShipmentDto {
  return {
    id: SHIPMENT_ID,
    distributorId: "b7e1a2c3-4d5e-4f6a-8b7c-9d0e1f2a3b4c",
    mitraUserId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    productId: PRODUCT_ARABIKA_ID,
    consignmentItemId: "9c1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    quantity: 25,
    status: "planned",
    shipmentDate: "2026-09-01",
    notes: "Kirim batch pertama",
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
    shippedAt: null,
    receivedAt: null,
    receivedBy: null,
    receivedNotes: null,
    ...overrides,
  };
}

describe("Mitra shipment source", () => {
  it("maps planned status to Direncanakan", () => {
    expect(toMitraShipment(makeDto({ status: "planned" })).status).toBe("Direncanakan");
  });

  it("maps shipped status to Dikirim", () => {
    expect(toMitraShipment(makeDto({ status: "shipped", shippedAt: "2026-09-02T09:00:00.000Z" })).status).toBe("Dikirim");
  });

  it("maps received status to Diterima with received metadata", () => {
    const shipment = toMitraShipment(makeDto({ status: "received", shippedAt: "2026-09-02T09:00:00.000Z", receivedAt: "2026-09-03T14:30:00.000Z", receivedBy: "b7e1a2c3-4d5e-4f6a-8b7c-9d0e1f2a3b4c", receivedNotes: "Diterima lengkap" }));
    expect(shipment.status).toBe("Diterima");
    expect(shipment.receivedDate).toBe("2026-09-03");
    expect(shipment.receivedNotes).toBe("Diterima lengkap");
  });

  it("preserves real UUID ids instead of demo ids", () => {
    const shipment = toMitraShipment(makeDto());
    expect(shipment.id).toBe(SHIPMENT_ID);
    expect(shipment.productId).toBe(PRODUCT_ARABIKA_ID);
    expect(shipment.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("preserves productId, quantity, shipmentDate, and notes", () => {
    const shipment = toMitraShipment(makeDto({ quantity: 40, shipmentDate: "2026-09-04", notes: "Pengiriman minggu terakhir" }));
    expect(shipment.productId).toBe(PRODUCT_ARABIKA_ID);
    expect(shipment.quantity).toBe(40);
    expect(shipment.shipmentDate).toBe("2026-09-04");
    expect(shipment.notes).toBe("Pengiriman minggu terakhir");
  });

  it("is null-safe for receivedAt and omits receivedDate when not received", () => {
    const planned = toMitraShipment(makeDto());
    expect(planned.receivedDate).toBeUndefined();
    expect(planned.receivedNotes).toBe("");

    const shipped = toMitraShipment(makeDto({ status: "shipped", shippedAt: "2026-09-02T09:00:00.000Z" }));
    expect(shipped.receivedDate).toBeUndefined();
    expect(shipped.receivedNotes).toBe("");
  });

  it("formats receivedAt as date-only", () => {
    const shipment = toMitraShipment(makeDto({ status: "received", receivedAt: "2026-09-03T14:30:00.000Z", receivedNotes: "OK" }));
    expect(shipment.receivedDate).toBe("2026-09-03");
  });

  it("coerces receivedNotes null to an empty string", () => {
    const shipment = toMitraShipment(makeDto({ status: "received", receivedAt: "2026-09-03T14:30:00.000Z", receivedNotes: null }));
    expect(shipment.receivedNotes).toBe("");
  });

  it("preserves createdAt exactly", () => {
    const createdAt = "2026-09-05T14:30:00.000Z";
    expect(toMitraShipment(makeDto({ createdAt })).createdAt).toBe(createdAt);
  });

  it("does not leak distributorId, mitraUserId, or consignmentItemId into the view model", () => {
    const shipment = toMitraShipment(makeDto({ status: "received", receivedAt: "2026-09-03T14:30:00.000Z", receivedNotes: "ok" }));
    expect(shipment).not.toHaveProperty("distributorId");
    expect(shipment).not.toHaveProperty("mitraUserId");
    expect(shipment).not.toHaveProperty("consignmentItemId");
  });
});