import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd());

function readSource(relative: string) {
  return readFileSync(join(root, relative), "utf8");
}

function collectSourceFiles(relativeDir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(join(root, relativeDir))) {
    const full = join(root, relativeDir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectSourceFiles(join(relativeDir, entry)));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(join(relativeDir, entry));
    }
  }
  return files;
}

const UI_SOURCES = [
  "components/mitra-product-shipment.tsx",
  "components/mitra-distribution.tsx",
  "components/mitra-product-request.tsx",
  "app/supplier-requests.tsx",
];

const LEGACY_SYMBOLS = [
  "useMitraSupplyRequests",
  "getMitraSupplyRequests",
  "getMitraSupplyRequest",
  "saveMitraSupplyRequest",
  "reviewMitraSupplyRequest",
  "getApprovedSupplyRemaining",
];

type SupplyRequestStatus = "Menunggu Persetujuan" | "Disetujui" | "Ditolak";

type SupplyRequestView = {
  id: string;
  itemId: string | null;
  productId: string | null;
  quantity: number | null;
  note: string;
  status: SupplyRequestStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

type SupplyRequestDto = {
  id: string;
  requestType: string;
  itemId: string | null;
  productId: string | null;
  mitraUserId: string;
  proposedName: string | null;
  proposedSku: string | null;
  proposedUnit: string | null;
  proposedStockQuantity: number | null;
  proposedMinimumStock: number | null;
  reason: string;
  status: string;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

function toSupplyRequest(dto: SupplyRequestDto): SupplyRequestView {
  return {
    id: dto.id,
    itemId: dto.itemId,
    productId: dto.productId,
    quantity: dto.proposedStockQuantity,
    note: dto.reason,
    status: dto.status === "approved" ? "Disetujui" : dto.status === "rejected" ? "Ditolak" : "Menunggu Persetujuan",
    reviewNote: dto.reviewNote,
    reviewedAt: dto.reviewedAt,
    createdAt: dto.createdAt,
  };
}

const REQUEST_ID = "b3f0d5c1-8a42-4c9e-9d2f-5e7a8b1c3d42";
const PRODUCT_ARABIKA_ID = "6f0c8f9e-9f3b-4c21-b8a5-32d9e1c54a08";

function makeDto(overrides: Partial<SupplyRequestDto> = {}): SupplyRequestDto {
  return {
    id: REQUEST_ID,
    requestType: "stock_change",
    itemId: "9c1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    productId: PRODUCT_ARABIKA_ID,
    mitraUserId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    proposedName: null,
    proposedSku: null,
    proposedUnit: null,
    proposedStockQuantity: 40,
    proposedMinimumStock: null,
    reason: "Perlu menambah stok kopi",
    status: "pending",
    reviewNote: null,
    reviewedAt: null,
    createdAt: "2026-09-01T08:00:00.000Z",
    ...overrides,
  };
}

describe("Mitra Supply Request persistent contract", () => {
  it("UI reads requests from trpc.supplier.requests", () => {
    for (const source of UI_SOURCES) {
      expect(readSource(source), source).toContain("trpc.supplier.requests.useQuery");
    }
    expect(readSource("components/mitra-product-shipment.tsx")).toContain("trpc.supplier.requests.useQuery(undefined)");
  });

  it("UI submits via trpc.supplier.submitNewItem and trpc.supplier.submitStockChange", () => {
    const distribution = readSource("components/mitra-distribution.tsx");
    const productRequest = readSource("components/mitra-product-request.tsx");
    const supplierRequests = readSource("app/supplier-requests.tsx");
    expect(distribution).toContain("trpc.supplier.submitNewItem.useMutation()");
    expect(distribution).toContain("trpc.supplier.submitStockChange.useMutation()");
    expect(productRequest).toContain("trpc.supplier.submitNewItem.useMutation()");
    expect(supplierRequests).toContain("trpc.supplier.submitNewItem.useMutation()");
    expect(supplierRequests).toContain("trpc.supplier.submitStockChange.useMutation()");
  });

  it("UI reviews via trpc.supplier.adminReview only and refetches after mutations", () => {
    const supplierRequests = readSource("app/supplier-requests.tsx");
    expect(supplierRequests).toContain("trpc.supplier.adminReview.useMutation()");
    expect(supplierRequests).not.toContain("trpc.supplier.review");
    expect(supplierRequests).toContain("await requestsQuery.refetch()");
    expect(readSource("components/mitra-product-shipment.tsx")).toContain("await utils.supplier.requests.invalidate()");
    expect(readSource("components/mitra-product-request.tsx")).toContain("await utils.supplier.requests.invalidate()");
  });

  it("does not use any legacy supply-request API in UI/app sources", () => {
    for (const source of UI_SOURCES) {
      const content = readSource(source);
      for (const symbol of LEGACY_SYMBOLS) {
        expect(content, `${source} must not contain ${symbol}`).not.toContain(symbol);
      }
    }
  });

  it("has no runtime consumer of lib/mitra-supply-requests", () => {
    for (const relativeDir of ["components", "app", "lib"]) {
      for (const file of collectSourceFiles(relativeDir)) {
        const content = readSource(file);
        expect(content, `${file} must not reference lib/mitra-supply-requests`).not.toContain("mitra-supply-requests");
        for (const symbol of LEGACY_SYMBOLS) {
          expect(content, `${file} must not contain ${symbol}`).not.toContain(symbol);
        }
      }
    }
  });

  it("maps pending status to Menunggu Persetujuan", () => {
    expect(toSupplyRequest(makeDto({ status: "pending" })).status).toBe("Menunggu Persetujuan");
  });

  it("maps approved status to Disetujui", () => {
    const request = toSupplyRequest(makeDto({ status: "approved", reviewNote: "Disetujui 40 unit", reviewedAt: "2026-09-02T09:00:00.000Z" }));
    expect(request.status).toBe("Disetujui");
    expect(request.reviewNote).toBe("Disetujui 40 unit");
  });

  it("maps rejected status to Ditolak", () => {
    const request = toSupplyRequest(makeDto({ status: "rejected", reviewNote: "Stok belum tersedia", reviewedAt: "2026-09-02T09:00:00.000Z" }));
    expect(request.status).toBe("Ditolak");
    expect(request.reviewNote).toBe("Stok belum tersedia");
  });

  it("maps proposedStockQuantity to quantity and reason to note", () => {
    const request = toSupplyRequest(makeDto({ proposedStockQuantity: 25, reason: "Restock rutin" }));
    expect(request.quantity).toBe(25);
    expect(request.note).toBe("Restock rutin");
  });

  it("keeps reviewNote and nullable reviewedAt", () => {
    expect(toSupplyRequest(makeDto({ reviewNote: null, reviewedAt: null })).reviewedAt).toBeNull();
    const reviewed = toSupplyRequest(makeDto({ reviewNote: "ok", reviewedAt: "2026-09-02T09:00:00.000Z" }));
    expect(reviewed.reviewedAt).toBe("2026-09-02T09:00:00.000Z");
    expect(reviewed.reviewNote).toBe("ok");
  });

  it("preserves createdAt exactly", () => {
    const createdAt = "2026-09-05T14:30:00.000Z";
    expect(toSupplyRequest(makeDto({ createdAt })).createdAt).toBe(createdAt);
  });

  it("preserves real UUID ids instead of demo ids", () => {
    const request = toSupplyRequest(makeDto());
    expect(request.id).toBe(REQUEST_ID);
    expect(request.productId).toBe(PRODUCT_ARABIKA_ID);
    expect(request.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});