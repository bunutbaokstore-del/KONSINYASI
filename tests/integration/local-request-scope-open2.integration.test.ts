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
    "OPEN-2 local integration test refuses a non-local SUPABASE_LOCAL_URL",
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
  { email: "open2-d1@example.local", password: "LocalOnly-Open2-D1!safe", role: "distributor" },
  { email: "open2-d2@example.local", password: "LocalOnly-Open2-D2!safe", role: "distributor" },
  { email: "open2-m1@example.local", password: "LocalOnly-Open2-M1!safe", role: "mitra_umkm" },
  { email: "open2-m2@example.local", password: "LocalOnly-Open2-M2!safe", role: "mitra_umkm" },
];

let admin: SupabaseClient;
const createdItems: string[] = [];
const createdProducts: string[] = [];
const createdRequests: string[] = [];

function assertLocalTestConfiguration() {
  if (!RUN_LOCAL)
    throw new Error(
      "Set RUN_LOCAL_TWO_TENANT=1 to run the OPEN-2 local integration fixture",
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

function createAnonClient() {
  assertLocalTestConfiguration();
  return createClient(LOCAL_URL, LOCAL_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
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
    full_name: `OPEN-2 ${user.role}`,
    phone: "0900000000",
    emergency_contact_name: "Local Fixture",
    emergency_contact_relation: "Test Contact",
    emergency_contact_phone: "0900000001",
    address: "Local Supabase OPEN-2 fixture address",
    ktp_storage_path: `open2/${user.distributorId}/${user.id}/fixture.jpg`,
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
      name: `OPEN-2 ITEM ${suffix}`,
      sku: `OPEN2-${suffix}`,
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

async function createProduct(distributorId: string, suffix: string) {
  const { data, error } = await admin
    .from("products")
    .insert({
      distributor_id: distributorId,
      name: `OPEN-2 PRODUCT ${suffix}`,
      sku: `OPEN2-PROD-${suffix}`,
      unit: "pcs",
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  expect(data?.id).toBeTruthy();
  if (data?.id) createdProducts.push(data.id);
  return data!.id;
}

async function requestRowByReason(reason: string) {
  return admin
    .from("consignment_requests")
    .select("id")
    .eq("reason", reason)
    .maybeSingle();
}

function isRejected(result: { data: unknown; error: unknown }) {
  return result.error !== null || result.data === null;
}

async function cleanupFixture() {
  const cleanupErrors: string[] = [];

  if (createdRequests.length > 0) {
    const { error: notificationError } = await admin
      .from("notifications")
      .delete()
      .in("request_id", createdRequests);
    if (notificationError) {
      cleanupErrors.push(`notifications cleanup failed: ${notificationError.message}`);
    }
    const { error } = await admin
      .from("consignment_requests")
      .delete()
      .in("id", createdRequests);
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
    const { error: itemError } = await admin
      .from("consignment_items")
      .delete()
      .in("id", createdItems);
    if (itemError) {
      cleanupErrors.push(`consignment_items cleanup failed: ${itemError.message}`);
    }
  }

  if (createdProducts.length > 0) {
    const { error } = await admin.from("products").delete().in("id", createdProducts);
    if (error) cleanupErrors.push(`products cleanup failed: ${error.message}`);
  }

  const ids = fixture.filter((user): user is FixtureUser & { id: string } => Boolean(user.id));
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

describe.skipIf(!RUN_LOCAL)("OPEN-2 consignment request INSERT scope hardening", () => {
  let mitraA: SupabaseClient;
  let itemA1: string;
  let itemM2: string;
  let itemB: string;
  let productB: string;
  let productAUnassigned: string;

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
      await provisionUser(fixture[3], fixture[0].id);
      itemA1 = await createItem(fixture[0].id!, fixture[2].id!, "A1");
      itemM2 = await createItem(fixture[0].id!, fixture[3].id!, "M2");
      itemB = await createItem(fixture[1].id!, fixture[1].id!, "B");
      productB = await createProduct(fixture[1].id!, "B");
      productAUnassigned = await createProduct(fixture[0].id!, "A-UNASSIGNED");
      mitraA = await signIn(fixture[2]);
    } catch (error) {
      try {
        await cleanupFixture();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "OPEN-2 fixture setup and cleanup failed",
        );
      }
      throw error;
    }
  });

  afterAll(async () => {
    if (admin) await cleanupFixture();
  });

  it("allows stock_change for the Mitra's own item in its own tenant", async () => {
    const reason = "OPEN2 own item reason";
    const { data, error } = await mitraA
      .from("consignment_requests")
      .insert({
        distributor_id: fixture[0].id,
        mitra_user_id: fixture[2].id,
        item_id: itemA1,
        request_type: "stock_change",
        proposed_stock_quantity: 8,
        reason,
        status: "pending",
      })
      .select("id, request_type, item_id, product_id")
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    expect(data?.request_type).toBe("stock_change");
    expect(data?.item_id).toBe(itemA1);
    if (data?.id) createdRequests.push(data.id);

    const { data: row } = await requestRowByReason(reason);
    expect(row?.id).toBe(data?.id);
  });

  it("rejects stock_change referencing another Mitra's item in the same tenant", async () => {
    const reason = "OPEN2 other mitra same tenant reason";
    const result = await mitraA
      .from("consignment_requests")
      .insert({
        distributor_id: fixture[0].id,
        mitra_user_id: fixture[2].id,
        item_id: itemM2,
        request_type: "stock_change",
        proposed_stock_quantity: 8,
        reason,
        status: "pending",
      })
      .select("id")
      .single();

    expect(isRejected(result)).toBe(true);
    const { data: row } = await requestRowByReason(reason);
    expect(row).toBeNull();
  });

  it("rejects stock_change referencing an item from tenant B", async () => {
    const reason = "OPEN2 cross tenant item reason";
    const result = await mitraA
      .from("consignment_requests")
      .insert({
        distributor_id: fixture[0].id,
        mitra_user_id: fixture[2].id,
        item_id: itemB,
        request_type: "stock_change",
        proposed_stock_quantity: 8,
        reason,
        status: "pending",
      })
      .select("id")
      .single();

    expect(isRejected(result)).toBe(true);
    const { data: row } = await requestRowByReason(reason);
    expect(row).toBeNull();
  });

  it("allows new_item with null item_id", async () => {
    const reason = "OPEN2 new item null item reason";
    const { data, error } = await mitraA
      .from("consignment_requests")
      .insert({
        distributor_id: fixture[0].id,
        mitra_user_id: fixture[2].id,
        item_id: null,
        request_type: "new_item",
        proposed_name: "OPEN-2 proposed item",
        proposed_unit: "pcs",
        proposed_stock_quantity: 5,
        proposed_minimum_stock: 1,
        reason,
        status: "pending",
      })
      .select("id, request_type, item_id")
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
    expect(data?.request_type).toBe("new_item");
    expect(data?.item_id).toBeNull();
    if (data?.id) createdRequests.push(data.id);
  });

  it("rejects new_item with an item_id set", async () => {
    const reason = "OPEN2 new item with item reason";
    const result = await mitraA
      .from("consignment_requests")
      .insert({
        distributor_id: fixture[0].id,
        mitra_user_id: fixture[2].id,
        item_id: itemA1,
        request_type: "new_item",
        proposed_name: "OPEN-2 proposed item",
        proposed_unit: "pcs",
        proposed_stock_quantity: 5,
        proposed_minimum_stock: 1,
        reason,
        status: "pending",
      })
      .select("id")
      .single();

    expect(isRejected(result)).toBe(true);
    const { data: row } = await requestRowByReason(reason);
    expect(row).toBeNull();
  });

  it("rejects a request carrying a product_id from tenant B", async () => {
    const reason = "OPEN2 foreign product reason";
    const result = await mitraA
      .from("consignment_requests")
      .insert({
        distributor_id: fixture[0].id,
        mitra_user_id: fixture[2].id,
        item_id: itemA1,
        request_type: "stock_change",
        proposed_stock_quantity: 8,
        reason,
        product_id: productB,
        status: "pending",
      })
      .select("id")
      .single();

    expect(isRejected(result)).toBe(true);
    const { data: row } = await requestRowByReason(reason);
    expect(row).toBeNull();
  });

  it("rejects a request carrying a tenant-A product not visible to the Mitra", async () => {
    const reason = "OPEN2 invisible product reason";
    const result = await mitraA
      .from("consignment_requests")
      .insert({
        distributor_id: fixture[0].id,
        mitra_user_id: fixture[2].id,
        item_id: itemA1,
        request_type: "stock_change",
        proposed_stock_quantity: 8,
        reason,
        product_id: productAUnassigned,
        status: "pending",
      })
      .select("id")
      .single();

    expect(isRejected(result)).toBe(true);
    const { data: row } = await requestRowByReason(reason);
    expect(row).toBeNull();
  });

  it("rejects anonymous INSERT", async () => {
    const reason = "OPEN2 anonymous insert reason";
    const anon = createAnonClient();
    const result = await anon
      .from("consignment_requests")
      .insert({
        distributor_id: fixture[0].id,
        mitra_user_id: fixture[2].id,
        item_id: itemA1,
        request_type: "stock_change",
        proposed_stock_quantity: 8,
        reason,
        status: "pending",
      })
      .select("id")
      .single();

    expect(isRejected(result)).toBe(true);
    const { data: row } = await requestRowByReason(reason);
    expect(row).toBeNull();
  });

  it("keeps the official tRPC submitNewItem working", async () => {
    const { caller } = await callerFor(fixture[2]);
    const result = await caller.supplier.submitNewItem({
      name: "OPEN-2 tRPC new item",
      sku: "OPEN2-TRPC-NEW",
      unit: "pcs",
      proposedStockQuantity: 5,
      proposedMinimumStock: 1,
      reason: "OPEN2 tRPC new item reason",
    });

    expect(result.requestType).toBe("new_item");
    expect(result.itemId).toBeNull();
    expect(result.status).toBe("pending");
    createdRequests.push(result.id);
  });

  it("keeps the official tRPC submitStockChange working", async () => {
    const { caller } = await callerFor(fixture[2]);
    const result = await caller.supplier.submitStockChange({
      itemId: itemA1,
      proposedStockQuantity: 3,
      reason: "OPEN2 tRPC stock change reason",
    });

    expect(result.requestType).toBe("stock_change");
    expect(result.itemId).toBe(itemA1);
    expect(result.status).toBe("pending");
    createdRequests.push(result.id);
  });

  it("blocks direct Mitra UPDATE of consignment_requests", async () => {
    const reason = "OPEN2 update block reason";
    const { data: created } = await mitraA
      .from("consignment_requests")
      .insert({
        distributor_id: fixture[0].id,
        mitra_user_id: fixture[2].id,
        item_id: itemA1,
        request_type: "stock_change",
        proposed_stock_quantity: 8,
        reason,
        status: "pending",
      })
      .select("id")
      .single();
    expect(created?.id).toBeTruthy();
    if (created?.id) createdRequests.push(created.id);

    const { data, error } = await mitraA
      .from("consignment_requests")
      .update({ status: "approved" })
      .eq("id", created!.id)
      .select("id");

    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: row } = await admin
      .from("consignment_requests")
      .select("status")
      .eq("id", created!.id)
      .maybeSingle();
    expect(row?.status).toBe("pending");
  });

  it("blocks every Distributor from reviewing because approval is now an Admin decision", async () => {
    const reason = "OPEN2 distributor review reason";
    const { data: created } = await mitraA
      .from("consignment_requests")
      .insert({
        distributor_id: fixture[0].id,
        mitra_user_id: fixture[2].id,
        item_id: itemA1,
        request_type: "stock_change",
        proposed_stock_quantity: 8,
        reason,
        status: "pending",
      })
      .select("id")
      .single();
    expect(created?.id).toBeTruthy();
    if (created?.id) createdRequests.push(created.id);
    const requestId = created!.id;

    const { caller: distributorBCaller } = await callerFor(fixture[1]);
    await expect(
      distributorBCaller.supplier.adminReview({
        requestId,
        action: "reject",
        reviewNote: "OPEN2 cross tenant note",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const { caller: distributorACaller } = await callerFor(fixture[0]);
    await expect(
      distributorACaller.supplier.adminReview({
        requestId,
        action: "reject",
        reviewNote: "OPEN2 legitimate review note",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const { data: row } = await admin
      .from("consignment_requests")
      .select("status, reviewed_by")
      .eq("id", requestId)
      .maybeSingle();
    expect(row?.status).toBe("pending");
    expect(row?.reviewed_by).toBeNull();
  });
});