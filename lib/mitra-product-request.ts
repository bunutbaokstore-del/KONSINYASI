export type ProductRequestForm = {
  name: string;
  sku: string;
  unit: string;
  proposedStockQuantity: string;
  proposedMinimumStock: string;
  reason: string;
};

export type ProductRequestPayload = {
  name: string;
  sku: string | null;
  unit: string;
  proposedStockQuantity: number;
  proposedMinimumStock: number;
  reason: string;
};

export const REQUEST_STATUS_LABELS = {
  pending: "Menunggu Persetujuan",
  approved: "Disetujui",
  rejected: "Ditolak",
} as const;

export function validateProductRequest(form: ProductRequestForm): string | null {
  if (!form.name.trim()) return "Nama Produk wajib diisi.";
  if (!form.unit.trim()) return "Unit wajib diisi.";
  const stock = Number(form.proposedStockQuantity);
  if (!Number.isInteger(stock) || stock < 0) return "Stok Awal harus berupa bilangan bulat 0 atau lebih.";
  const minimumStock = Number(form.proposedMinimumStock);
  if (!Number.isInteger(minimumStock) || minimumStock < 0) return "Minimum Stok harus berupa bilangan bulat 0 atau lebih.";
  if (form.reason.trim().length < 3) return "Catatan / Alasan Pengajuan minimal 3 karakter.";
  return null;
}

export function toProductRequestPayload(form: ProductRequestForm): ProductRequestPayload {
  return {
    name: form.name.trim(),
    sku: form.sku.trim() || null,
    unit: form.unit.trim(),
    proposedStockQuantity: Number(form.proposedStockQuantity),
    proposedMinimumStock: Number(form.proposedMinimumStock),
    reason: form.reason.trim(),
  };
}
