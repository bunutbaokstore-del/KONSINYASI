import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "app/supplier-requests.tsx"), "utf8");

describe("Supplier Request approval role boundary", () => {
  it("approves only via Admin while Distributor gets a read-only view", () => {
    expect(source).toContain("function AdminReviewView");
    expect(source).toContain("trpc.supplier.adminReview.useMutation()");
    expect(source).toContain("function ManagerReviewView");
    expect(source).toContain("Pantau pengajuan Mitra UMKM");
    expect(source).not.toContain("trpc.supplier.review");
    expect(source).not.toContain("awaiting_distributor_decision");
    expect(source).not.toContain("canReview");
  });

  it("sends persistent approve/reject payload to adminReview", () => {
    expect(source).toContain("adminReviewMutation.mutateAsync(pendingAdmin)");
    expect(source).toContain('action: "approve" | "reject"');
    expect(source).toContain('onAdminAction?: (requestId: string, action: "approve" | "reject") => void');
    expect(source).not.toContain("forward");
    expect(source).not.toContain("reviewerId");
    expect(source).not.toContain("distributorId:");
    expect(source).not.toContain("approvedQuantity");
  });

  it("does not restore legacy Supplier Request helpers", () => {
    expect(source).not.toContain("useMitraSupplyRequests");
    expect(source).not.toContain("saveMitraSupplyRequest");
    expect(source).not.toContain("reviewMitraSupplyRequest");
    expect(source).not.toContain("useMitraProducts");
  });
});