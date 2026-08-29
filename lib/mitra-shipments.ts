import { useSyncExternalStore } from "react";
import type { MitraProduction } from "./mitra-productions";
import { getMitraProductionStock } from "./mitra-production-stock";
import type { MitraProduct } from "./mitra-products";
import { getApprovedSupplyRemaining, getMitraSupplyRequest } from "./mitra-supply-requests";

export type ShipmentStatus = "Direncanakan" | "Dikirim" | "Diterima";
export type MitraShipment = { id: string; distributorName: string; productId: string; supplyRequestId: string; quantity: number; shipmentDate: string; notes: string; status: ShipmentStatus; receivedDate?: string; receivedNotes?: string; createdAt: string };
export type NewMitraShipment = Omit<MitraShipment, "id" | "createdAt" | "status">;
let shipments: MitraShipment[] = [];
const listeners = new Set<() => void>();
function emitChange() { listeners.forEach((listener) => listener()); }
function subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
export function getMitraShipments() { return shipments; }
export function useMitraShipments() { return useSyncExternalStore(subscribe, getMitraShipments, getMitraShipments); }
export function getAvailableStock(products: MitraProduct[], productions: MitraProduction[], productId: string) {
  const stock = getMitraProductionStock(products, productions).find((item) => item.productId === productId)?.availableStock ?? 0;
  const committed = shipments.filter((shipment) => shipment.productId === productId && shipment.status !== "Direncanakan").reduce((sum, shipment) => sum + shipment.quantity, 0);
  return Math.max(0, stock - committed);
}
export function saveMitraShipment(input: NewMitraShipment, products: MitraProduct[], productions: MitraProduction[]) {
  if (!input.distributorName.trim()) throw new Error("Pilih distributor terlebih dahulu.");
  if (!input.supplyRequestId) throw new Error("Pilih pengajuan supply yang disetujui terlebih dahulu.");
  const request = getMitraSupplyRequest(input.supplyRequestId);
  if (!request || request.status !== "Disetujui" || request.productId !== input.productId) throw new Error("Pengiriman hanya dapat dibuat dari pengajuan Supply yang Disetujui.");
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error("Jumlah dikirim harus lebih besar dari 0.");
  if (input.quantity > getApprovedSupplyRemaining(input.supplyRequestId, shipments)) throw new Error("Jumlah dikirim melebihi jumlah yang disetujui.");
  if (input.quantity > getAvailableStock(products, productions, input.productId)) throw new Error("Jumlah dikirim melebihi stok tersedia.");
  const shipment: MitraShipment = { ...input, distributorName: input.distributorName.trim(), id: `shipment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, status: "Direncanakan", createdAt: new Date().toISOString() };
  shipments = [shipment, ...shipments]; emitChange(); return shipment;
}
export function updateMitraShipmentStatus(id: string, status: ShipmentStatus, products: MitraProduct[], productions: MitraProduction[], receiving?: { receivedDate: string; receivedNotes: string }) {
  const current = shipments.find((shipment) => shipment.id === id);
  if (!current) return undefined;
  if (status === "Dikirim" && current.status !== "Direncanakan") throw new Error("Pengiriman hanya dapat dikirim dari status Direncanakan.");
  if (status === "Dikirim" && current.quantity > getAvailableStock(products, productions, current.productId)) throw new Error("Stok tersedia tidak mencukupi untuk pengiriman ini.");
  if (status === "Diterima" && current.status !== "Dikirim") throw new Error("Hanya pengiriman berstatus Dikirim yang dapat diterima.");
  const updated = { ...current, status, ...(status === "Diterima" ? { receivedDate: receiving?.receivedDate ?? new Date().toISOString().slice(0, 10), receivedNotes: receiving?.receivedNotes ?? "" } : {}) };
  shipments = shipments.map((shipment) => shipment.id === id ? updated : shipment); emitChange(); return updated;
}
