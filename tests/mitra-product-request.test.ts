import { describe, expect, it } from "vitest";
import { REQUEST_STATUS_LABELS, toProductRequestPayload, validateProductRequest, type ProductRequestForm } from "../lib/mitra-product-request";

const validForm: ProductRequestForm = {
  name: "  Sambal Ijo  ",
  sku: " SBL-001 ",
  unit: "pcs",
  proposedStockQuantity: "100",
  proposedMinimumStock: "10",
  reason: "Permintaan produk baru dari Mitra.",
};

describe("Mitra product request flow", () => {
  it("validates the required form fields", () => {
    expect(validateProductRequest({ ...validForm, name: "" })).toBe("Nama Produk wajib diisi.");
    expect(validateProductRequest({ ...validForm, unit: "" })).toBe("Unit wajib diisi.");
    expect(validateProductRequest({ ...validForm, proposedStockQuantity: "1.5" })).toContain("Stok Awal");
    expect(validateProductRequest({ ...validForm, proposedMinimumStock: "-1" })).toContain("Minimum Stok");
    expect(validateProductRequest({ ...validForm, reason: "no" })).toContain("Catatan");
  });

  it("creates the existing submitNewItem payload without a tenant id", () => {
    expect(toProductRequestPayload(validForm)).toEqual({
      name: "Sambal Ijo",
      sku: "SBL-001",
      unit: "pcs",
      proposedStockQuantity: 100,
      proposedMinimumStock: 10,
      reason: "Permintaan produk baru dari Mitra.",
    });
    expect(toProductRequestPayload({ ...validForm, sku: "   " }).sku).toBeNull();
  });

  it("keeps pending, approved, and rejected history labels distinct", () => {
    expect(REQUEST_STATUS_LABELS.pending).toBe("Menunggu Persetujuan");
    expect(REQUEST_STATUS_LABELS.approved).toBe("Disetujui");
    expect(REQUEST_STATUS_LABELS.rejected).toBe("Ditolak");
  });

  it("supports rejected revision as a separate new request payload", () => {
    const revision = toProductRequestPayload({ ...validForm, name: "Sambal Ijo Revisi" });
    expect(revision.name).toBe("Sambal Ijo Revisi");
    expect(revision).not.toHaveProperty("requestId");
    expect(revision).not.toHaveProperty("status");
  });
});
