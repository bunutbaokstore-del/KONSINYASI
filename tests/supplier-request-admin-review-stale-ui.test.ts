import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const screen = readFileSync(resolve(process.cwd(), "app/supplier-requests.tsx"), "utf8");
const model = readFileSync(resolve(process.cwd(), "lib/supplier-request-review-model.ts"), "utf8");

describe("supplier request admin review stale-card fix (frontend wiring)", () => {
  it("imports and uses the review model helpers", () => {
    expect(screen).toContain("computeAdminReviewDisplay");
    expect(screen).toContain("filterPendingSupplierRequests");
    expect(screen).toContain("resolveAdminReviewFailure");
    expect(screen).toContain("shouldShowAdminReviewActions(request.status)");
    expect(screen).toContain("supplierRequestStatusLabel(request.status)");
  });

  it("invalidates supplier.requests after the adminReview mutation settles", () => {
    expect(screen).toContain("trpcUtils.supplier.requests.invalidate()");
  });

  it("runs a refetch when the mutation is rejected and reconciles the stale card", () => {
    expect(screen).toContain("const result = await requestsQuery.refetch();");
    expect(screen).toContain("resolveAdminReviewFailure({ adminError, refetchFailed, requests: freshData, requestId });");
    expect(screen).toContain("setNotice(outcome.message)");
  });

  it("keeps the error visible with a retry option when the refetch itself fails", () => {
    expect(screen).toContain("setRetryAvailable(true)");
    expect(screen).toContain('Coba lagi');
  });

  it("does not silently swallow the processed message (friendly notice is rendered)", () => {
    expect(screen).toContain('notice ? <Text style={[styles.noticeText, { color: colors.success }]}>{notice}</Text> : null');
  });

  it("the friendly processed message lives in the shared model", () => {
    expect(model).toContain('PROCESSED_STATUS_MESSAGE = "Status pengajuan telah diperbarui."');
  });

  it("does not keep the stale 'pending' bare ternary for the card actions", () => {
    expect(screen).not.toContain("{showActions && request.status === \"pending\" ? <View style={styles.reviewActions}>");
  });
});