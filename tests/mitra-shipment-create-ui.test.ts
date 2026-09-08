import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "components/mitra-product-shipment.tsx"), "utf8");

describe("Mitra Shipment persistent Create UI contract", () => {
  it("uses the persistent approved-request query and Create mutation", () => {
    expect(source).toContain("trpc.supplier.requests.useQuery(undefined)");
    expect(source).toContain("trpc.mitraShipments.create.useMutation()");
    expect(source).toContain("await createShipment.mutateAsync({");
    expect(source).toContain("productId: selectedApprovedRequest.productId");
    expect(source).toContain("consignmentItemId: selectedApprovedRequest.itemId");
    expect(source).not.toContain("consignmentItemId: supplyRequestId");
  });

  it("blocks missing persistent item identity without creating a local shipment", () => {
    expect(source).toContain("if (!selectedApprovedRequest?.itemId)");
    expect(source).toContain("Pengajuan disetujui belum memiliki Consignment Item yang valid.");
    expect(source).not.toContain("saveMitraShipment");
  });

  it("keeps Shipment READ persistent and removes the legacy status mutation", () => {
    expect(source).toContain("trpc.mitraShipments.list.useQuery()");
    expect(source).toContain("PERSISTENT_STATUS_LABELS");
    expect(source).not.toContain("updateMitraShipmentStatus");
    expect(source).not.toContain("ship_mitra_shipment");
    expect(source).not.toContain("availableStock - quantity");
  });

  it("refreshes persistent shipment/request queries after successful Create", () => {
    expect(source).toContain("await shipmentQuery.refetch()");
    expect(source).toContain("await utils.supplier.requests.invalidate()");
    expect(source).toContain("createShipment.isPending");
  });

  it("reads stock from persistent mitraProductionStock.list instead of local store", () => {
    expect(source).toContain("trpc.mitraProductionStock.list.useQuery()");
    expect(source).toContain("stockQuery.data?.find((row) => row.productId === productId)?.availableQuantity ?? 0");
    expect(source).not.toContain("getAvailableStock");
    expect(source).not.toContain("availableStock - quantity");
    expect(source).not.toContain("availableStock -=");
  });

  it("uses the persistent Ship mutation with stock invalidate and no Diterima action for Mitra", () => {
    expect(source).toContain("trpc.mitraShipments.ship.useMutation()");
    expect(source).toContain("await shipMutation.mutateAsync({ shipmentId: id })");
    expect(source).toContain("shipment.status === \"planned\"");
    expect(source).toContain("await utils.mitraProductionStock.list.invalidate()");
    expect(source).not.toContain("updateMitraShipmentStatus");
    expect(source).not.toContain("receive_mitra_shipment");
    expect(source).not.toContain("DISTRIBUTORS");
  });
});