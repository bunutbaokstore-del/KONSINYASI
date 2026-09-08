import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RUN_LOCAL = process.env.RUN_LOCAL_TWO_TENANT === "1";
const LOCAL_URL = process.env.SUPABASE_LOCAL_URL ?? "http://127.0.0.1:54321";
const LOCAL_ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;
const LOCAL_SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;

if (
  !LOCAL_URL.startsWith("http://127.0.0.1:") &&
  !LOCAL_URL.startsWith("http://localhost:")
) {
  throw new Error(
    "local-two-tenant integration test refuses a non-local SUPABASE_LOCAL_URL",
  );
}

type FixtureUser = {
  email: string;
  password: string;
  role: "distributor" | "admin" | "mitra_umkm";
  distributorId?: string;
  id?: string;
};

const fixture: FixtureUser[] = [
  {
    email: "auth28a-d1@example.local",
    password: "LocalOnly-A1!safe",
    role: "distributor",
  },
  {
    email: "auth28a-d2@example.local",
    password: "LocalOnly-A2!safe",
    role: "distributor",
  },
  {
    email: "auth28a-admin-d1@example.local",
    password: "LocalOnly-B1!safe",
    role: "admin",
  },
  {
    email: "auth28a-admin-d2@example.local",
    password: "LocalOnly-B2!safe",
    role: "admin",
  },
  {
    email: "auth28a-mitra-d1@example.local",
    password: "LocalOnly-C1!safe",
    role: "mitra_umkm",
  },
  {
    email: "auth28a-mitra-d2@example.local",
    password: "LocalOnly-C2!safe",
    role: "mitra_umkm",
  },
];

function assertLocalTestConfiguration() {
  if (!RUN_LOCAL)
    throw new Error(
      "Set RUN_LOCAL_TWO_TENANT=1 to run the local-only integration fixture",
    );
  if (!LOCAL_ANON_KEY || !LOCAL_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_LOCAL_ANON_KEY and SUPABASE_LOCAL_SERVICE_ROLE_KEY are required",
    );
  }
}

