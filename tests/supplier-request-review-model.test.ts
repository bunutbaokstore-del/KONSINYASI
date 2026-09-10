import { describe, expect, it } from "vitest";
import {
  computeAdminReviewDisplay,
  filterPendingSupplierRequests,
  requestErrorMessage,
  resolveAdminReviewFailure,
  shouldShowAdminReviewActions,
  supplierRequestStatusLabel,
} from "../lib/supplier-request-review-model";

type Request = { id: string; status: string };

const pendingRequest: Request = { id: "req-1", status: "pending" };
const approvedRequest: Request = { id: "req-2", status: "approved" };
const rejectedRequest: Request = { id: "req-3", status: "rejected" };

describe("supplier request review model", () => {
  it("maps status to the same labels used by the card UI", () => {
    expect(supplierRequestStatusLabel("approved")).toBe("Disetujui");
    expect(supplierRequestStatusLabel("rejected")).toBe("Ditolak");
    expect(supplierRequestStatusLabel("pending")).toBe("Menunggu");
    expect(supplierRequestStatusLabel("awaiting_distributor_decision")).toBe("Menunggu");
  });

  it("only the pending status shows Tolak/Setujui actions", () => {
    expect(shouldShowAdminReviewActions("pending")).toBe(true);
    expect(shouldShowAdminReviewActions("approved")).toBe(false);
    expect(shouldShowAdminReviewActions("rejected")).toBe(false);
    expect(shouldShowAdminReviewActions("awaiting_distributor_decision")).toBe(false);
  });

  it("filters the active review list to pending requests only", () => {
    const requests: Request[] = [pendingRequest, approvedRequest, rejectedRequest];
    expect(filterPendingSupplierRequests(requests)).toEqual([pendingRequest]);
  });

  it("pending + approve refetch: approved request leaves the active list and hides actions", () => {
    const before: Request[] = [pendingRequest, approvedRequest];
    expect(computeAdminReviewDisplay(before)).toEqual([pendingRequest]);

    const afterRefetch: Request[] = [
      { ...pendingRequest, status: "approved" },
      approvedRequest,
    ];
    expect(computeAdminReviewDisplay(afterRefetch)).toEqual([]);
    expect(shouldShowAdminReviewActions("approved")).toBe(false);
    expect(supplierRequestStatusLabel("approved")).toBe("Disetujui");
  });

  it("when the focused request is resolved it disappears from the active display", () => {
    const afterRefetch: Request[] = [{ ...pendingRequest, status: "rejected" }];
    expect(computeAdminReviewDisplay(afterRefetch, "req-1")).toEqual([]);
    expect(supplierRequestStatusLabel("rejected")).toBe("Ditolak");
  });

  it("keeps a focused pending request visible while it is still pending", () => {
    const requests: Request[] = [pendingRequest, approvedRequest];
    expect(computeAdminReviewDisplay(requests, "req-1")).toEqual([pendingRequest]);
  });
});

describe("resolveAdminReviewFailure after a rejected approval", () => {
  it("already-processed: refetch runs and a non-pending status yields the friendly message", () => {
    const alreadyProcessed = new Error("Pengajuan ini sudah diproses.");
    const outcome = resolveAdminReviewFailure({
      adminError: alreadyProcessed,
      refetchFailed: false,
      requests: [{ id: "req-1", status: "approved" }],
      requestId: "req-1",
    });
    expect(outcome).toMatchObject({ kind: "processed", message: "Status pengajuan telah diperbarui.", refetchFailed: false });
  });

  it("already-processed on a rejected row also yields the friendly message", () => {
    const outcome = resolveAdminReviewFailure({
      adminError: new Error("Pengajuan ini sudah diproses."),
      refetchFailed: false,
      requests: [{ id: "req-1", status: "rejected" }],
      requestId: "req-1",
    });
    expect(outcome).toMatchObject({ kind: "processed", message: "Status pengajuan telah diperbarui." });
  });

  it("refetch failure keeps the original error visible (refetchFailed outcome)", () => {
    const adminError = new Error("Pengajuan ini sudah diproses.");
    const outcome = resolveAdminReviewFailure({
      adminError,
      refetchFailed: true,
      requests: [],
      requestId: "req-1",
    });
    expect(outcome).toMatchObject({ kind: "refetchFailed", message: "Pengajuan ini sudah diproses.", refetchFailed: true });
  });

  it("refetch success but the request is still pending: original error stays visible", () => {
    const adminError = new Error("Pengajuan ini sudah diproses.");
    const outcome = resolveAdminReviewFailure({
      adminError,
      refetchFailed: false,
      requests: [{ id: "req-1", status: "pending" }],
      requestId: "req-1",
    });
    expect(outcome).toMatchObject({ kind: "unchanged", message: "Pengajuan ini sudah diproses." });
  });

  it("refetch success but the request is missing from the list: original error stays visible", () => {
    const outcome = resolveAdminReviewFailure({
      adminError: new Error("Pengajuan ini sudah diproses."),
      refetchFailed: false,
      requests: [approvedRequest],
      requestId: "req-1",
    });
    expect(outcome).toMatchObject({ kind: "unchanged", message: "Pengajuan ini sudah diproses." });
  });

  it("falls back to a default message for non-Error errors", () => {
    expect(requestErrorMessage("boom")).toBe("Pengajuan belum dapat diproses.");
    expect(requestErrorMessage(new Error())).toBe("Pengajuan belum dapat diproses.");
  });
});