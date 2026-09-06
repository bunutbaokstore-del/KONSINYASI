import { describe, expect, it } from "vitest";
import { getDistributorId, getUserRole } from "../server/supabase-admin";
import { isDistributorRole } from "../server/_core/trpc";

type TestUser = {
  id: string;
  app_metadata: Record<string, string>;
  user_metadata: Record<string, string>;
};

const distributorId = "11111111-1111-4111-8111-111111111111";
const anotherDistributorId = "22222222-2222-4222-8222-222222222222";

function user(role: string, id: string, scope?: string): TestUser {
  return {
    id,
    app_metadata: { role, ...(scope ? { distributor_id: scope } : {}) },
    user_metadata: {},
  };
}

describe("supplier review authorization", () => {
  it("allows an authenticated Distributor identity", () => {
    const distributor = user("distributor", distributorId) as any;
    expect(isDistributorRole(distributor)).toBe(true);
    expect(getUserRole(distributor)).toBe("distributor");
    expect(getDistributorId(distributor)).toBe(distributorId);
  });

  it("denies Admin", () => {
    const admin = user("admin", "33333333-3333-4333-8333-333333333333", distributorId) as any;
    expect(isDistributorRole(admin)).toBe(false);
  });

  it("denies Mitra", () => {
    const mitra = user("mitra_umkm", "44444444-4444-4444-8444-444444444444", distributorId) as any;
    expect(isDistributorRole(mitra)).toBe(false);
  });

  it("denies sys_admin", () => {
    const sysAdmin = user("sys_admin", "55555555-5555-4555-8555-555555555555") as any;
    expect(isDistributorRole(sysAdmin)).toBe(false);
    expect(getDistributorId(sysAdmin)).toBeNull();
  });

  it("uses authenticated Distributor identity instead of a supplied tenant scope", () => {
    const distributor = user("distributor", anotherDistributorId, distributorId) as any;
    expect(isDistributorRole(distributor)).toBe(true);
    expect(getDistributorId(distributor)).toBe(anotherDistributorId);
  });
});