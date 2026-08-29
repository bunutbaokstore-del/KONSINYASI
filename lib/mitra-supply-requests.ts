import { useSyncExternalStore } from "react";
import type { MitraProduct } from "./mitra-products";

export type SupplyRequestStatus = "Menunggu Persetujuan" | "Disetujui" | "Ditolak";
export type MitraSupplyRequest = {
  id: string;
  productId: string;
  quantity: number;
  approvedQuantity: number | null;
  status: SupplyRequestStatus;
  note: string;
  reviewNote: string;
  createdAt: string;
  reviewedAt?: string;
};

let requests: MitraSupplyRequest[] = [];
const listeners = new Set<() => void>();
function emitChange() { listeners.forEach((listener) => listener()); }
function subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
export function getMitraSupplyRequests() { return requests; }
export function useMitraSupplyRequests() { return useSyncExternalStore(subscribe, getMitraSupplyRequests, getMitraSupplyRequests); }
export function getMitraSupplyRequest(id: string) { return requests.find((request) => request.id === id); }
export function saveMitraSupplyRequest(input: { productId: string; quantity: number; note?: string }, products: MitraProduct[]) {
  if (!products.some((product) => product.id === input.productId)) throw new Error("Produk tidak ditemukan di Master Produk.");
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error("Jumlah supply harus lebih besar dari 0.");
  const request: MitraSupplyRequest = { id: `supply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, productId: input.productId, quantity: input.quantity, approvedQuantity: null, status: "Menunggu Persetujuan", note: input.note?.trim() ?? "", reviewNote: "", createdAt: new Date().toISOString() };
  requests = [request, ...requests]; emitChange(); return request;
}
export function reviewMitraSupplyRequest(id: string, decision: "approved" | "rejected", approvedQuantity?: number, reviewNote = "") {
  const current = requests.find((request) => request.id === id);
  if (!current) throw new Error("Pengajuan supply tidak ditemukan.");
  if (current.status !== "Menunggu Persetujuan") throw new Error("Pengajuan supply sudah diproses.");
  if (decision === "approved" && (!Number.isFinite(approvedQuantity) || (approvedQuantity ?? 0) <= 0 || (approvedQuantity ?? 0) > current.quantity)) throw new Error("Jumlah disetujui harus lebih besar dari 0 dan tidak melebihi jumlah supply.");
  const updated = { ...current, status: decision === "approved" ? "Disetujui" as const : "Ditolak" as const, approvedQuantity: decision === "approved" ? approvedQuantity ?? current.quantity : null, reviewNote: reviewNote.trim(), reviewedAt: new Date().toISOString() };
  requests = requests.map((request) => request.id === id ? updated : request); emitChange(); return updated;
}
export function getApprovedSupplyRemaining(requestId: string, shipments: readonly { supplyRequestId?: string; quantity: number }[]) {
  const request = requests.find((item) => item.id === requestId);
  if (!request || request.status !== "Disetujui") return 0;
  const sent = shipments.filter((shipment) => shipment.supplyRequestId === requestId).reduce((sum, shipment) => sum + shipment.quantity, 0);
  return Math.max(0, (request.approvedQuantity ?? 0) - sent);
}
