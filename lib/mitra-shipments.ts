import { trpc } from "./trpc";

export type ShipmentStatus = "Direncanakan" | "Dikirim" | "Diterima";
export type MitraShipment = { id: string; productId: string; quantity: number; shipmentDate: string; notes: string; status: ShipmentStatus; receivedDate?: string; receivedNotes?: string; createdAt: string };

type MitraShipmentDto = {
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

function toMitraShipment(dto: MitraShipmentDto): MitraShipment {
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

export function useMitraShipments() {
  const query = trpc.mitraShipments.list.useQuery(undefined);
  return (query.data ?? []).map(toMitraShipment);
}