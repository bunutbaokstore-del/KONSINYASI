import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");

describe("supplier approval distributes no review authority", () => {
  it("removed the legacy two-stage supplier.review procedure entirely", () => {
    expect(source).not.toContain("review: distributorProcedure");
    expect(source).not.toContain("Keputusan pengajuan kini menjadi kewenangan Administrator.");
  });

  it("keeps the Admin decision procedure as the only review entry point", () => {
    expect(source).toContain("adminReview: supabaseProtectedProcedure");
    expect(source).toContain('adminClient.rpc("admin_review_consignment_request"');
  });

  it("removed the two-stage RPC call and its state strings", () => {
    expect(source).not.toContain('.rpc("review_consignment_request"');
    expect(source).not.toContain("Pengajuan masih menunggu review Administrator.");
    expect(source).not.toContain("reviewed by an admin");
  });
});