import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveUserRoleEnum, syncUserMirrors, removeUserMirror, rollbackProvisionedUser } from "../server/provisioning";

const routersFile = resolve(process.cwd(), "server/routers.ts");

function readRouters(): string {
  return readFileSync(routersFile, "utf8");
}

function blockBetween(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start);
  if (start < 0 || end < 0) return "";
  return src.slice(start, end);
}

type PendingCall = { table: string; operation: string; payload?: Record<string, unknown> };

type FakeClient = {
  _calls: PendingCall[];
  from: (table: string) => {
    upsert: (payload: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    delete: () => {
      eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

function fakeClient(overrides?: { failUsers?: boolean; failDistributors?: boolean }): FakeClient {
  const calls: PendingCall[] = [];
  const upsert = (table: string) => async (payload: Record<string, unknown>) => {
    calls.push({ table, operation: "upsert", payload });
    if (table === "users" && overrides?.failUsers) return { error: { message: "users fail" } };
    if (table === "distributors" && overrides?.failDistributors) return { error: { message: "distributors fail" } };
    return { error: null };
  };
  const remove = (table: string) => () => ({
    eq: async (column: string, value: string) => {
      calls.push({ table, operation: `delete.${column}=${value}` });
      return { error: overrides?.failUsers && table === "users" ? { message: "users delete fail" } : null };
    },
  });
  return {
    _calls: calls,
    from: (table: string) => ({ upsert: upsert(table), delete: remove(table) }),
  };
}

function toStub(client: FakeClient) {
  return client as unknown as Parameters<typeof syncUserMirrors>[0];
}

describe("Identity mirror provisioning (provisioning.ts)", () => {
  it("maps every lowercase metadata role to its public.user_role enum literal", () => {
    expect(resolveUserRoleEnum("distributor")).toBe("DISTRIBUTOR");
    expect(resolveUserRoleEnum("admin")).toBe("ADMIN");
    expect(resolveUserRoleEnum("sales_motoris")).toBe("SALES_MOTORIS");
    expect(resolveUserRoleEnum("hrd")).toBe("HRD");
    expect(resolveUserRoleEnum("supervisor")).toBe("SUPERVISOR");
    expect(resolveUserRoleEnum("mitra_umkm")).toBe("MITRA_UMKM");
    expect(resolveUserRoleEnum("sys_admin")).toBe("PLATFORM_SYS_ADMIN");
  });

  it("writes the distributors row BEFORE the users row (FK ordering for distributor self-reference)", async () => {
    const client = fakeClient();
    await syncUserMirrors(toStub(client), {
      id: "11111111-1111-4111-8111-111111111111",
      email: "dist@example.local",
      role: "distributor",
      status: "active",
      distributorId: "11111111-1111-4111-8111-111111111111",
      name: "Tenant A",
      phone: "081000000000",
    });
    const ops = client._calls.map((c) => `${c.operation}:${c.table}`);
    expect(ops).toEqual(["upsert:distributors", "upsert:users"]);
  });

  it("provisions a distributor mirror with self distributor_id and role DISTRIBUTOR", async () => {
    const client = fakeClient();
    await syncUserMirrors(toStub(client), {
      id: "11111111-1111-4111-8111-111111111111",
      email: "dist@example.local",
      role: "distributor",
      status: "active",
      distributorId: "11111111-1111-4111-8111-111111111111",
      name: "Tenant A",
    });
    const users = client._calls.find((c) => c.table === "users")?.payload;
    expect(users).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      distributor_id: "11111111-1111-4111-8111-111111111111",
      role: "DISTRIBUTOR",
      is_active: true,
      name: "Tenant A",
    });
  });

  it("provisions a tenant-managed user with the workspace distributor_id and uppercase role", async () => {
    const client = fakeClient();
    await syncUserMirrors(toStub(client), {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      email: "sales@example.local",
      role: "sales_motoris",
      status: "active",
      distributorId: "11111111-1111-4111-8111-111111111111",
      name: "Sales A",
    });
    const users = client._calls.find((c) => c.table === "users")?.payload;
    expect(client._calls.some((c) => c.table === "distributors")).toBe(false);
    expect(users).toMatchObject({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      distributor_id: "11111111-1111-4111-8111-111111111111",
      role: "SALES_MOTORIS",
      is_active: true,
    });
  });

  it("provisions a sys_admin user mirror with NULL distributor_id and role PLATFORM_SYS_ADMIN and NO distributor row", async () => {
    const client = fakeClient();
    await syncUserMirrors(toStub(client), {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      email: "sysadmin@example.local",
      role: "sys_admin",
      status: "active",
      distributorId: null,
      name: "Sys Admin",
    });
    expect(client._calls.some((c) => c.table === "distributors")).toBe(false);
    const users = client._calls.find((c) => c.table === "users")?.payload;
    expect(users).toMatchObject({
      distributor_id: null,
      role: "PLATFORM_SYS_ADMIN",
    });
  });

  it("mirrors disabled status as is_active=false", async () => {
    const client = fakeClient();
    await syncUserMirrors(toStub(client), {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      email: "hrd@example.local",
      role: "hrd",
      status: "disabled",
      distributorId: "11111111-1111-4111-8111-111111111111",
      name: "HRD A",
    });
    const users = client._calls.find((c) => c.table === "users")?.payload;
    expect(users).toMatchObject({ is_active: false, role: "HRD" });
  });

  it("propagates a users-row write failure", async () => {
    const client = fakeClient({ failUsers: true });
    await expect(
      syncUserMirrors(toStub(client), {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        email: "x@example.local",
        role: "admin",
        status: "active",
        distributorId: "11111111-1111-4111-8111-111111111111",
        name: "X",
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("removes the users mirror row BEFORE the distributors row (RESTRICT-safe delete ordering)", async () => {
    const client = fakeClient();
    await removeUserMirror(toStub(client), "11111111-1111-4111-8111-111111111111");
    expect(client._calls.map((c) => `${c.operation}:${c.table}`)).toEqual([
      "delete.id=11111111-1111-4111-8111-111111111111:users",
      "delete.id=11111111-1111-4111-8111-111111111111:distributors",
    ]);
  });

  it("rollbackProvisionedUser swallows mirror removal errors (additive mirror must not mask the primary error)", async () => {
    const client = fakeClient({ failUsers: true });
    await expect(rollbackProvisionedUser(toStub(client), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).resolves.toBeUndefined();
  });
});

describe("Identity mirror provisioning wiring (routers.ts)", () => {
  it("imports the provisioning helpers from ./provisioning", () => {
    const src = readRouters();
    expect(src).toContain(`from "./provisioning"`);
    expect(src).toMatch(/import\s*\{[^}]*syncUserMirrors[^}]*removeUserMirror[^}]*rollbackProvisionedUser/);
  });

  it("registration.createDistributor provisions mirrors right after auth user creation", () => {
    const block = blockBetween(readRouters(), "registration: router({", "auth: router({");
    const createUserAt = block.indexOf("adminClient.auth.admin.createUser");
    const syncAt = block.indexOf("syncUserMirrors");
    expect(createUserAt).toBeGreaterThan(-1);
    expect(syncAt).toBeGreaterThan(createUserAt);
    expect(block).toMatch(/role: "distributor"/);
  });

  it("registration.createDistributor removes mirrors before every auth.admin.deleteUser rollback", () => {
    const block = blockBetween(readRouters(), "registration: router({", "auth: router({");
    const afterCreate = block.slice(block.indexOf("adminClient.auth.admin.createUser"));
    const deleteUserCount = (afterCreate.match(/auth\.admin\.deleteUser/g) ?? []).length;
    const rollbackCount = (afterCreate.match(/rollbackProvisionedUser/g) ?? []).length;
    expect(deleteUserCount).toBeGreaterThanOrEqual(3);
    expect(rollbackCount).toBe(deleteUserCount);
  });

  it("management.create provisions mirrors for the managed role inside the caller workspace", () => {
    const src = readRouters();
    const block = blockBetween(src, "management: router({", "inventory: router({");
    const createBlock = block.slice(block.indexOf("create: userManagementProcedure"), block.indexOf("update: userManagementProcedure"));
    expect(createBlock).toContain("syncUserMirrors");
    expect(createBlock).toContain("role: input.role");
    expect(createBlock).toContain("distributorId");
  });

  it("management.create also rolls back mirrors before every auth.admin.deleteUser", () => {
    const src = readRouters();
    const block = blockBetween(src, "management: router({", "inventory: router({");
    const createBlock = block.slice(block.indexOf("create: userManagementProcedure"), block.indexOf("update: userManagementProcedure"));
    const deleteUserCount = (createBlock.match(/auth\.admin\.deleteUser/g) ?? []).length;
    const rollbackCount = (createBlock.match(/rollbackProvisionedUser/g) ?? []).length;
    expect(deleteUserCount).toBeGreaterThanOrEqual(3);
    expect(rollbackCount).toBe(deleteUserCount);
  });

  it("management.update re-syncs mirrors to keep role/status/name in step with app_metadata", () => {
    const src = readRouters();
    const block = blockBetween(src, "management: router({", "inventory: router({");
    const updateBlock = block.slice(block.indexOf("update: userManagementProcedure"), block.indexOf("remove: userManagementProcedure"));
    expect(updateBlock).toContain("syncUserMirrors");
    expect(updateBlock).toContain("role: input.role");
    expect(updateBlock).toContain("status: input.status");
  });

  it("management.remove deletes the mirror BEFORE auth.admin.deleteUser (RESTRICT FK ordering)", () => {
    const src = readRouters();
    const block = blockBetween(src, "management: router({", "inventory: router({");
    const removeBlock = block.slice(block.indexOf("remove: userManagementProcedure"));
    const mirrorAt = removeBlock.indexOf("removeUserMirror");
    const deleteAt = removeBlock.indexOf("auth.admin.deleteUser");
    expect(mirrorAt).toBeGreaterThan(-1);
    expect(deleteAt).toBeGreaterThan(mirrorAt);
  });

  it("management.remove protects the Distributor utama from mirror removal (no distributors delete for non-distributor)", () => {
    const src = readRouters();
    const block = blockBetween(src, "management: router({", "inventory: router({");
    const removeBlock = block.slice(block.indexOf("remove: userManagementProcedure"));
    expect(removeBlock).toContain("Akun Distributor utama tidak dapat dihapus dari Manajemen Pengguna.");
    expect(removeBlock).not.toMatch(/from\("distributors"\)/);
  });

  it("management.update keeps a distributor self-update to its own distributor_id", () => {
    const src = readRouters();
    const block = blockBetween(src, "management: router({", "inventory: router({");
    const updateBlock = block.slice(block.indexOf("update: userManagementProcedure"), block.indexOf("remove: userManagementProcedure"));
    expect(updateBlock).toContain(`input.role === "distributor" ? data.user.id : getDistributorId(ctx.supabaseUser)`);
  });
});