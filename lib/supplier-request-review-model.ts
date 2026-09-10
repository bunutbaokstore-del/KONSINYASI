export const PENDING_REVIEW_STATUS = "pending";

export const PROCESSED_STATUS_MESSAGE = "Status pengajuan telah diperbarui.";

export const DEFAULT_REVIEW_ERROR = "Pengajuan belum dapat diproses.";

export type AdminReviewFailureOutcome =
  | { kind: "processed"; message: string; refetchFailed: boolean }
  | { kind: "refetchFailed"; message: string; refetchFailed: true }
  | { kind: "unchanged"; message: string; refetchFailed: false };

export function requestErrorMessage(error: unknown, fallback: string = DEFAULT_REVIEW_ERROR): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export function supplierRequestStatusLabel(status: string): string {
  if (status === "approved") return "Disetujui";
  if (status === "rejected") return "Ditolak";
  return "Menunggu";
}

export function shouldShowAdminReviewActions(status: string): boolean {
  return status === PENDING_REVIEW_STATUS;
}

export function filterPendingSupplierRequests<T extends { id: string; status: string }>(requests: readonly T[]): T[] {
  return requests.filter((request) => request.status === PENDING_REVIEW_STATUS);
}

export function computeAdminReviewDisplay<T extends { id: string; status: string }>(
  requests: readonly T[],
  focusedId?: string | null,
): T[] {
  if (focusedId && requests.some((request) => request.id === focusedId && request.status === PENDING_REVIEW_STATUS)) {
    return requests.filter((request) => request.id === focusedId);
  }
  return filterPendingSupplierRequests(requests);
}

export function resolveAdminReviewFailure(input: {
  adminError: unknown;
  refetchFailed: boolean;
  requests: readonly { id: string; status: string }[];
  requestId: string;
}): AdminReviewFailureOutcome {
  const fallback = requestErrorMessage(input.adminError);
  if (input.refetchFailed) return { kind: "refetchFailed", message: fallback, refetchFailed: true };
  const updated = input.requests.find((request) => request.id === input.requestId);
  if (updated && updated.status !== PENDING_REVIEW_STATUS) {
    return { kind: "processed", message: PROCESSED_STATUS_MESSAGE, refetchFailed: false };
  }
  return { kind: "unchanged", message: fallback, refetchFailed: false };
}