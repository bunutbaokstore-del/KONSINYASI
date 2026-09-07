import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "../../server/routers";
import type { TrpcContext } from "../../server/_core/context";

const RUN_LOCAL = process.env.RUN_LOCAL_TWO_TENANT === "1";
const LOCAL_URL = process.env.SUPABASE_LOCAL_URL ?? "http://127.0.0.1:54321";
const LOCAL_ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;
const LOCAL_SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;

if (!LOCAL_URL.startsWith("http://127.0.0.1:") && !LOCAL_URL.startsWith("http://localhost:")) {
  throw new Error("local-supplier-approval integration test refuses a non-local SUPABASE_LOCAL_URL");
}

type FixtureUser = {
  email: string;
  password: string;
  role: "distributor" | "admin" | "mitra_umkm";
  id?: string;
  distributorId?: string;
};

const fixture: FixtureUser[] = [
  { email: "auth-step2-d1@example.local", password: "LocalOnly-Step2-D1!safe", role: "distributor" },
  { email: "auth-step2-d2@example.local", password: "LocalOnly-Step2-D2!safe", role: "distributor" },
  { email: "auth-step2-admin1@example.local", password: "LocalOnly-Step2-A1!safe", role: "admin" },
  { email: "auth-step2-mitra1@example.local", password: "LocalOnly-Step2-M1!safe", role: "mitra_umkm" },
  { email: "auth-step2-mitra2@example.local", password: "LocalOnly-Step2-M2!safe", role: "mitra_umkm" },
  { email: "auth-step2-mitra3@example.local", password: "LocalOnly-Step2-M3!safe", role: "mitra_umkm" },
];

let admin: SupabaseClient;
let requestAId: string;
let requestBId: string;
let rejectedRequestId: string;
let stockChangeRequestIds: string[] = [];

function assertLocalTestConfiguration() {
  if (!RUN_LOCAL) throw new Error("Set RUN_LOCAL_TWO_TENANT=1 to run the local-only approval fixture");
  if (!LOCAL_ANON_KEY || !LOCAL_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_LOCAL_ANON_KEY and SUPABASE_LOCAL_SERVICE_ROLE_KEY are required");
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
    full_name: `STEP 2 ${user.role}`,
    phone: "0900000000",
    emergency_contact_name: "Local Fixture",
    emergency_contact_relation: "Test Contact",
    emergency_contact_phone: "0900000001",
    address: "Local Supabase approval fixture address",
    ktp_storage_path: `step2/${user.distributorId}/${user.id}/fixture.jpg`,
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

async function cleanupFixture() {
  const ids = fixture.filter((user): user is FixtureUser & { id: string } => Boolean(user.id));
  if (ids.length === 0) return;

  const cleanupErrors: string[] = [];
  const userIds = ids.map((user) => user.id);
  const requestIds = [requestAId, requestBId, rejectedRequestId, ...stockChangeRequestIds].filter(Boolean);

  if (requestIds.length > 0) {
    for (const table of ["notifications", "stock_movements"] as const) {
      const { error } = await admin.from(table).delete().in("request_id", requestIds);
      if (error) cleanupErrors.push(`${table} cleanup failed: ${error.message}`);
    }

    const { error: requestError } = await admin
      .from("consignment_requests")
      .delete()
      .in("id", requestIds);
    if (requestError) cleanupErrors.push(`consignment_requests cleanup failed: ${requestError.message}`);
  }

  const mitraIds = fixture.filter((user) => user.role === "mitra_umkm").map((user) => user.id).filter((id): id is string => Boolean(id));
  const { data: items } = await admin.from("consignment_items").select("id").in("mitra_user_id", mitraIds);
  const itemIds = (items ?? []).map((item) => item.id);
  if (itemIds.length > 0) {
    const { error } = await admin.from("stock_movements").delete().in("item_id", itemIds);
    if (error) cleanupErrors.push(`stock_movements item cleanup failed: ${error.message}`);
    const { error: itemError } = await admin.from("consignment_items").delete().in("id", itemIds);
    if (itemError) cleanupErrors.push(`consignment_items cleanup failed: ${itemError.message}`);
  }

  const { error: productsError } = await admin.from("products").delete().in("created_by_mitra_user_id", mitraIds);
  if (productsError) cleanupErrors.push(`products cleanup failed: ${productsError.message}`);

  const { error: profileError } = await admin.from("user_profiles").delete().in("user_id", userIds);
  if (profileError) cleanupErrors.push(`user_profiles cleanup failed: ${profileError.message}`);

  for (const user of [...ids].reverse()) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) cleanupErrors.push(`Auth cleanup failed for ${user.email}: ${error.message}`);
  }

  if (cleanupErrors.length > 0) throw new Error(cleanupErrors.join("; "));
}

