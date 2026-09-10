import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "../../server/routers";
import type { TrpcContext } from "../../server/_core/context";

const RUN_LOCAL = process.env.RUN_LOCAL_TWO_TENANT === "1";
const LOCAL_URL = process.env.SUPABASE_LOCAL_URL ?? "http://127.0.0.1:54321";
const LOCAL_ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;
const LOCAL_SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;

if (!LOCAL_URL.startsWith("http://127.0.0.1:") && !LOCAL_URL.startsWith("http://localhost:")) {
  throw new Error("local-supplier-admin-review integration test refuses a non-local SUPABASE_LOCAL_URL");
}

type FixtureUser = {
  email: string;
  password: string;
  role: "distributor" | "admin" | "mitra_umkm";
  id?: string;
  distributorId?: string;
};

const fixture: FixtureUser[] = [
  { email: "auth-admr-d1@example.local", password: "LocalOnly-AdmR-D1!safe", role: "distributor" },
  { email: "auth-admr-a1@example.local", password: "LocalOnly-AdmR-A1!safe", role: "admin" },
  { email: "auth-admr-m1@example.local", password: "LocalOnly-AdmR-M1!safe", role: "mitra_umkm" },
  { email: "auth-admr-d2@example.local", password: "LocalOnly-AdmR-D2!safe", role: "distributor" },
  { email: "auth-admr-m2@example.local", password: "LocalOnly-AdmR-M2!safe", role: "mitra_umkm" },
];

let admin: SupabaseClient;
const trackedRequestIds: string[] = [];

