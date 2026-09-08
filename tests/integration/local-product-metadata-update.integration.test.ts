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
    "local-product-metadata-update integration test refuses a non-local SUPABASE_LOCAL_URL",
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
  { email: "ws1c-d1@example.local", password: "LocalOnly-WS1C-D1!safe", role: "distributor" },
  { email: "ws1c-m1@example.local", password: "LocalOnly-WS1C-M1!safe", role: "mitra_umkm" },
  { email: "ws1c-a1@example.local", password: "LocalOnly-WS1C-A1!safe", role: "admin" },
  { email: "ws1c-d2@example.local", password: "LocalOnly-WS1C-D2!safe", role: "distributor" },
];

let admin: SupabaseClient;
const createdItems: string[] = [];
const createdProducts: string[] = [];
let productA: string;
let productB: string;
let distributorCaller: ReturnType<typeof appRouter.createCaller>;
let mitraCaller: ReturnType<typeof appRouter.createCaller>;
let adminCaller: ReturnType<typeof appRouter.createCaller>;

function assertLocalTestConfiguration() {
  if (!RUN_LOCAL)
    throw new Error(
      "Set RUN_LOCAL_TWO_TENANT=1 to run the WS-1C local integration fixture",
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
    full_name: `WS-1C ${user.role}`,
    phone: "0900000003",
    emergency_contact_name: "Local Fixture",
    emergency_contact_relation: "Test Contact",
    emergency_contact_phone: "0900000004",
    address: "Local Supabase WS-1C fixture address",
    ktp_storage_path: `ws1c/${user.distributorId}/${user.id}/fixture.jpg`,
    ktp_original_name: "fixture.jpg",
    ktp_content_type: "image/jpeg",
  });
  expect(profileError).toBeNull();
}

async function callerFor(user: FixtureUser) {
  const loginClient = createClient(LOCAL_URL, LOCAL_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: login, error: loginError } = await loginClient.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  expect(loginError).toBeNull();
  const accessToken = login.session?.access_token;
  expect(accessToken).toBeTruthy();
  const client = createUserClient(accessToken!);
  const { data, error } = await client.auth.getUser();
  expect(error).toBeNull();
  expect(data.user).toBeTruthy();
  const context: TrpcContext = {
    req: {
      headers: { authorization: `Bearer ${accessToken}` },
    } as unknown as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user: null,
    supabaseUser: data.user,
  };
  return appRouter.createCaller(context);
}

async function cleanupFixture() {
  const cleanupErrors: string[] = [];

  if (createdItems.length > 0) {
    const { error } = await admin.from("consignment_items").delete().in("id", createdItems);
    if (error) cleanupErrors.push(`consignment_items cleanup failed: ${error.message}`);
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
    if (profileError) cleanupErrors.push(`user_profiles cleanup failed: ${profileError.message}`);
    for (const user of [...ids].reverse()) {
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error && !/user not found/i.test(error.message)) {
        cleanupErrors.push(`Auth cleanup failed for ${user.email}: ${error.message}`);
      }
    }
  }

  if (cleanupErrors.length > 0) {
    throw new Error(cleanupErrors.join("; "));
  }
}

async function productRow(productId: string) {
  const { data, error } = await admin
    .from("products")
    .select("category, size, selling_price, lifecycle_status, updated_at")
    .eq("id", productId)
    .maybeSingle();
  expect(error).toBeNull();
  return data;
}

