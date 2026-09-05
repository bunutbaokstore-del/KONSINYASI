import { describe, expect, it } from "vitest";

import { isDistributorRole } from "../server/_core/trpc";

function userWithRole(role: string) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    app_metadata: { role },
  } as never;
}

describe("Distributor-only product approval authorization", () => {
  it("allows the Distributor role", () => {
    expect(isDistributorRole(userWithRole("distributor"))).toBe(true);
  });

  it.each(["admin", "mitra_umkm", "supervisor", "sales_motoris", "hrd", "sys_admin"])(
    "rejects the %s role",
    (role) => {
      expect(isDistributorRole(userWithRole(role))).toBe(false);
    },
  );
});
