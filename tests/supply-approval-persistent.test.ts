import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "app/supply-approval.tsx"), "utf8");

describe("Persistent Distributor Supplier Request approval UI", () => {
  it("uses persistent requests and review procedures with the exact review payload", () => {
    expect(source).toContain("trpc.supplier.requests.useQuery");
    expect(source).toContain("trpc.supplier.review.useMutation");
    expect(source).toContain("requestId: selected.id");
    expect(source).toContain("decision, reviewNote: reviewNote.trim() || undefined");
    expect(source).not.toContain("approvedQuantity");
    expect(source).not.toContain("reviewerId");
    expect(source).not.toContain("distributorId:");
    expect(source).not.toContain("mitraUserId:");
  });

  it("enforces Distributor-only approval controls while keeping Admin read-only", () => {
    expect(source).toContain('const isDistributor = user?.role === "distributor"');
    expect(source).toContain("const canRead = isDistributor || user?.role === \"admin\"");
    expect(source).toContain("canApprove={isDistributor}");
    expect(source).toContain("if (!selected || !isDistributor) return");
    expect(source).not.toContain('user?.role === "admin" || user?.role === "distributor"');
  });

  it("renders persistent New Item and Stock Change fields without local mapping", () => {
    expect(source).toContain("request.proposedName");
    expect(source).toContain("request.proposedSku");
    expect(source).toContain("request.proposedUnit");
    expect(source).toContain("request.proposedMinimumStock");
    expect(source).toContain("request.itemId");
    expect(source).toContain("Stok Setelah Perubahan");
    expect(source).not.toContain("useMitraSupplyRequests");
    expect(source).not.toContain("useMitraProducts");
    expect(source).not.toContain("reviewMitraSupplyRequest");
    expect(source).not.toContain("products.find");
    expect(source).not.toContain("localStorage");
  });

  it("handles persistent query and mutation states with invalidation/refetch", () => {
    expect(source).toContain("requestsQuery.isLoading");
    expect(source).toContain("requestsQuery.isError");
    expect(source).toContain("Tidak ada pengajuan pending");
    expect(source).toContain("reviewMutation.isPending");
    expect(source).toContain("await utils.supplier.requests.invalidate()");
    expect(source).toContain("await requestsQuery.refetch()");
    expect(source).toContain("setMessage");
    expect(source).toContain("setError");
  });
});
