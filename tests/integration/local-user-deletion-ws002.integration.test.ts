import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "../../server/routers";
import type { TrpcContext } from "../../server/_core/context";

const RUN_LOCAL = process.env.RUN_LOCAL_TWO_TENANT === "1";
const LOCAL_URL = process.env.SUPABASE_LOCAL_URL ?? "http://127.0.0.1:54321";
const LOCAL_ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;
const LOCAL_SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;

if (
  !LOCAL_URL.startsWith("http://127.0.0.1:") &&
  !LOCAL_URL.startsWith("http://localhost:")
) {
  throw new Error(
    "WS-002 local integration test refuses a non-local SUPABASE_LOCAL_URL",
  );
}

type FixtureUser = {
  email: string;
  password: string;
  role: "distributor" | "admin" | "mitra_umkm";
  id?: string;
  distributorId?: string;
};

const fixture: FixtureUser[] = [
  { email: "auth-ws002-d1@example.local", password: "LocalOnly-WS002-D1!safe", role: "distributor" },
  { email: "auth-ws002-d2@example.local", password: "LocalOnly-WS002-D2!safe", role: "distributor" },
  { email: "auth-ws002-a1@example.local", password: "LocalOnly-WS002-A1!safe", role: "admin" },
  { email: "auth-ws002-a2@example.local", password: "LocalOnly-WS002-A2!safe", role: "admin" },
  { email: "auth-ws002-m1@example.local", password: "LocalOnly-WS002-M1!safe", role: "mitra_umkm" },
  { email: "auth-ws002-m2@example.local", password: "LocalOnly-WS002-M2!safe", role: "mitra_umkm" },
  { email: "auth-ws002-m3@example.local", password: "LocalOnly-WS002-M3!safe", role: "mitra_umkm" },
];

let admin: SupabaseClient;
let approvedRequestId: string;
let approvedItemId: string;
let approvedProductId: string;
let deletedUserId: string | undefined;

function assertLocalTestConfiguration() {
  if (!RUN_LOCAL)
    throw new Error(
      "Set RUN_LOCAL_TWO_TENANT=1 to run the WS-002 local integration fixture",
    );
  if (!LOCAL_ANON_KEY || !LOCAL_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_LOCAL_ANON_KEY and SUPABASE_LOCAL_SERVICE_ROLE_KEY are required",
    );
  }
}

