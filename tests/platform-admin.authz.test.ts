import { describe, expect, it } from "vitest";
import { getDistributorId } from "../server/supabase-admin";
import { platformRoleFromMetadata } from "../shared/auth";

describe("KONSINYASI Sysadmin authorization rules", () => {
  it("recognizes sys_admin as a platform role", () => {
    expect(platformRoleFromMetadata("sys_admin")).toBe("sys_admin");
    expect(platformRoleFromMetadata("distributor")).toBeNull();
    expect(platformRoleFromMetadata(undefined)).toBeNull();
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
      id: "33333333-3333-3333-3333-333333333333",
      app_metadata: {
        role: "admin",
        distributor_id: "44444444-4444-4444-4444-444444444444",
      },
      user_metadata: {},
    } as any;

    expect(getDistributorId(admin)).toBe(
      "44444444-4444-4444-4444-444444444444",
    );
  });
});