function adminClient(): SupabaseClient {
  assertLocalTestConfiguration();
  return createClient(LOCAL_URL, LOCAL_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function userClient(accessToken: string): SupabaseClient {
  assertLocalTestConfiguration();
  return createClient(LOCAL_URL, LOCAL_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

async function provisionUser(
  client: SupabaseClient,
  user: FixtureUser,
  distributorId?: string,
) {
  const { data, error } = await client.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    app_metadata: {
      role: user.role,
      status: "active",
      ...(user.role === "distributor" ? {} : { distributor_id: distributorId }),
    },
  });
  expect(error).toBeNull();
  expect(data.user).toBeTruthy();
  user.id = data.user!.id;
  user.distributorId = user.role === "distributor" ? user.id : distributorId;

  const { error: profileError } = await client.from("user_profiles").insert({
    user_id: user.id,
    distributor_id: user.distributorId,
    full_name: `AUTH-2.8A ${user.role}`,
    phone: "0900000000",
    emergency_contact_name: "Local Fixture",
    emergency_contact_relation: "Test Contact",
    emergency_contact_phone: "0900000001",
    address: "Local Supabase integration fixture address",
    ktp_storage_path: `auth-2.8a/${user.distributorId}/${user.id}/fixture.jpg`,
    ktp_original_name: "fixture.jpg",
    ktp_content_type: "image/jpeg",
  });
  expect(profileError).toBeNull();
}

async function signIn(user: FixtureUser) {
  assertLocalTestConfiguration();
  const client = createClient(LOCAL_URL, LOCAL_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  expect(error).toBeNull();
  expect(data.session?.access_token).toBeTruthy();
  return userClient(data.session!.access_token);
}
async function cleanupFixtureUsers(
  client: SupabaseClient,
  users: FixtureUser[],
) {
  const usersWithIds = users.filter(
    (user): user is FixtureUser & { id: string } => Boolean(user.id),
  );

  if (usersWithIds.length === 0) return;

  const cleanupErrors: string[] = [];
  const userIds = usersWithIds.map((user) => user.id);

  const mitraIds = usersWithIds
    .filter((user) => user.role === "mitra_umkm")
    .map((user) => user.id);

  const distributorIds = usersWithIds
    .filter((user) => user.role === "distributor")
    .map((user) => user.id);

  if (distributorIds.length > 0) {
    const { error: movementError } = await client
      .from("stock_movements")
      .delete()
      .in("distributor_id", distributorIds);
    if (movementError) {
      cleanupErrors.push(
        `stock_movements cleanup failed: ${movementError.message}`,
      );
    }

    const { error: itemError } = await client
      .from("consignment_items")
      .delete()
      .in("distributor_id", distributorIds);
    if (itemError) {
      cleanupErrors.push(
        `consignment_items cleanup failed: ${itemError.message}`,
      );
    }
  } else if (mitraIds.length > 0) {
    const { error: movementError } = await client
      .from("stock_movements")
      .delete()
      .in("mitra_user_id", mitraIds);
    if (movementError) {
      cleanupErrors.push(
        `stock_movements cleanup failed: ${movementError.message}`,
      );
    }

    const { error: itemError } = await client
      .from("consignment_items")
      .delete()
      .in("mitra_user_id", mitraIds);
    if (itemError) {
      cleanupErrors.push(
        `consignment_items cleanup failed: ${itemError.message}`,
      );
    }
  }

  const { error: profileError } = await client
    .from("user_profiles")
    .delete()
    .in("user_id", userIds);

  if (profileError) {
    cleanupErrors.push(`user_profiles cleanup failed: ${profileError.message}`);
  }

  for (const user of [...usersWithIds].reverse()) {
    const { error: deleteError } = await client.auth.admin.deleteUser(user.id);

    if (deleteError) {
      cleanupErrors.push(
        `auth user cleanup failed for ${user.email}: ${deleteError.message}`,
      );
    }
  }

  if (cleanupErrors.length > 0) {
    throw new Error(cleanupErrors.join("; "));
  }

  for (const user of users) {
    user.id = undefined;
    user.distributorId = undefined;
  }
}
describe.skipIf(!RUN_LOCAL)("LOCAL two-tenant isolation fixture", () => {
  const admin = RUN_LOCAL ? adminClient() : null;

  beforeAll(async () => {
    assertLocalTestConfiguration();

    try {
      await provisionUser(admin!, fixture[0]);
      await provisionUser(admin!, fixture[1]);
      await provisionUser(admin!, fixture[2], fixture[0].id);
      await provisionUser(admin!, fixture[3], fixture[1].id);
      await provisionUser(admin!, fixture[4], fixture[0].id);
      await provisionUser(admin!, fixture[5], fixture[1].id);
    } catch (error) {
      try {
        await cleanupFixtureUsers(admin!, fixture);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Fixture setup and cleanup failed",
        );
      }
      throw error;
    }
  });

  afterAll(async () => {
    if (!admin) return;
    await cleanupFixtureUsers(admin, fixture);
  });

  it("provisions two isolated Distributor - Admin - Mitra trees", () => {
    expect(fixture[0].distributorId).toBe(fixture[0].id);
    expect(fixture[1].distributorId).toBe(fixture[1].id);
    expect(fixture[2].distributorId).toBe(fixture[0].id);
    expect(fixture[3].distributorId).toBe(fixture[1].id);
    expect(fixture[4].distributorId).toBe(fixture[0].id);
    expect(fixture[5].distributorId).toBe(fixture[1].id);
  });

  it("allows each Distributor to read only its own tenant profiles", async () => {
    const d1 = await signIn(fixture[0]);
    const d2 = await signIn(fixture[1]);
    const first = await d1
      .from("user_profiles")
      .select("user_id, distributor_id");
    const second = await d2
      .from("user_profiles")
      .select("user_id, distributor_id");

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(first.data).toHaveLength(3);
    expect(second.data).toHaveLength(3);
    expect(
      first.data?.every((row) => row.distributor_id === fixture[0].id),
    ).toBe(true);
    expect(
      second.data?.every((row) => row.distributor_id === fixture[1].id),
    ).toBe(true);
    expect(
      first.data?.some((row) => row.distributor_id === fixture[1].id),
    ).toBe(false);
    expect(
      second.data?.some((row) => row.distributor_id === fixture[0].id),
    ).toBe(false);
  });

  it("denies cross-tenant consignment items and tenant access to platform membership", async () => {
    const d1 = await signIn(fixture[0]);
    const crossTenantRead = await d1
      .from("consignment_items")
      .select("id")
      .eq("distributor_id", fixture[1].id!);
    expect(crossTenantRead.error).toBeNull();
    expect(crossTenantRead.data).toEqual([]);

    const tenantPlatformRead = await d1
      .from("platform_admins")
      .select("user_id");
    expect(tenantPlatformRead.error).toBeNull();
    expect(tenantPlatformRead.data).toEqual([]);
  });
  it("enforces Mitra consignment item tenant isolation for insert, select, update, and delete", async () => {
    const mitraA = await signIn(fixture[4]);
    const mitraB = await signIn(fixture[5]);

    const tenantA = fixture[0].id!;
    const tenantB = fixture[1].id!;
    const mitraAId = fixture[4].id!;
    const mitraBId = fixture[5].id!;

    // Create disposable official items with service-role admin client.
    const insertItemA = await admin!
      .from("consignment_items")
      .insert({
        distributor_id: tenantA,
        mitra_user_id: mitraAId,
        name: "LOCAL-RLS-A",
        sku: "LOCAL-RLS-A",
      })
      .select("id, distributor_id, mitra_user_id")
      .single();

    expect(insertItemA.error).toBeNull();
    expect(insertItemA.data?.distributor_id).toBe(tenantA);
    expect(insertItemA.data?.mitra_user_id).toBe(mitraAId);

    const itemAId = insertItemA.data!.id;

    const insertItemB = await admin!
      .from("consignment_items")
      .insert({
        distributor_id: tenantB,
        mitra_user_id: mitraBId,
        name: "LOCAL-RLS-B",
        sku: "LOCAL-RLS-B",
      })
      .select("id, distributor_id, mitra_user_id")
      .single();

    expect(insertItemB.error).toBeNull();
    expect(insertItemB.data?.distributor_id).toBe(tenantB);
    expect(insertItemB.data?.mitra_user_id).toBe(mitraBId);

    const itemBId = insertItemB.data!.id;

    // 1. Mitra A cannot INSERT into its own tenant.
    const insertByMitraA = await mitraA.from("consignment_items").insert({
      distributor_id: tenantA,
      mitra_user_id: mitraAId,
      name: "LOCAL-RLS-MITRA-INSERT-A",
      sku: "LOCAL-RLS-MITRA-INSERT-A",
    });

    expect(insertByMitraA.error).toBeTruthy();
    expect(insertByMitraA.error?.code).toBe("42501");

    // 2. Mitra B cannot INSERT into its own tenant.
    const insertByMitraB = await mitraB.from("consignment_items").insert({
      distributor_id: tenantB,
      mitra_user_id: mitraBId,
      name: "LOCAL-RLS-MITRA-INSERT-B",
      sku: "LOCAL-RLS-MITRA-INSERT-B",
    });

    expect(insertByMitraB.error).toBeTruthy();
    expect(insertByMitraB.error?.code).toBe("42501");

    // 3. Mitra A cannot SELECT tenant B's row.
    const crossSelectA = await mitraA
      .from("consignment_items")
      .select("id, distributor_id")
      .eq("id", itemBId);

    expect(crossSelectA.error).toBeNull();
    expect(crossSelectA.data).toEqual([]);

    // 4. Mitra B cannot SELECT tenant A's row.
    const crossSelectB = await mitraB
      .from("consignment_items")
      .select("id, distributor_id")
      .eq("id", itemAId);

    expect(crossSelectB.error).toBeNull();
    expect(crossSelectB.data).toEqual([]);

    // 5. Mitra A cannot UPDATE its own tenant item.
    const ownUpdateA = await mitraA
      .from("consignment_items")
      .update({ name: "MITRA-OWN-UPDATE-A" })
      .eq("id", itemAId)
      .select("id");

    expect(ownUpdateA.error).toBeNull();
    expect(ownUpdateA.data).toEqual([]);

    // 6. Mitra B cannot UPDATE its own tenant item.
    const ownUpdateB = await mitraB
      .from("consignment_items")
      .update({ name: "MITRA-OWN-UPDATE-B" })
      .eq("id", itemBId)
      .select("id");

    expect(ownUpdateB.error).toBeNull();
    expect(ownUpdateB.data).toEqual([]);

    // 7. Mitra A cannot UPDATE tenant B's row.
    const crossUpdateA = await mitraA
      .from("consignment_items")
      .update({ name: "CROSS-TENANT-UPDATE-A" })
      .eq("id", itemBId)
      .select("id");

    expect(crossUpdateA.error).toBeNull();
    expect(crossUpdateA.data).toEqual([]);

    // 8. Mitra B cannot UPDATE tenant A's row.
    const crossUpdateB = await mitraB
      .from("consignment_items")
      .update({ name: "CROSS-TENANT-UPDATE-B" })
      .eq("id", itemAId)
      .select("id");

    expect(crossUpdateB.error).toBeNull();
    expect(crossUpdateB.data).toEqual([]);

    // 9. Mitra A cannot DELETE its own tenant item.
    const ownDeleteA = await mitraA
      .from("consignment_items")
      .delete()
      .eq("id", itemAId)
      .select("id");

    expect(ownDeleteA.error).toBeNull();
    expect(ownDeleteA.data).toEqual([]);

    // 10. Mitra B cannot DELETE its own tenant item.
    const ownDeleteB = await mitraB
      .from("consignment_items")
      .delete()
      .eq("id", itemBId)
      .select("id");

    expect(ownDeleteB.error).toBeNull();
    expect(ownDeleteB.data).toEqual([]);

    // 11. Mitra A cannot DELETE tenant B's row.
    const crossDeleteA = await mitraA
      .from("consignment_items")
      .delete()
      .eq("id", itemBId)
      .select("id");

    expect(crossDeleteA.error).toBeNull();
    expect(crossDeleteA.data).toEqual([]);

    // 12. Mitra B cannot DELETE tenant A's row.
    const crossDeleteB = await mitraB
      .from("consignment_items")
      .delete()
      .eq("id", itemAId)
      .select("id");

    expect(crossDeleteB.error).toBeNull();
    expect(crossDeleteB.data).toEqual([]);

    // Verify tenant scope and records remain unchanged.
    const verifyA = await admin!
      .from("consignment_items")
      .select("id, distributor_id, mitra_user_id, name")
      .eq("id", itemAId)
      .single();

    const verifyB = await admin!
      .from("consignment_items")
      .select("id, distributor_id, mitra_user_id, name")
      .eq("id", itemBId)
      .single();

    expect(verifyA.error).toBeNull();
    expect(verifyA.data?.distributor_id).toBe(tenantA);
    expect(verifyA.data?.mitra_user_id).toBe(mitraAId);
    expect(verifyA.data?.name).toBe("LOCAL-RLS-A");

    expect(verifyB.error).toBeNull();
    expect(verifyB.data?.distributor_id).toBe(tenantB);
    expect(verifyB.data?.mitra_user_id).toBe(mitraBId);
    expect(verifyB.data?.name).toBe("LOCAL-RLS-B");

    // Cleanup disposable rows with service-role admin client.
    const cleanupA = await admin!
      .from("consignment_items")
      .delete()
      .eq("id", itemAId);

    const cleanupB = await admin!
      .from("consignment_items")
      .delete()
      .eq("id", itemBId);

    expect(cleanupA.error).toBeNull();
    expect(cleanupB.error).toBeNull();
  });
  it("isolates stock_movements by Mitra and Distributor tenant", async () => {
    const { data: item, error: itemError } = await admin!
      .from("consignment_items")
      .insert({
        distributor_id: fixture[1].id,
        mitra_user_id: fixture[3].id,
        name: "RLS-STOCK-MOVEMENT-FIXTURE",
        sku: "RLS-STOCK-MOVEMENT-FIXTURE",
        unit: "pcs",
        stock_quantity: 10,
        minimum_stock: 0,
      })
      .select("id")
      .single();

    expect(itemError).toBeNull();
    expect(item).not.toBeNull();
    const { data: movement, error: movementError } = await admin!
      .from("stock_movements")
      .insert({
        distributor_id: fixture[1].id,
        mitra_user_id: fixture[3].id,
        item_id: item!.id,
        previous_stock: 10,
        change_quantity: 5,
        resulting_stock: 15,
        movement_type: "supplier_stock_change",
        reason: "RLS isolation test",
        approved_by: fixture[0].id,
      })
      .select("*")
      .single();

    expect(movementError).toBeNull();
    expect(movement).not.toBeNull();

    const mitraA = await signIn(fixture[3]);
    const mitraB = await signIn(fixture[4]);
    const distributorA = await signIn(fixture[1]);
    const distributorB = await signIn(fixture[0]);

    const { data: mitraAData } = await mitraA
      .from("stock_movements")
      .select("id")
      .eq("id", movement.id);

    const { data: mitraBData } = await mitraB
      .from("stock_movements")
      .select("id")
      .eq("id", movement.id);

    const { data: distributorAData } = await distributorA
      .from("stock_movements")
      .select("id")
      .eq("id", movement.id);

    const { data: distributorBData } = await distributorB
      .from("stock_movements")
      .select("id")
      .eq("id", movement.id);

    expect(mitraAData).toHaveLength(1);
    expect(mitraBData).toHaveLength(0);
    expect(distributorAData).toHaveLength(1);
    expect(distributorBData).toHaveLength(0);
  });
  it("isolates notifications by Mitra and Distributor tenant", async () => {
    const { data: notification, error: notificationError } = await admin!
      .from("notifications")
      .insert({
        recipient_user_id: fixture[3].id,
        distributor_id: fixture[1].id,
        title: "RLS NOTIFICATION FIXTURE",
        body: "RLS isolation test",
        notification_type: "request_approved",
      })
      .select("id")
      .single();

    expect(notificationError).toBeNull();
    expect(notification).not.toBeNull();

    const mitraA = await signIn(fixture[3]);
    const mitraB = await signIn(fixture[4]);
    const distributorA = await signIn(fixture[1]);
    const distributorB = await signIn(fixture[0]);

    const { data: mitraAData } = await mitraA
      .from("notifications")
      .select("id")
      .eq("id", notification!.id);

    const { data: mitraBData } = await mitraB
      .from("notifications")
      .select("id")
      .eq("id", notification!.id);

    const { data: distributorAData } = await distributorA
      .from("notifications")
      .select("id")
      .eq("id", notification!.id);

    const { data: distributorBData } = await distributorB
      .from("notifications")
      .select("id")
      .eq("id", notification!.id);

    expect(mitraAData).toHaveLength(1);
    expect(mitraBData).toHaveLength(0);
    expect(distributorAData).toHaveLength(1);
    expect(distributorBData).toHaveLength(0);
  });
  it("denies sysadmin from reading a consignment item when distributor_id equals sysadmin UUID", async () => {
    const sysadminEmail = "auth32e-sysadmin-regression@example.local";
    const sysadminPassword = "LocalOnly-E2!safe";

    let sysadminId: string | undefined;
    let edgeCaseItemId: string | undefined;

    try {
      const { data: userData, error: userError } =
        await admin!.auth.admin.createUser({
          email: sysadminEmail,
          password: sysadminPassword,
          email_confirm: true,
          app_metadata: {
            role: "sys_admin",
            status: "active",
          },
        });

      expect(userError).toBeNull();
      expect(userData.user).toBeTruthy();

      sysadminId = userData.user!.id;

      const { data: itemData, error: itemError } = await admin!
        .from("consignment_items")
        .insert({
          distributor_id: sysadminId,
          mitra_user_id: fixture[4].id,
          name: "AUTH-3.2E Sysadmin UUID Regression Item",
          sku: "AUTH-3.2E-SYS-REG",
        })
        .select("id")
        .single();

      expect(itemError).toBeNull();
      expect(itemData?.id).toBeTruthy();

      edgeCaseItemId = itemData!.id;

      const anonClient = createClient(LOCAL_URL, LOCAL_ANON_KEY!, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      const { data: sessionData, error: signInError } =
        await anonClient.auth.signInWithPassword({
          email: sysadminEmail,
          password: sysadminPassword,
        });

      expect(signInError).toBeNull();
      expect(sessionData.session?.access_token).toBeTruthy();

      const sysadminClient = userClient(sessionData.session!.access_token);

      const result = await sysadminClient
        .from("consignment_items")
        .select("id, distributor_id")
        .eq("id", edgeCaseItemId);

      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
    } finally {
      if (edgeCaseItemId) {
        await admin!
          .from("consignment_items")
          .delete()
          .eq("id", edgeCaseItemId);
      }

      if (sysadminId) {
        await admin!.auth.admin.deleteUser(sysadminId);
      }
    }
  });
});