function createAdminClient() {
  assertLocalTestConfiguration();
  return createClient(LOCAL_URL, LOCAL_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function createUserClient(accessToken: string) {
  assertLocalTestConfiguration();
  return createClient(LOCAL_URL, LOCAL_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

async function provisionUser(user: FixtureUser, distributorId?: string) {
  const { data, error } = await admin.auth.admin.createUser({
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

  const { error: profileError } = await admin.from("user_profiles").insert({
    user_id: user.id,
    distributor_id: user.distributorId,
    full_name: `WS-002 ${user.role}`,
    phone: "0900000000",
    emergency_contact_name: "Local Fixture",
    emergency_contact_relation: "Test Contact",
    emergency_contact_phone: "0900000001",
    address: "Local Supabase WS-002 fixture address",
    ktp_storage_path: `ws002/${user.distributorId}/${user.id}/fixture.jpg`,
    ktp_original_name: "fixture.jpg",
    ktp_content_type: "image/jpeg",
  });
  expect(profileError).toBeNull();
}

async function signIn(user: FixtureUser) {
  const client = createClient(LOCAL_URL, LOCAL_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  expect(error).toBeNull();
  expect(data.session?.access_token).toBeTruthy();
  return createUserClient(data.session!.access_token);
}

async function callerFor(user: FixtureUser) {
  const client = await signIn(user);
  const { data, error } = await client.auth.getUser();
  expect(error).toBeNull();
  expect(data.user).toBeTruthy();
  const context: TrpcContext = {
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user: null,
    supabaseUser: data.user,
  };
  return { client, caller: appRouter.createCaller(context) };
}

async function hasUser(userId: string) {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  return { exists: Boolean(data.user), error };
}

async function cleanupFixture() {
  const ids = fixture.filter(
    (user): user is FixtureUser & { id: string } => Boolean(user.id),
  );
  if (ids.length === 0) return;

  const cleanupErrors: string[] = [];
  const userIds = ids.map((user) => user.id);
  const mitraIds = ids
    .filter((user) => user.role === "mitra_umkm")
    .map((user) => user.id);

  const requestIds = [approvedRequestId].filter(Boolean);
  if (requestIds.length > 0) {
    for (const table of ["notifications", "stock_movements"] as const) {
      const { error } = await admin
        .from(table)
        .delete()
        .in("request_id", requestIds);
      if (error) cleanupErrors.push(`${table} cleanup failed: ${error.message}`);
    }

    const { error: requestError } = await admin
      .from("consignment_requests")
      .delete()
      .in("id", requestIds);
    if (requestError) {
      cleanupErrors.push(
        `consignment_requests cleanup failed: ${requestError.message}`,
      );
    }
  }

  if (mitraIds.length > 0) {
    const { data: items } = await admin
      .from("consignment_items")
      .select("id")
      .in("mitra_user_id", mitraIds);
    const itemIds = (items ?? []).map((item) => item.id);
    if (itemIds.length > 0) {
      const { error: movementError } = await admin
        .from("stock_movements")
        .delete()
        .in("item_id", itemIds);
      if (movementError) {
        cleanupErrors.push(
          `stock_movements item cleanup failed: ${movementError.message}`,
        );
      }
      const { error: itemError } = await admin
        .from("consignment_items")
        .delete()
        .in("id", itemIds);
      if (itemError) {
        cleanupErrors.push(
          `consignment_items cleanup failed: ${itemError.message}`,
        );
      }
    }

    const { error: productsError } = await admin
      .from("products")
      .delete()
      .in("created_by_mitra_user_id", mitraIds);
    if (productsError) {
      cleanupErrors.push(`products cleanup failed: ${productsError.message}`);
    }
  }

  const { error: profileError } = await admin
    .from("user_profiles")
    .delete()
    .in("user_id", userIds);
  if (profileError) {
    cleanupErrors.push(`user_profiles cleanup failed: ${profileError.message}`);
  }

  for (const user of [...ids].reverse()) {
    if (deletedUserId && user.id === deletedUserId) continue;
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      cleanupErrors.push(
        `Auth cleanup failed for ${user.email}: ${error.message}`,
      );
    }
  }

  if (cleanupErrors.length > 0) {
    throw new Error(cleanupErrors.join("; "));
  }
}

describe.skipIf(!RUN_LOCAL)("WS-002 user deletion and audit trail integrity", () => {
  beforeAll(async () => {
    assertLocalTestConfiguration();
    process.env.SUPABASE_URL = LOCAL_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = LOCAL_SERVICE_ROLE_KEY;
    process.env.SUPABASE_PUBLISHABLE_KEY = LOCAL_ANON_KEY;
    admin = createAdminClient();
    try {
      await provisionUser(fixture[0]);
      await provisionUser(fixture[1]);
      await provisionUser(fixture[2], fixture[0].id);
      await provisionUser(fixture[3], fixture[1].id);
      await provisionUser(fixture[4], fixture[0].id);
      await provisionUser(fixture[5], fixture[0].id);
      await provisionUser(fixture[6], fixture[1].id);
    } catch (error) {
      try {
        await cleanupFixture();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "WS-002 fixture setup and cleanup failed",
        );
      }
      throw error;
    }
  });

  afterAll(async () => {
    if (admin) await cleanupFixture();
  });

  it("provisions isolated Distributor - Admin - Mitra trees", () => {
    expect(fixture[0].distributorId).toBe(fixture[0].id);
    expect(fixture[1].distributorId).toBe(fixture[1].id);
    expect(fixture[2].distributorId).toBe(fixture[0].id);
    expect(fixture[3].distributorId).toBe(fixture[1].id);
    expect(fixture[4].distributorId).toBe(fixture[0].id);
    expect(fixture[5].distributorId).toBe(fixture[0].id);
    expect(fixture[6].distributorId).toBe(fixture[1].id);
  });

  it("denies a Mitra from calling management.remove", async () => {
    const { caller: mitraCaller } = await callerFor(fixture[4]);
    await expect(
      mitraCaller.management.remove({ userId: fixture[5].id! }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const { exists } = await hasUser(fixture[5].id!);
    expect(exists).toBe(true);
  });

  it("refuses deleting a Mitra that owns stock movement history and preserves the audit trail", async () => {
    const { caller: mitraCaller } = await callerFor(fixture[4]);
    const request = await mitraCaller.supplier.submitNewItem({
      name: "WS-002 HISTORY ITEM",
      sku: "WS002-HISTORY-001",
      unit: "pcs",
      proposedStockQuantity: 8,
      proposedMinimumStock: 2,
      reason: "WS-002 stock history fixture",
    });
    approvedRequestId = request.id;

    const { caller: adminCaller } = await callerFor(fixture[2]);
    const review = await adminCaller.supplier.adminReview({
      requestId: approvedRequestId,
      action: "approve",
      reviewNote: "WS-002 approved history",
    });
    expect(review.status).toBe("approved");
    const { caller: distributorCaller } = await callerFor(fixture[0]);

    const { data: approvedRow } = await admin
      .from("consignment_requests")
      .select("item_id, product_id")
      .eq("id", approvedRequestId)
      .single();
    expect(approvedRow?.item_id).toBeTruthy();
    expect(approvedRow?.product_id).toBeTruthy();
    approvedItemId = approvedRow!.item_id;
    approvedProductId = approvedRow!.product_id;

    const { data: history } = await admin
      .from("stock_movements")
      .select("id")
      .eq("mitra_user_id", fixture[4].id!);
    expect(history).toHaveLength(1);

    await expect(
      distributorCaller.management.remove({ userId: fixture[4].id! }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Akun memiliki riwayat stok/transaksi. Nonaktifkan akun saja.",
    });

    const { exists, error } = await hasUser(fixture[4].id!);
    expect(error).toBeNull();
    expect(exists).toBe(true);

    const { data: profile } = await admin
      .from("user_profiles")
      .select("user_id")
      .eq("user_id", fixture[4].id!)
      .maybeSingle();
    expect(profile?.user_id).toBe(fixture[4].id);

    const { data: remainingMovements } = await admin
      .from("stock_movements")
      .select("id")
      .eq("mitra_user_id", fixture[4].id!);
    expect(remainingMovements).toHaveLength(1);
  });

  it("allows deleting a Mitra without stock history and removes the user", async () => {
    const { caller: distributorCaller } = await callerFor(fixture[0]);
    const result = await distributorCaller.management.remove({
      userId: fixture[5].id!,
    });
    expect(result).toEqual({ success: true });
    deletedUserId = fixture[5].id;

    const { exists } = await hasUser(fixture[5].id!);
    expect(exists).toBe(false);

    const { data: profile } = await admin
      .from("user_profiles")
      .select("user_id")
      .eq("user_id", fixture[5].id!)
      .maybeSingle();
    expect(profile).toBeNull();
  });

  it("denies cross-tenant deletion", async () => {
    const { caller: tenantADistributor } = await callerFor(fixture[0]);
    await expect(
      tenantADistributor.management.remove({ userId: fixture[6].id! }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Pengguna berada di luar ruang kerja Anda.",
    });

    const { exists } = await hasUser(fixture[6].id!);
    expect(exists).toBe(true);
  });

  it("denies self-deletion", async () => {
    const { caller: adminCaller } = await callerFor(fixture[2]);
    await expect(
      adminCaller.management.remove({ userId: fixture[2].id! }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Anda tidak dapat menghapus akun yang sedang digunakan.",
    });

    const { exists } = await hasUser(fixture[2].id!);
    expect(exists).toBe(true);
  });

  it("denies deleting the Distributor utama", async () => {
    const { caller: adminCaller } = await callerFor(fixture[2]);
    await expect(
      adminCaller.management.remove({ userId: fixture[0].id! }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Admin tidak dapat mengelola akun Distributor.",
    });

    const { exists } = await hasUser(fixture[0].id!);
    expect(exists).toBe(true);
  });

  it("enforces ON DELETE RESTRICT at the database level for stock_movements.mitra_user_id", async () => {
    const { error } = await admin.auth.admin.deleteUser(fixture[4].id!);
    expect(error).toBeTruthy();

    const { exists } = await hasUser(fixture[4].id!);
    expect(exists).toBe(true);

    const { data: movements } = await admin
      .from("stock_movements")
      .select("id")
      .eq("mitra_user_id", fixture[4].id!);
    expect(movements).toHaveLength(1);
  });
});