describe.skipIf(!RUN_LOCAL)("LOCAL Supplier Request New Item approval E2E", () => {
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
      await provisionUser(fixture[4], fixture[1].id);
      await provisionUser(fixture[5], fixture[0].id);
    } catch (error) {
      try {
        await cleanupFixture();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Approval fixture setup and cleanup failed");
      }
      throw error;
    }
  });

  afterAll(async () => {
    if (admin) await cleanupFixture();
  });

  it("submits a pending New Item request and keeps Admin read-only", async () => {
    const { caller: mitraCaller } = await callerFor(fixture[3]);
    const adminA = await signIn(fixture[2]);

    const request = await mitraCaller.supplier.submitNewItem({
      name: "STEP2 APPROVAL ITEM",
      sku: "STEP2-APPROVAL-001",
      unit: "pcs",
      proposedStockQuantity: 12,
      proposedMinimumStock: 3,
      reason: "Initial local approval fixture",
    });

    expect(request.requestType).toBe("new_item");
    expect(request.status).toBe("pending");
    expect(request.productId).toBeNull();
    expect(request.itemId).toBeNull();
    requestAId = request.id;

    const { data: adminRead, error: adminReadError } = await adminA
      .from("consignment_requests")
      .select("id, status")
      .eq("id", requestAId)
      .single();
    expect(adminReadError).toBeNull();
    expect(adminRead?.status).toBe("pending");

    const { caller: adminCaller } = await callerFor(fixture[2]);
    await expect(adminCaller.supplier.review({
      requestId: requestAId,
      decision: "approved",
      reviewNote: "admin must not approve",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("approves New Item server-side and links Product Master to Consignment Item", async () => {
    const { caller: distributorCaller } = await callerFor(fixture[0]);
    const beforeProducts = await admin.from("products").select("id").eq("distributor_id", fixture[0].id!);
    const review = await distributorCaller.supplier.review({
      requestId: requestAId,
      decision: "approved",
      reviewNote: "approved by local Distributor",
    });
    expect(review.status).toBe("approved");

    const { data: request, error: requestError } = await admin
      .from("consignment_requests")
      .select("status, product_id, item_id, reviewed_by, review_note")
      .eq("id", requestAId)
      .single();
    expect(requestError).toBeNull();
    expect(request?.status).toBe("approved");
    expect(request?.reviewed_by).toBe(fixture[0].id);
    expect(request?.review_note).toBe("approved by local Distributor");
    expect(request?.product_id).toBeTruthy();
    expect(request?.item_id).toBeTruthy();

    const { data: product, error: productError } = await admin
      .from("products")
      .select("id, distributor_id, created_by_mitra_user_id, name, sku, unit")
      .eq("id", request!.product_id)
      .single();
    expect(productError).toBeNull();
    expect(product?.id).toBe(request!.product_id);
    expect(product?.distributor_id).toBe(fixture[0].id);
    expect(product?.created_by_mitra_user_id).toBe(fixture[3].id);

    const { data: item, error: itemError } = await admin
      .from("consignment_items")
      .select("id, distributor_id, mitra_user_id, product_id, stock_quantity")
      .eq("id", request!.item_id)
      .single();
    expect(itemError).toBeNull();
    expect(item?.id).toBe(request!.item_id);
    expect(item?.distributor_id).toBe(fixture[0].id);
    expect(item?.mitra_user_id).toBe(fixture[3].id);
    expect(item?.product_id).toBe(product?.id);
    expect(item?.stock_quantity).toBe(12);

    const afterProducts = await admin.from("products").select("id").eq("distributor_id", fixture[0].id!);
    expect((afterProducts.data ?? []).length).toBe((beforeProducts.data ?? []).length + 1);

    const { data: movement, error: movementError } = await admin
      .from("stock_movements")
      .select("movement_type, item_id, request_id, approved_by, resulting_stock")
      .eq("request_id", requestAId)
      .single();
    expect(movementError).toBeNull();
    expect(movement?.movement_type).toBe("initial_stock");
    expect(movement?.item_id).toBe(request!.item_id);
    expect(movement?.approved_by).toBe(fixture[0].id);
    expect(movement?.resulting_stock).toBe(12);

    const { data: notification, error: notificationError } = await admin
      .from("notifications")
      .select("notification_type, recipient_user_id, request_id")
      .eq("request_id", requestAId)
      .eq("recipient_user_id", fixture[3].id!)
      .single();
    expect(notificationError).toBeNull();
    expect(notification?.notification_type).toBe("request_approved");

    await expect(distributorCaller.supplier.review({
      requestId: requestAId,
      decision: "rejected",
      reviewNote: "duplicate review must fail",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects Mitra review and preserves rejection without Product Master or Item", async () => {
    const { caller: mitraCaller } = await callerFor(fixture[3]);
    const submittedRequest = await mitraCaller.supplier.submitNewItem({
      name: "STEP2 REJECTION ITEM",
      sku: "STEP2-REJECT-001",
      unit: "pcs",
      proposedStockQuantity: 4,
      proposedMinimumStock: 1,
      reason: "Initial local rejection fixture",
    });
    rejectedRequestId = submittedRequest.id;

    const beforeProducts = await admin.from("products").select("id").eq("distributor_id", fixture[0].id!);
    const beforeItems = await admin.from("consignment_items").select("id").eq("mitra_user_id", fixture[3].id!);

    await expect(mitraCaller.supplier.review({
      requestId: rejectedRequestId,
      decision: "rejected",
      reviewNote: "mitra must not review",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const { caller: distributorCaller } = await callerFor(fixture[0]);
    const rejection = await distributorCaller.supplier.review({
      requestId: rejectedRequestId,
      decision: "rejected",
      reviewNote: "rejected by local Distributor",
    });
    expect(rejection.status).toBe("rejected");

    const { data: rejectedRow } = await admin.from("consignment_requests").select("status, review_note, product_id, item_id").eq("id", rejectedRequestId).single();
    expect(rejectedRow?.status).toBe("rejected");
    expect(rejectedRow?.review_note).toBe("rejected by local Distributor");
    expect(rejectedRow?.product_id).toBeNull();
    expect(rejectedRow?.item_id).toBeNull();

    const afterProducts = await admin.from("products").select("id").eq("distributor_id", fixture[0].id!);
    const afterItems = await admin.from("consignment_items").select("id").eq("mitra_user_id", fixture[3].id!);
    expect(afterProducts.data?.length).toBe(beforeProducts.data?.length);
    expect(afterItems.data?.length).toBe(beforeItems.data?.length);
  });

  async function prepareStockChange(initialStock: number, proposedStockQuantity: number, reason: string) {
    const itemId = (await admin
      .from("consignment_requests")
      .select("item_id")
      .eq("id", requestAId)
      .single()).data?.item_id;
    expect(itemId).toBeTruthy();
    const { error: resetError } = await admin
      .from("consignment_items")
      .update({ stock_quantity: initialStock })
      .eq("id", itemId!);
    expect(resetError).toBeNull();
    const { caller: mitraCaller } = await callerFor(fixture[3]);
    const request = await mitraCaller.supplier.submitStockChange({
      itemId: itemId!,
      proposedStockQuantity,
      reason,
    });
    stockChangeRequestIds.push(request.id);
    expect(request.requestType).toBe("stock_change");
    expect(request.status).toBe("pending");
    return { itemId: itemId!, requestId: request.id };
  }

  it("approves stock_change with an increase and records canonical movement and notification", async () => {
    const { itemId, requestId } = await prepareStockChange(10, 15, "Increase stock for lifecycle test");
    const { caller: distributorCaller } = await callerFor(fixture[0]);
    const review = await distributorCaller.supplier.review({ requestId, decision: "approved", reviewNote: "approved increase" });
    expect(review.status).toBe("approved");

    const { data: item } = await admin.from("consignment_items").select("stock_quantity").eq("id", itemId).single();
    expect(item?.stock_quantity).toBe(15);
    const { data: movements, error: movementError } = await admin
      .from("stock_movements")
      .select("movement_type, previous_stock, change_quantity, resulting_stock, request_id, item_id, mitra_user_id, distributor_id, approved_by")
      .eq("request_id", requestId);
    expect(movementError).toBeNull();
    expect(movements).toHaveLength(1);
    expect(movements?.[0]).toMatchObject({
      movement_type: "supplier_stock_change",
      previous_stock: 10,
      change_quantity: 5,
      resulting_stock: 15,
      request_id: requestId,
      item_id: itemId,
      mitra_user_id: fixture[3].id,
      distributor_id: fixture[0].id,
      approved_by: fixture[0].id,
    });
    const { data: notifications, error: notificationError } = await admin
      .from("notifications")
      .select("notification_type, recipient_user_id, request_id, distributor_id")
      .eq("request_id", requestId);
    expect(notificationError).toBeNull();
    const approvedNotifications = notifications?.filter(
  (notification) => notification.notification_type === "request_approved",
);
expect(approvedNotifications).toHaveLength(1);
expect(approvedNotifications?.[0]).toMatchObject({
      notification_type: "request_approved",
      recipient_user_id: fixture[3].id,
      request_id: requestId,
      distributor_id: fixture[0].id,
    });
  });

  it("approves stock_change with a decrease and records the negative delta", async () => {
    const { itemId, requestId } = await prepareStockChange(10, 4, "Decrease stock for lifecycle test");
    const { caller: distributorCaller } = await callerFor(fixture[0]);
    await expect(distributorCaller.supplier.review({ requestId, decision: "approved", reviewNote: "approved decrease" })).resolves.toMatchObject({ status: "approved" });
    const { data: item } = await admin.from("consignment_items").select("stock_quantity").eq("id", itemId).single();
    expect(item?.stock_quantity).toBe(4);
    const { data: movements } = await admin.from("stock_movements").select("movement_type, previous_stock, change_quantity, resulting_stock").eq("request_id", requestId);
    expect(movements).toHaveLength(1);
    expect(movements?.[0]).toMatchObject({ movement_type: "supplier_stock_change", previous_stock: 10, change_quantity: -6, resulting_stock: 4 });
  });

  it("approves stock_change with unchanged quantity and records a zero delta", async () => {
    const { itemId, requestId } = await prepareStockChange(10, 10, "Keep stock for lifecycle test");
    const { caller: distributorCaller } = await callerFor(fixture[0]);
    await expect(distributorCaller.supplier.review({ requestId, decision: "approved", reviewNote: "approved unchanged" })).resolves.toMatchObject({ status: "approved" });
    const { data: item } = await admin.from("consignment_items").select("stock_quantity").eq("id", itemId).single();
    expect(item?.stock_quantity).toBe(10);
    const { data: movements } = await admin.from("stock_movements").select("movement_type, previous_stock, change_quantity, resulting_stock").eq("request_id", requestId);
    expect(movements).toHaveLength(1);
    expect(movements?.[0]).toMatchObject({ movement_type: "supplier_stock_change", previous_stock: 10, change_quantity: 0, resulting_stock: 10 });
  });

  it("rejects stock_change without changing stock or creating a movement", async () => {
    const { itemId, requestId } = await prepareStockChange(10, 4, "Reject stock change for lifecycle test");
    const { data: beforeMovements } = await admin.from("stock_movements").select("id").eq("item_id", itemId);
    const { caller: distributorCaller } = await callerFor(fixture[0]);
    const rejection = await distributorCaller.supplier.review({ requestId, decision: "rejected", reviewNote: "rejected stock change" });
    expect(rejection.status).toBe("rejected");
    const { data: item } = await admin.from("consignment_items").select("stock_quantity").eq("id", itemId).single();
    expect(item?.stock_quantity).toBe(10);
    const { data: afterMovements } = await admin.from("stock_movements").select("id").eq("item_id", itemId);
    expect(afterMovements).toHaveLength(beforeMovements?.length ?? 0);
    const { data: request } = await admin.from("consignment_requests").select("status, review_note").eq("id", requestId).single();
    expect(request).toMatchObject({ status: "rejected", review_note: "rejected stock change" });
    const { data: notifications } = await admin.from("notifications").select("notification_type, recipient_user_id, request_id, distributor_id").eq("request_id", requestId);
    const rejectedNotifications = notifications?.filter(
  (notification) => notification.notification_type === "request_rejected",
);
expect(rejectedNotifications).toHaveLength(1);
expect(rejectedNotifications?.[0]).toMatchObject({
  notification_type: "request_rejected", recipient_user_id: fixture[3].id, request_id: requestId, distributor_id: fixture[0].id });
  });

  it("rejects sequential replay for approved and rejected stock_change requests", async () => {
    const approved = await prepareStockChange(10, 15, "Replay approved stock change");
    const { caller: distributorCaller } = await callerFor(fixture[0]);
    await distributorCaller.supplier.review({ requestId: approved.requestId, decision: "approved", reviewNote: "first approval" });
    const { data: approvedBefore } = await admin.from("consignment_items").select("stock_quantity").eq("id", approved.itemId).single();
    const { data: approvedMovementsBefore } = await admin.from("stock_movements").select("id").eq("request_id", approved.requestId);
    const { data: approvedNotificationsBefore } = await admin.from("notifications").select("id").eq("request_id", approved.requestId);
    await expect(distributorCaller.supplier.review({ requestId: approved.requestId, decision: "rejected", reviewNote: "replay must fail" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const { data: approvedAfter } = await admin.from("consignment_items").select("stock_quantity").eq("id", approved.itemId).single();
    const { data: approvedMovementsAfter } = await admin.from("stock_movements").select("id").eq("request_id", approved.requestId);
    const { data: approvedNotificationsAfter } = await admin.from("notifications").select("id").eq("request_id", approved.requestId);
    expect(approvedAfter?.stock_quantity).toBe(approvedBefore?.stock_quantity);
    expect(approvedMovementsAfter).toHaveLength(approvedMovementsBefore?.length ?? 0);
    expect(approvedNotificationsAfter).toHaveLength(approvedNotificationsBefore?.length ?? 0);

    const rejected = await prepareStockChange(10, 4, "Replay rejected stock change");
    await distributorCaller.supplier.review({ requestId: rejected.requestId, decision: "rejected", reviewNote: "first rejection" });
    const { data: rejectedBefore } = await admin.from("consignment_items").select("stock_quantity").eq("id", rejected.itemId).single();
    const { data: rejectedMovementsBefore } = await admin.from("stock_movements").select("id").eq("request_id", rejected.requestId);
    const { data: rejectedNotificationsBefore } = await admin.from("notifications").select("id").eq("request_id", rejected.requestId);
    await expect(distributorCaller.supplier.review({ requestId: rejected.requestId, decision: "approved", reviewNote: "replay must fail" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const { data: rejectedAfter } = await admin.from("consignment_items").select("stock_quantity").eq("id", rejected.itemId).single();
    const { data: rejectedMovementsAfter } = await admin.from("stock_movements").select("id").eq("request_id", rejected.requestId);
    const { data: rejectedNotificationsAfter } = await admin.from("notifications").select("id").eq("request_id", rejected.requestId);
    expect(rejectedAfter?.stock_quantity).toBe(rejectedBefore?.stock_quantity);
    expect(rejectedMovementsAfter).toHaveLength(rejectedMovementsBefore?.length ?? 0);
    expect(rejectedNotificationsAfter).toHaveLength(rejectedNotificationsBefore?.length ?? 0);
  });
it("allows only one concurrent approval for the same stock_change request", async () => {
  const prepared = await prepareStockChange(10, 15, "Concurrent approval test");
  const { caller: distributorCallerA } = await callerFor(fixture[0]);
  const { caller: distributorCallerB } = await callerFor(fixture[0]);

  const results = await Promise.allSettled([
    distributorCallerA.supplier.review({
      requestId: prepared.requestId,
      decision: "approved",
      reviewNote: "concurrent approval A",
    }),
    distributorCallerB.supplier.review({
      requestId: prepared.requestId,
      decision: "approved",
      reviewNote: "concurrent approval B",
    }),
  ]);

  const fulfilled = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result) => result.status === "rejected");

  expect(fulfilled).toHaveLength(1);
  expect(rejected).toHaveLength(1);

  const { data: requestAfter } = await admin
    .from("consignment_requests")
    .select("status")
    .eq("id", prepared.requestId)
    .single();

  const { data: itemAfter } = await admin
    .from("consignment_items")
    .select("stock_quantity")
    .eq("id", prepared.itemId)
    .single();

  const { data: movementsAfter } = await admin
    .from("stock_movements")
    .select("id")
    .eq("request_id", prepared.requestId);

  const { data: notificationsAfter } = await admin
    .from("notifications")
    .select("id")
    .eq("request_id", prepared.requestId)
    .in("notification_type", ["request_approved", "request_rejected"]);

  expect(requestAfter?.status).toBe("approved");
  expect(itemAfter?.stock_quantity).toBe(15);
  expect(movementsAfter).toHaveLength(1);
  expect(notificationsAfter).toHaveLength(1);
});
  it("rejects stock_change item scope, reviewer role, forged identity, and invalid quantities", async () => {
    const { caller: mitraA } = await callerFor(fixture[3]);
    const { caller: mitraB } = await callerFor(fixture[4]);
    const { caller: mitraSameWorkspace } = await callerFor(fixture[5]);
    const { data: sameWorkspaceItem, error: sameWorkspaceItemError } = await admin
      .from("consignment_items")
      .insert({
        distributor_id: fixture[0].id,
        mitra_user_id: fixture[5].id,
        name: "STEP2 SAME WORKSPACE ITEM",
        unit: "pcs",
        stock_quantity: 10,
        minimum_stock: 1,
      })
      .select("id")
      .single();
    expect(sameWorkspaceItemError).toBeNull();
    expect(sameWorkspaceItem?.id).toBeTruthy();

    await expect(mitraA.supplier.submitStockChange({ itemId: sameWorkspaceItem!.id, proposedStockQuantity: 11, reason: "wrong Mitra item" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { data: tenantBItem, error: tenantBItemError } = await admin
      .from("consignment_items")
      .insert({
        distributor_id: fixture[1].id,
        mitra_user_id: fixture[4].id,
        name: "STEP2 TENANT B ITEM",
        unit: "pcs",
        stock_quantity: 10,
        minimum_stock: 1,
      })
      .select("id")
      .single();
    expect(tenantBItemError).toBeNull();
    await expect(mitraA.supplier.submitStockChange({ itemId: tenantBItem!.id, proposedStockQuantity: 11, reason: "wrong tenant item" })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const pending = await mitraSameWorkspace.supplier.submitStockChange({ itemId: sameWorkspaceItem!.id, proposedStockQuantity: 11, reason: "role boundary fixture" });
    stockChangeRequestIds.push(pending.id);
    const { caller: adminCaller } = await callerFor(fixture[2]);
    await expect(adminCaller.supplier.review({ requestId: pending.id, decision: "approved", reviewNote: "admin must fail" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(mitraSameWorkspace.supplier.review({ requestId: pending.id, decision: "approved", reviewNote: "mitra must fail" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const { caller: distributorB } = await callerFor(fixture[1]);
    await expect(distributorB.supplier.review({ requestId: pending.id, decision: "approved", reviewNote: "wrong distributor must fail" })).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(mitraA.supplier.submitStockChange({ itemId: sameWorkspaceItem!.id, proposedStockQuantity: -1, reason: "negative quantity" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(mitraA.supplier.submitStockChange({ itemId: sameWorkspaceItem!.id, proposedStockQuantity: 1.5 as number, reason: "decimal quantity" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const mitraAItemId = (await admin.from("consignment_requests").select("item_id").eq("id", requestAId).single()).data?.item_id;
    expect(mitraAItemId).toBeTruthy();
    const forgedPayload = { itemId: mitraAItemId!, proposedStockQuantity: 12, reason: "forged scope", distributorId: fixture[1].id, mitraUserId: fixture[4].id };
    const forgedRequest = await mitraA.supplier.submitStockChange(forgedPayload);
    stockChangeRequestIds.push(forgedRequest.id);
    expect(forgedRequest).toMatchObject({ mitraUserId: fixture[3].id, itemId: mitraAItemId });
  });

  it("rejects cross-tenant review, forged reviewer, and unauthorized direct RPC", async () => {
    const { caller: mitraBCaller } = await callerFor(fixture[4]);
    const request = await mitraBCaller.supplier.submitNewItem({
      name: "STEP2 TENANT B ITEM",
      sku: "STEP2-TENANT-B-001",
      unit: "pcs",
      proposedStockQuantity: 2,
      proposedMinimumStock: 1,
      reason: "Tenant B isolation fixture",
    });
    requestBId = request.id;

    const { caller: distributorACaller } = await callerFor(fixture[0]);
    const distributorA = await signIn(fixture[0]);
    const crossTenantRead = await distributorA.from("consignment_requests").select("id").eq("id", requestBId);
    expect(crossTenantRead.error).toBeNull();
    expect(crossTenantRead.data).toEqual([]);

    await expect(distributorACaller.supplier.review({
      requestId: requestBId,
      decision: "approved",
      reviewNote: "cross tenant must fail",
    })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const forgedReviewer = await admin.rpc("review_consignment_request", {
      p_request_id: requestBId,
      p_distributor_id: fixture[1].id,
      p_reviewer_id: fixture[0].id,
      p_decision: "approved",
      p_review_note: "forged reviewer must fail",
    });
    expect(forgedReviewer.error?.code).toBe("42501");

    const directUnauthorized = await distributorA.rpc("review_consignment_request", {
      p_request_id: requestBId,
      p_distributor_id: fixture[1].id,
      p_reviewer_id: fixture[1].id,
      p_decision: "approved",
      p_review_note: "direct unauthorized rpc must fail",
    });
    expect(directUnauthorized.data).toBeNull();
    expect(directUnauthorized.error).toBeTruthy();
  });
});
