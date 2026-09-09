import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");

describe("supplier.adminReview server wiring", () => {
  it("exposes an Admin-only review mutation with approve/reject actions", () => {
    expect(source).toContain('adminReview: supabaseProtectedProcedure');
    expect(source).toContain('action: z.enum(["approve", "reject", "forward"])');
    expect(source).toContain('if (callerRole(ctx) !== "admin")');
    expect(source).toContain('message: "Hanya Administrator yang dapat memproses review pengajuan."');
  });

  it("calls the admin_review_consignment_request RPC with identity-derived tenant scope", () => {
    expect(source).toContain('adminClient.rpc("admin_review_consignment_request"');
    expect(source).toContain("p_request_id: input.requestId");
    expect(source).toContain("p_distributor_id: distributorId");
    expect(source).toContain("p_admin_id: adminId");
    expect(source).toContain("p_action: effectiveAction");
    expect(source).not.toContain("p_distributor_id: input.");
    expect(source).not.toContain("p_admin_id: input.");
  });

  it("maps the legacy forward action to the final Admin approval", () => {
    expect(source).toContain('const effectiveAction = input.action === "forward" ? "approve" : input.action;');
    expect(source).not.toContain('z.enum(["forward", "reject"])');
  });

  it("decides in one stage without forwarding to the Distributor", () => {
    expect(source).not.toContain('notification_type: "awaiting_distributor_decision"');
  });

  it("no longer duplicates the reject notification because the RPC sends it", () => {
    expect(source).not.toContain("rpcResult.mitra_user_id");
    expect(source).not.toContain('notification_type: "request_rejected"');
  });
});