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

  it("invalidates the product catalog queries used by Katalog Produk after approval", () => {
    expect(screen).toContain("trpcUtils.products.list.invalidate()");
    expect(screen).toContain("trpcUtils.hpp.list.invalidate()");
    expect(screen).toContain("trpcUtils.mitraDashboard.stock.invalidate()");
  });

  it("calls the catalog invalidation right after a successful approval", () => {
    const normalized = screen.replace(/\s+/g, " ");
    expect(normalized).toContain("setPendingAdmin(null); await invalidateRequests(); await invalidateCatalogQueries();");
  });

  it("refreshes the catalog when the card turned out to be already processed", () => {
    const normalized = screen.replace(/\s+/g, " ");
    expect(normalized).toContain("outcome.kind === \"processed\") { await invalidateRequests(); await invalidateCatalogQueries(); setNotice(outcome.message); }");
  });

  it("treats an unchanged outcome after P0001 as already processed (no stale red banner)", () => {
    const normalized = screen.replace(/\s+/g, " ");
    expect(normalized).toContain("outcome.kind === \"unchanged\") { await invalidateRequests(); await invalidateCatalogQueries(); setNotice(PROCESSED_STATUS_MESSAGE); }");
    expect(screen).toContain("PROCESSED_STATUS_MESSAGE");
  });

  it("clears stale error/notice once the request list delivers fresh data", () => {
    const normalized = screen.replace(/\s+/g, " ");
    expect(normalized).toContain("requestDataRef.current = (requestsQuery.data ?? []) as SupplierRequest[];");
    expect(normalized).toContain("if (requestsQuery.data && requestsQuery.data !== requestDataRef.current) { setError(null); setNotice(null); setRetryAvailable(false); }");
  });

  it("does not show approve/reject actions for a request that is no longer pending", () => {
    expect(screen).toContain("showActions && shouldShowAdminReviewActions(request.status) ? <View style={styles.reviewActions}>");
    expect(screen).toContain("computeAdminReviewDisplay(allRequests, focusedId)");
  });

  it("performs no optimistic update after an approval", () => {
    expect(screen).not.toMatch(/setData\(/);
    expect(screen).not.toMatch(/cancelQueries\(/);
  });

  it("keeps approve and reject as the only admin actions", () => {
    expect(screen).toContain('pendingAdmin?.action === "approve" ? "Setujui" : "Tolak"');
    expect(screen).not.toContain('"forward"');
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