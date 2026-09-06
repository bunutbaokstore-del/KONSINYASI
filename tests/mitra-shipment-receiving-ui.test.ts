import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "components/mitra-shipment-receiving.tsx"), "utf8");

describe("Mitra Shipment Receiving persistent read-only UI contract", () => {
  it("uses persistent shipment READ as the source of truth", () => {
    expect(source).toContain("trpc.mitraShipments.list.useQuery()");
    expect(source).not.toContain("useMitraShipments");
    expect(source).not.toContain("getMitraShipments");
  });

  it("does not expose a Mitra receiving mutation", () => {
    expect(source).not.toContain("updateMitraShipmentStatus");
    expect(source).not.toContain("distributorReceiving.receive");
    expect(source).not.toContain("Simpan Penerimaan");
    expect(source).not.toContain("receivedDate");
    expect(source).not.toContain("receivedNotes, setReceivedNotes");
  });

  it("renders persistent loading, error, empty, status, and receiving metadata states", () => {
    expect(source).toContain("shipmentsQuery.isLoading");
    expect(source).toContain("shipmentsQuery.isError");
    expect(source).toContain("Belum ada riwayat pengiriman.");
    expect(source).toContain("STATUS_LABELS");
    expect(source).toContain("shipment.receivedAt");
    expect(source).toContain("shipment.receivedNotes");
  });
});