describe.skipIf(!RUN_LOCAL)("WS-1C products.update metadata", () => {
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

      const { data: product, error: productError } = await admin
        .from("products")
        .insert({
          distributor_id: fixture[0].id,
          created_by_mitra_user_id: fixture[1].id,
          name: "WS-1C PRODUCT A",
          sku: "WS1C-PROD-A",
          unit: "pcs",
          lifecycle_status: "active",
        })
        .select("id")
        .single();
      expect(productError).toBeNull();
      expect(product?.id).toBeTruthy();
      productA = product!.id;
      createdProducts.push(productA);

      const { data: item, error: itemError } = await admin
        .from("consignment_items")
        .insert({
          distributor_id: fixture[0].id,
          mitra_user_id: fixture[1].id,
          product_id: productA,
          name: "WS-1C ITEM A",
          sku: "WS1C-ITEM-A",
          unit: "pcs",
          stock_quantity: 0,
          minimum_stock: 0,
        })
        .select("id")
        .single();
      expect(itemError).toBeNull();
      expect(item?.id).toBeTruthy();
      createdItems.push(item!.id);

      const { data: other, error: otherError } = await admin
        .from("products")
        .insert({
          distributor_id: fixture[3].id,
          name: "WS-1C PRODUCT B",
          sku: "WS1C-PROD-B",
          unit: "pcs",
          lifecycle_status: "active",
        })
        .select("id")
        .single();
      expect(otherError).toBeNull();
      expect(other?.id).toBeTruthy();
      productB = other!.id;
      createdProducts.push(productB);

      distributorCaller = await callerFor(fixture[0]);
      mitraCaller = await callerFor(fixture[1]);
      adminCaller = await callerFor(fixture[2]);
    } catch (error) {
      try {
        await cleanupFixture();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "WS-1C fixture setup and cleanup failed",
        );
      }
      throw error;
    }
  });

  afterAll(async () => {
    if (admin) await cleanupFixture();
  });

  it("distributor updates metadata and list reflects it", async () => {
    const updated = await distributorCaller.products.update({
      productId: productA,
      category: "Minuman",
      size: "250 g",
      sellingPrice: 12500,
    });
    expect(updated.id).toBe(productA);
    expect(updated.category).toBe("Minuman");
    expect(updated.size).toBe("250 g");
    expect(updated.sellingPrice).toBe(12500);
    expect(typeof updated.sellingPrice).toBe("number");
    expect(updated.lifecycleStatus).toBe("active");

    const rows = await distributorCaller.products.list();
    const match = rows.find((row) => row.id === productA);
    expect(match?.category).toBe("Minuman");
    expect(match?.size).toBe("250 g");
    expect(match?.sellingPrice).toBe(12500);

    const row = await productRow(productA);
    expect(Number(row?.selling_price)).toBe(12500);
    expect(row?.category).toBe("Minuman");
  });

  it("partial update leaves other fields untouched", async () => {
    const updated = await distributorCaller.products.update({
      productId: productA,
      size: "300 ml",
    });
    expect(updated.category).toBe("Minuman");
    expect(updated.size).toBe("300 ml");
    expect(updated.sellingPrice).toBe(12500);

    const row = await productRow(productA);
    expect(row?.category).toBe("Minuman");
    expect(row?.size).toBe("300 ml");
    expect(Number(row?.selling_price)).toBe(12500);
  });

  it("null update clears metadata without error", async () => {
    const updated = await distributorCaller.products.update({
      productId: productA,
      category: null,
      size: null,
      sellingPrice: null,
    });
    expect(updated.category).toBeNull();
    expect(updated.size).toBeNull();
    expect(updated.sellingPrice).toBeNull();

    const row = await productRow(productA);
    expect(row?.category).toBeNull();
    expect(row?.size).toBeNull();
    expect(row?.selling_price).toBeNull();
  });

  it("does not change lifecycle_status", async () => {
    await distributorCaller.products.update({ productId: productA, sellingPrice: 9999 });
    const row = await productRow(productA);
    expect(row?.lifecycle_status).toBe("active");
  });

  it("rejects a product owned by another distributor with NOT_FOUND", async () => {
    await expect(
      distributorCaller.products.update({ productId: productB, category: "Makanan" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects Admin with FORBIDDEN", async () => {
    await expect(
      adminCaller.products.update({ productId: productA, category: "Makanan" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects Mitra with FORBIDDEN", async () => {
    await expect(
      mitraCaller.products.update({ productId: productA, category: "Makanan" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects unknown fields with a validation error", async () => {
    await expect(
      distributorCaller.products.update({
        productId: productA,
        category: "Makanan",
        sku: "HACK",
      } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects an invalid UUID", async () => {
    await expect(
      distributorCaller.products.update({ productId: "not-a-uuid" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a negative sellingPrice", async () => {
    await expect(
      distributorCaller.products.update({ productId: productA, sellingPrice: -1 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects an empty category", async () => {
    await expect(
      distributorCaller.products.update({ productId: productA, category: "   " }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a size longer than 40 characters", async () => {
    await expect(
      distributorCaller.products.update({ productId: productA, size: "x".repeat(41) }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects no metadata fields with BAD_REQUEST and does not bump updated_at", async () => {
    const before = await productRow(productA);
    await expect(
      distributorCaller.products.update({ productId: productA }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const after = await productRow(productA);
    expect(after?.updated_at).toEqual(before?.updated_at);
  });
});