import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");

describe("Submit notification targeting workspace Admins only", () => {
  it("keeps Admin recipient filtering and request_pending in notifyWorkspaceAdmins", () => {
    expect(source).toContain('getUserRole(user) === "admin" && user.app_metadata?.distributor_id === distributorId');
    expect(source).toContain('recipient_user_id: recipientUserId, distributor_id: distributorId, request_id: requestId, notification_type: "request_pending"');
  });

  it("removes the Distributor recipient from notifyWorkspaceAdmins", () => {
    expect(source).not.toContain("return user.id === distributorId;");
  });
});