import { describe, expect, it } from "vitest";
import { getDistributorId, getUserRole } from "../server/supabase-admin";
import { displayRoleLabel, platformRoleFromMetadata } from "../shared/auth";

describe("KONSINYASI Sysadmin authorization rules", () => {
  it("recognizes sys_admin as a platform role", () => {
    expect(platformRoleFromMetadata("sys_admin")).toBe("sys_admin");
    expect(platformRoleFromMetadata("distributor")).toBeNull();
    expect(platformRoleFromMetadata(undefined)).toBeNull();
  });
  it("uses the platform label instead of the tenant Distributor label", () => {
    expect(displayRoleLabel("distributor", "sys_admin")).toBe("Sysadmin");
    expect(displayRoleLabel("distributor", null)).toBe("Distributor");
  });

  it("recognizes sys_admin only from app_metadata", () => {
    const appMetadataUser = {
      id: "11111111-1111-1111-1111-111111111111",
      app_metadata: {
        role: "sys_admin",
      },
      user_metadata: {},
    } as any;

    const userMetadataOnlyUser = {
      id: "22222222-2222-2222-2222-222222222222",
      app_metadata: {},
      user_metadata: {
        role: "sys_admin",
      },
    } as any;

    expect(appMetadataUser.app_metadata.role).toBe("sys_admin");
    expect(userMetadataOnlyUser.app_metadata.role).not.toBe("sys_admin");
  });

  it("does not assign distributor scope to sys_admin", () => {
    const sysAdmin = {
      id: "11111111-1111-1111-1111-111111111111",
      app_metadata: {
        role: "sys_admin",
      },
      user_metadata: {
        distributor_id: "should-not-be-used",
      },
    } as any;

    expect(getDistributorId(sysAdmin)).toBeNull();
  });

  it("keeps tenant distributor scope for normal tenant users", () => {
    const admin = {
      id: "33333333-3333-4333-8333-333333333333",
      app_metadata: {
        role: "admin",
        distributor_id: "44444444-4444-4444-8444-444444444444",
      },
      user_metadata: {},
    } as any;

    expect(getDistributorId(admin)).toBe(
      "44444444-4444-4444-8444-444444444444",
    );
  });

  it("never uses user_metadata.role as backend authority", () => {
    const user = {
      id: "55555555-5555-4555-8555-555555555555",
      app_metadata: {},
      user_metadata: { role: "sys_admin" },
    } as any;

    expect(getUserRole(user)).toBeNull();
  });

  it("never uses user_metadata.distributor_id as tenant scope", () => {
    const user = {
      id: "66666666-6666-4666-8666-666666666666",
      app_metadata: { role: "admin" },
      user_metadata: {
        distributor_id: "77777777-7777-4777-8777-777777777777",
      },
    } as any;

    expect(getDistributorId(user)).toBeNull();
  });

  it("rejects invalid app_metadata distributor_id", () => {
    const user = {
      id: "88888888-8888-4888-8888-888888888888",
      app_metadata: { role: "mitra_umkm", distributor_id: "not-a-uuid" },
    } as any;

    expect(getDistributorId(user)).toBeNull();
  });

  it("does not fall back to user.id for a tenant role without scope", () => {
    const user = {
      id: "99999999-9999-4999-8999-999999999999",
      app_metadata: { role: "admin" },
    } as any;

    expect(getDistributorId(user)).toBeNull();
  });

  it("accepts valid app_metadata authority", () => {
    const user = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      app_metadata: {
        role: "mitra_umkm",
        distributor_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
    } as any;

    expect(getUserRole(user)).toBe("mitra_umkm");
    expect(getDistributorId(user)).toBe(
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    );
  });

  it("keeps sys_admin without distributor scope", () => {
    const sysAdmin = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      app_metadata: {
        role: "sys_admin",
        distributor_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      },
    } as any;

    expect(getUserRole(sysAdmin)).toBeNull();
    expect(getDistributorId(sysAdmin)).toBeNull();
  });
});
