import { describe, expect, it } from "vitest";
import { APP_ROLES, MANAGED_ROLES, isManagedRole, roleFromMetadata } from "../shared/auth";

describe("KONSINYASI role rules", () => {
  it("keeps Distributor as the default role for a newly registered official account", () => {
    expect(roleFromMetadata(undefined)).toBe("distributor");
    expect(roleFromMetadata("unknown")).toBe("distributor");
  });

  it("allows only non-Distributor roles in the managed-role set", () => {
    expect(APP_ROLES).toContain("distributor");
    expect(MANAGED_ROLES).not.toContain("distributor");
    expect(isManagedRole("admin")).toBe(true);
    expect(isManagedRole("distributor")).toBe(false);
  });
});
