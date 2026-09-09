import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");

describe("supplier.review distributes no approval authority", () => {
  it("keeps the review procedure accepting old callers but always refuses them", () => {
    const reviewBlock = source.split("review: distributorProcedure")[1]?.split("adminReview: supabaseProtectedProcedure")[0];
    expect(reviewBlock).toBeTruthy();
    expect(reviewBlock).toContain('code: "FORBIDDEN"');
    expect(reviewBlock).toContain("Keputusan pengajuan kini menjadi kewenangan Administrator.");
    expect(reviewBlock).not.toContain("review_consignment_request");
  });

  it("removed the two-stage RPC call and its state strings", () => {
    expect(source).not.toContain('.rpc("review_consignment_request"');
    expect(source).not.toContain("Pengajuan masih menunggu review Administrator.");
    expect(source).not.toContain("reviewed by an admin");
  });
});