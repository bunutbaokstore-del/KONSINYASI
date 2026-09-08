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
    "OPEN-1 local integration test refuses a non-local SUPABASE_LOCAL_URL",
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
  { email: "open1-d1@example.local", password: "LocalOnly-Open1-D1!safe", role: "distributor" },
  { email: "open1-d2@example.local", password: "LocalOnly-Open1-D2!safe", role: "distributor" },
  { email: "open1-m1@example.local", password: "LocalOnly-Open1-M1!safe", role: "mitra_umkm" },
];

let admin: SupabaseClient;
const createdItems: string[] = [];
const createdShipmentItems: string[] = [];
const createdProducts: string[] = [];
const createdMovements: string[] = [];
const createdRequests: string[] = [];
const createdShipments: string[] = [];

function assertLocalTestConfiguration() {
  if (!RUN_LOCAL)
    throw new Error(
      "Set RUN_LOCAL_TWO_TENANT=1 to run the OPEN-1 local integration fixture",
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
    full_name: `OPEN-1 ${user.role}`,
    phone: "0900000000",
    emergency_contact_name: "Local Fixture",
    emergency_contact_relation: "Test Contact",
    emergency_contact_phone: "0900000001",
    address: "Local Supabase OPEN-1 fixture address",
    ktp_storage_path: `open1/${user.distributorId}/${user.id}/fixture.jpg`,
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

async function createItem(distributorId: string, mitraUserId: string, suffix: string) {
  const { data, error } = await admin
    .from("consignment_items")
    .insert({
      distributor_id: distributorId,
      mitra_user_id: mitraUserId,
      name: `OPEN-1 ITEM ${suffix}`,
      sku: `OPEN1-${suffix}`,
      unit: "pcs",
      stock_quantity: 0,
      minimum_stock: 0,
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  expect(data?.id).toBeTruthy();
  if (data?.id) createdItems.push(data.id);
  return data!.id;
}

async function createMovement(distributorId: string, mitraUserId: string, itemId: string) {
  const { data, error } = await admin
    .from("stock_movements")
    .insert({
      distributor_id: distributorId,
      mitra_user_id: mitraUserId,
      item_id: itemId,
      previous_stock: 0,
      change_quantity: 5,
      resulting_stock: 5,
      movement_type: "initial_stock",
      reason: "OPEN-1 movement fixture",
      approved_by: distributorId,
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  expect(data?.id).toBeTruthy();
  if (data?.id) createdMovements.push(data.id);
  return data!.id;
}

async function createRequest(distributorId: string, mitraUserId: string, itemId: string) {
  const { data, error } = await admin
    .from("consignment_requests")
    .insert({
      distributor_id: distributorId,
      mitra_user_id: mitraUserId,
      item_id: itemId,
      request_type: "stock_change",
      proposed_stock_quantity: 10,
      reason: "OPEN-1 request fixture",
      status: "pending",
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  expect(data?.id).toBeTruthy();
  if (data?.id) createdRequests.push(data.id);
  return data!.id;
}

async function createProduct(distributorId: string) {
  const { data, error } = await admin
    .from("products")
    .insert({
      distributor_id: distributorId,
      name: `OPEN-1 PRODUCT ${createdProducts.length}`,
      sku: `OPEN1-PRODUCT-${createdProducts.length}`,
      unit: "pcs",
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  expect(data?.id).toBeTruthy();
  if (data?.id) createdProducts.push(data.id);
  return data!.id;
}

async function createShipment(distributorId: string, mitraUserId: string, productId: string, itemId: string) {
  const { data, error } = await admin
    .from("mitra_shipments")
    .insert({
      distributor_id: distributorId,
      mitra_user_id: mitraUserId,
      product_id: productId,
      consignment_item_id: itemId,
      quantity: 1,
      status: "planned",
      shipment_date: "2026-09-08",
      notes: "",
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  expect(data?.id).toBeTruthy();
  if (data?.id) createdShipments.push(data.id);
  return data!.id;
}

async function cleanupFixture() {
  const cleanupErrors: string[] = [];

  if (createdShipments.length > 0) {
    const { error } = await admin.from("mitra_shipments").delete().in("id", createdShipments);
    if (error) cleanupErrors.push(`mitra_shipments cleanup failed: ${error.message}`);
  }

  if (createdRequests.length > 0) {
    const { error: notificationError } = await admin
      .from("notifications")
      .delete()
      .in("request_id", createdRequests);
    if (notificationError) {
      cleanupErrors.push(`notifications cleanup failed: ${notificationError.message}`);
    }
    const { error } = await admin.from("consignment_requests").delete().in("id", createdRequests);
    if (error) cleanupErrors.push(`consignment_requests cleanup failed: ${error.message}`);
  }

  if (createdItems.length > 0) {
    const { error: movementError } = await admin
      .from("stock_movements")
      .delete()
      .in("item_id", createdItems);
    if (movementError) {
      cleanupErrors.push(`stock_movements cleanup failed: ${movementError.message}`);
    }
    const { error: itemError } = await admin.from("consignment_items").delete().in("id", createdItems);
    if (itemError) {
      cleanupErrors.push(`consignment_items cleanup failed: ${itemError.message}`);
    }
  }

  if (createdProducts.length > 0) {
    const { error } = await admin.from("products").delete().in("id", createdProducts);
    if (error) cleanupErrors.push(`products cleanup failed: ${error.message}`);
  }

  const ids = fixture.filter(
    (user): user is FixtureUser & { id: string } => Boolean(user.id),
  );
  if (ids.length > 0) {
    const userIds = ids.map((user) => user.id);
    const { error: profileError } = await admin
      .from("user_profiles")
      .delete()
      .in("user_id", userIds);
    if (profileError) {
      cleanupErrors.push(`user_profiles cleanup failed: ${profileError.message}`);
    }
    for (const user of [...ids].reverse()) {
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error) {
        cleanupErrors.push(`Auth cleanup failed for ${user.email}: ${error.message}`);
      }
    }
  }

  if (cleanupErrors.length > 0) {
    throw new Error(cleanupErrors.join("; "));
  }
}

describe.skipIf(!RUN_LOCAL)("OPEN-1 consignment item deletion hardening", () => {
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
    } catch (error) {
      try {
        await cleanupFixture();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "OPEN-1 fixture setup and cleanup failed",
        );
      }
      throw error;
    }
  });

  afterAll(async () => {
    if (admin) await cleanupFixture();
  });

  it("removes an item without dependencies", async () => {
    const itemId = await createItem(fixture[0].id!, fixture[2].id!, "CLEAN");
    const { caller: distributorCaller } = await callerFor(fixture[0]);
    const result = await distributorCaller.inventory.remove({ itemId });
    expect(result).toEqual({ success: true });

    const { data: missing } = await admin
      .from("consignment_items")
      .select("id")
      .eq("id", itemId)
      .maybeSingle();
    expect(missing).toBeNull();
  });

  it("refuses deleting an item that has stock movement history and preserves the audit trail", async () => {
    const itemId = await createItem(fixture[0].id!, fixture[2].id!, "HISTORY");
    const movementId = await createMovement(fixture[0].id!, fixture[2].id!, itemId);

    const { caller: distributorCaller } = await callerFor(fixture[0]);
    await expect(
      distributorCaller.inventory.remove({ itemId }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Barang memiliki riwayat stok atau pengajuan. Barang tidak dapat dihapus.",
    });

    const { data: item } = await admin
      .from("consignment_items")
      .select("id")
      .eq("id", itemId)
      .maybeSingle();
    expect(item?.id).toBe(itemId);

    const { data: movement } = await admin
      .from("stock_movements")
      .select("id")
      .eq("id", movementId)
      .maybeSingle();
    expect(movement?.id).toBe(movementId);
  });

  it("enforces ON DELETE RESTRICT at the database level for stock_movements.item_id", async () => {
    const itemId = await createItem(fixture[0].id!, fixture[2].id!, "DB-RESTRICT");
    await createMovement(fixture[0].id!, fixture[2].id!, itemId);

    const { error } = await admin.from("consignment_items").delete().eq("id", itemId);
    expect(error?.code).toBe("23503");

    const { data: item } = await admin
      .from("consignment_items")
      .select("id")
      .eq("id", itemId)
      .maybeSingle();
    expect(item?.id).toBe(itemId);
  });

  it("refuses deleting an item referenced by a consignment request and preserves the request", async () => {
    const itemId = await createItem(fixture[0].id!, fixture[2].id!, "REQUEST");
    const requestId = await createRequest(fixture[0].id!, fixture[2].id!, itemId);

    const { caller: distributorCaller } = await callerFor(fixture[0]);
    await expect(
      distributorCaller.inventory.remove({ itemId }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Barang memiliki riwayat stok atau pengajuan. Barang tidak dapat dihapus.",
    });

    const { data: item } = await admin
      .from("consignment_items")
      .select("id")
      .eq("id", itemId)
      .maybeSingle();
    expect(item?.id).toBe(itemId);

    const { data: request } = await admin
      .from("consignment_requests")
      .select("id")
      .eq("id", requestId)
      .maybeSingle();
    expect(request?.id).toBe(requestId);
  });

  it("refuses deleting an item referenced by a mitra shipment with a clear business error instead of NOT_FOUND", async () => {
    const itemId = await createItem(fixture[0].id!, fixture[2].id!, "SHIPMENT");
    const productId = await createProduct(fixture[0].id!);
    await createShipment(fixture[0].id!, fixture[2].id!, productId, itemId);

    const { caller: distributorCaller } = await callerFor(fixture[0]);
    await expect(
      distributorCaller.inventory.remove({ itemId }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Barang sedang dirujuk shipment atau data terkait. Barang tidak dapat dihapus.",
    });

    const { data: item } = await admin
      .from("consignment_items")
      .select("id")
      .eq("id", itemId)
      .maybeSingle();
    expect(item?.id).toBe(itemId);
  });

  it("denies cross-tenant deletion and leaves the other tenant item intact", async () => {
    const itemId = await createItem(fixture[1].id!, fixture[1].id!, "CROSS");

    const { caller: distributorACaller } = await callerFor(fixture[0]);
    await expect(
      distributorACaller.inventory.remove({ itemId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const { data: item } = await admin
      .from("consignment_items")
      .select("id")
      .eq("id", itemId)
      .maybeSingle();
    expect(item?.id).toBe(itemId);
  });

  it("blocks authenticated direct REST DELETE of consignment items via RLS", async () => {
    const itemId = await createItem(fixture[0].id!, fixture[2].id!, "REST");

    const distributorClient = await signIn(fixture[0]);
    const { data, error } = await distributorClient
      .from("consignment_items")
      .delete()
      .eq("id", itemId)
      .select("id");

    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: item } = await admin
      .from("consignment_items")
      .select("id")
      .eq("id", itemId)
      .maybeSingle();
    expect(item?.id).toBe(itemId);
  });
});