function assertLocalTestConfiguration() {
  if (!RUN_LOCAL) throw new Error("Set RUN_LOCAL_TWO_TENANT=1 to run the local-only admin review fixture");
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
    full_name: `ADMR ${user.role}`,
    phone: "0900000100",
    emergency_contact_name: "Local Fixture",
    emergency_contact_relation: "Test Contact",
    emergency_contact_phone: "0900000101",
    address: "Local Supabase admin review fixture address",
    ktp_storage_path: `admreview/${user.distributorId}/${user.id}/fixture.jpg`,
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

  if (trackedRequestIds.length > 0) {
    for (const table of ["notifications", "stock_movements"] as const) {
      const { error } = await admin.from(table).delete().in("request_id", trackedRequestIds);
      if (error) cleanupErrors.push(`${table} cleanup failed: ${error.message}`);
    }
    const { error: requestError } = await admin.from("consignment_requests").delete().in("id", trackedRequestIds);
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

async function submitNewItem(mitra: FixtureUser, name: string, sku: string) {
  const { caller: mitraCaller } = await callerFor(mitra);
  const request = await mitraCaller.supplier.submitNewItem({
    name,
    sku,
    unit: "pcs",
    proposedStockQuantity: 5,
    proposedMinimumStock: 1,
    reason: "Admin review integration fixture",
  });
  expect(request.status).toBe("pending");
  trackedRequestIds.push(request.id);
  return request.id;
}

describe.skipIf(!RUN_LOCAL)("LOCAL Supplier one-stage Admin review E2E", () => {
  beforeAll(async () => {
    assertLocalTestConfiguration();
    process.env.SUPABASE_URL = LOCAL_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = LOCAL_SERVICE_ROLE_KEY;
    process.env.SUPABASE_PUBLISHABLE_KEY = LOCAL_ANON_KEY;
    admin = createAdminClient();
    try {
      await provisionUser(fixture[0]);
      await provisionUser(fixture[1], fixture[0].id);
      await provisionUser(fixture[2], fixture[0].id);
      await provisionUser(fixture[3]);
      await provisionUser(fixture[4], fixture[3].id);
    } catch (error) {
      try {
        await cleanupFixture();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Admin review fixture setup and cleanup failed");
      }
      throw error;
    }
  });

  afterAll(async () => {
    if (admin) await cleanupFixture();
  });

  it("approves a pending request as the final Admin decision and blocks Distributor review", async () => {
    const requestId = await submitNewItem(fixture[2], "ADMR APPROVE ITEM", "ADMR-APR-001");
    const { caller: adminCaller } = await callerFor(fixture[1]);

    const approved = await adminCaller.supplier.adminReview({
      requestId,
      action: "approve",
      reviewNote: "approved by admin",
    });
    expect(approved.status).toBe("approved");
    expect(approved.adminReviewedBy).toBe(fixture[1].id!);
    expect(approved.adminReviewedAt).toBeTruthy();
    expect(approved.reviewNote).toBe("approved by admin");

    const { data: row } = await admin.from("consignment_requests").select("status, admin_reviewed_by, admin_reviewed_at, reviewed_by, product_id, item_id").eq("id", requestId).single();
    expect(row).toMatchObject({
      status: "approved",
      admin_reviewed_by: fixture[1].id,
      reviewed_by: fixture[1].id,
    });
    expect(row?.admin_reviewed_at).toBeTruthy();
    expect(row?.product_id).toBeTruthy();
    expect(row?.item_id).toBeTruthy();

    const { data: products } = await admin.from("products").select("lifecycle_status").eq("id", row?.product_id ?? "");
    expect(products).toHaveLength(1);
    expect(products?.[0]?.lifecycle_status).toBe("active");

    const { data: notifications } = await admin.from("notifications").select("notification_type, recipient_user_id, request_id").eq("request_id", requestId);
    const forwardedNotifications = notifications?.filter((notification) => notification.notification_type === "awaiting_distributor_decision");
    expect(forwardedNotifications).toHaveLength(0);
    const approvedNotifications = notifications?.filter((notification) => notification.notification_type === "request_approved");
    expect(approvedNotifications).toHaveLength(1);
    expect(approvedNotifications?.[0]).toMatchObject({ recipient_user_id: fixture[2].id, request_id: requestId });

    const { caller: distributorCaller } = await callerFor(fixture[0]);
    await expect(distributorCaller.supplier.adminReview({ requestId, action: "approve", reviewNote: "distributor must not decide" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a pending request without creating a product and notifies the Mitra", async () => {
    const requestId = await submitNewItem(fixture[2], "ADMR REJECT ITEM", "ADMR-REJ-001");
    const { caller: adminCaller } = await callerFor(fixture[1]);

    const rejected = await adminCaller.supplier.adminReview({
      requestId,
      action: "reject",
      reviewNote: "rejected by admin",
    });
    expect(rejected.status).toBe("rejected");
    expect(rejected.adminReviewedBy).toBe(fixture[1].id!);
    expect(rejected.reviewNote).toBe("rejected by admin");

    const { data: row } = await admin.from("consignment_requests").select("status, product_id, item_id, admin_reviewed_by").eq("id", requestId).single();
    expect(row).toMatchObject({ status: "rejected", product_id: null, item_id: null, admin_reviewed_by: fixture[1].id });

    const { data: notifications } = await admin.from("notifications").select("recipient_user_id, notification_type, request_id").eq("request_id", requestId);
    const rejectedNotifications = notifications?.filter((notification) => notification.notification_type === "request_rejected");
    expect(rejectedNotifications).toHaveLength(1);
    expect(rejectedNotifications?.[0]).toMatchObject({ recipient_user_id: fixture[2].id, request_id: requestId });

    const { caller: distributorCaller } = await callerFor(fixture[0]);
    await expect(distributorCaller.supplier.adminReview({ requestId, action: "approve", reviewNote: "too late" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies Distributor, Mitra, and cross-tenant Admin review", async () => {
    const requestId = await submitNewItem(fixture[2], "ADMR AUTHZ ITEM", "ADMR-AUT-001");

    const { caller: distributorCaller } = await callerFor(fixture[0]);
    await expect(distributorCaller.supplier.adminReview({ requestId, action: "approve" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const { caller: mitraCaller } = await callerFor(fixture[2]);
    await expect(mitraCaller.supplier.adminReview({ requestId, action: "reject", reviewNote: "mitra must fail" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const tenantBRequestId = await submitNewItem(fixture[4], "ADMR TENANT B ITEM", "ADMR-TB-001");
    const { caller: adminCaller } = await callerFor(fixture[1]);
    await expect(adminCaller.supplier.adminReview({ requestId: tenantBRequestId, action: "approve", reviewNote: "cross tenant must fail" })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const { data: notForwarded } = await admin.from("consignment_requests").select("status").eq("id", requestId).single();
    expect(notForwarded?.status).toBe("pending");
  });

  describe("SEC-01 RLS: direct UPDATE authorization on consignment_requests", () => {
    it("denies Distributor direct UPDATE pending -> approved", async () => {
      const requestId = await submitNewItem(fixture[2], "SEC01 DIST APR", "SEC01-DAP-001");
      const { client: distributorClient } = await callerFor(fixture[0]);

      const updated = await distributorClient
        .from("consignment_requests")
        .update({ status: "approved" })
        .eq("id", requestId)
        .select("id");
      expect(updated.error).toBeNull();
      expect(updated.data ?? []).toHaveLength(0);

      const { data: row } = await admin.from("consignment_requests").select("status").eq("id", requestId).single();
      expect(row?.status).toBe("pending");
    });

    it("denies Distributor direct UPDATE pending -> rejected", async () => {
      const requestId = await submitNewItem(fixture[2], "SEC01 DIST REJ", "SEC01-DRE-001");
      const { client: distributorClient } = await callerFor(fixture[0]);

      const updated = await distributorClient
        .from("consignment_requests")
        .update({ status: "rejected" })
        .eq("id", requestId)
        .select("id");
      expect(updated.error).toBeNull();
      expect(updated.data ?? []).toHaveLength(0);

      const { data: row } = await admin.from("consignment_requests").select("status").eq("id", requestId).single();
      expect(row?.status).toBe("pending");
    });

    it("denies Mitra direct UPDATE after submission", async () => {
      const requestId = await submitNewItem(fixture[2], "SEC01 MITRA UPD", "SEC01-MUP-001");
      const { client: mitraClient } = await callerFor(fixture[2]);

      const updated = await mitraClient
        .from("consignment_requests")
        .update({ reason: "must be immutable via direct UPDATE" })
        .eq("id", requestId)
        .select("id");
      expect(updated.error).toBeNull();
      expect(updated.data ?? []).toHaveLength(0);

      const { data: row } = await admin.from("consignment_requests").select("status").eq("id", requestId).single();
      expect(row?.status).toBe("pending");
    });

    it("allows Admin direct UPDATE inside own tenant, never cross-tenant", async () => {
      const ownTenantRequestId = await submitNewItem(fixture[2], "SEC01 ADM OK", "SEC01-AOK-001");
      const tenantBRequestId = await submitNewItem(fixture[4], "SEC01 ADM X", "SEC01-AX-001");
      const { client: adminClient } = await callerFor(fixture[1]);

      const ownUpdated = await adminClient
        .from("consignment_requests")
        .update({ review_note: "rls probe" })
        .eq("id", ownTenantRequestId)
        .select("id");
      expect(ownUpdated.error).toBeNull();
      expect(ownUpdated.data ?? []).toHaveLength(1);

      const crossUpdated = await adminClient
        .from("consignment_requests")
        .update({ status: "approved" })
        .eq("id", tenantBRequestId)
        .select("id");
      expect(crossUpdated.error).toBeNull();
      expect(crossUpdated.data ?? []).toHaveLength(0);

      const { data: crossRow } = await admin.from("consignment_requests").select("status").eq("id", tenantBRequestId).single();
      expect(crossRow?.status).toBe("pending");
    });

    it("preserves Distributor SELECT within its tenant boundary", async () => {
      const requestId = await submitNewItem(fixture[2], "SEC01 DIST SEL", "SEC01-DSL-001");
      const { client: distributorClient } = await callerFor(fixture[0]);

      const { data: rows, error } = await distributorClient
        .from("consignment_requests")
        .select("id, status")
        .eq("id", requestId);
      expect(error).toBeNull();
      expect(rows ?? []).toHaveLength(1);
      expect(rows?.[0]?.status).toBe("pending");
    });
  });
});