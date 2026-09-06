import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "app/supplier-requests.tsx"), "utf8");

describe("Supplier Request approval role boundary", () => {
  it("passes review capability only for Distributor and keeps Admin on persistent read access", () => {
    expect(source).toContain('canReview={role === "distributor"}');
    expect(source).toContain("function ManagerReviewView({ colors, requestsQuery, onBack, canReview }");
    expect(source).toContain("showActions={canReview}");
    expect(source).toContain("if (!canReview) return;");
    expect(source).toContain("trpc.supplier.requests.useQuery");
  });

  it("keeps persistent review mutation and exact payload unchanged", () => {
    expect(source).toContain("trpc.supplier.review.useMutation()");
    expect(source).toContain("reviewMutation.mutateAsync(pendingReview)");
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
