import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "../../server/routers";
import type { TrpcContext } from "../../server/_core/context";
import { calculateHppSummary, type HppComponent } from "../../shared/hpp";

const RUN_LOCAL = process.env.RUN_LOCAL_TWO_TENANT === "1";
const LOCAL_URL = process.env.SUPABASE_LOCAL_URL ?? "http://127.0.0.1:54321";
const LOCAL_ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;
const LOCAL_SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;

if (!LOCAL_URL.startsWith("http://127.0.0.1:") && !LOCAL_URL.startsWith("http://localhost:")) {
  throw new Error("local-mitra-hpp integration test refuses a non-local SUPABASE_LOCAL_URL");
}

type FixtureUser = {
  email: string;
  password: string;
  role: "distributor" | "admin" | "mitra_umkm";
  id?: string;
  distributorId?: string;
};

const fixture: FixtureUser[] = [
  { email: "auth-step2f-hpp-d1@example.local", password: "LocalOnly-HppD1!safe", role: "distributor" },
  { email: "auth-step2f-hpp-d2@example.local", password: "LocalOnly-HppD2!safe", role: "distributor" },
  { email: "auth-step2f-hpp-a1@example.local", password: "LocalOnly-HppA1!safe", role: "admin" },
  { email: "auth-step2f-hpp-m1@example.local", password: "LocalOnly-HppM1!safe", role: "mitra_umkm" },
  { email: "auth-step2f-hpp-m1b@example.local", password: "LocalOnly-HppM1B!safe", role: "mitra_umkm" },
  { email: "auth-step2f-hpp-m2@example.local", password: "LocalOnly-HppM2!safe", role: "mitra_umkm" },
];

const RAW_COMPONENT: HppComponent = { id: "hpp-raw-1", type: "Bahan Baku", name: "Kopi Biji", cost: 120000 };
const SUPPORT_COMPONENT: HppComponent = { id: "hpp-pack-1", type: "Bahan Penunjang", name: "Kemasan 150G", cost: 30000 };
const LABOR_COMPONENT: HppComponent = { id: "hpp-labor-1", type: "Tenaga Produksi", name: "Sangrai", cost: 50000 };
const componentsFixture: HppComponent[] = [RAW_COMPONENT, SUPPORT_COMPONENT, LABOR_COMPONENT];
const outputQuantityFixture = 100;

const EXPECTED_SUMMARY = calculateHppSummary(componentsFixture, outputQuantityFixture);

let admin: SupabaseClient;
let tenantAId = "";
let tenantBId = "";
let p1Id = "";
let p1bId = "";
let p2Id = "";
let p3Id = "";
let p4Id = "";
let p5Id = "";

function assertLocalTestConfiguration() {
  if (!RUN_LOCAL) throw new Error("Set RUN_LOCAL_TWO_TENANT=1 to run the local-only HPP fixture");
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
    full_name: `STEP 2F HPP ${user.role}`,
    phone: "0900000000",
    emergency_contact_name: "Local Fixture",
    emergency_contact_relation: "Test Contact",
    emergency_contact_phone: "0900000001",
    address: "Local Supabase HPP fixture address",
    ktp_storage_path: `step2f/${user.distributorId}/${user.id}/fixture.jpg`,
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
  return { caller: appRouter.createCaller(context) };
}

async function seedProduct(distributorId: string, mitraUserId: string | null, name: string, sku: string, lifecycleStatus = "active", assign = true) {
  const product = await admin
    .from("products")
    .insert({
      distributor_id: distributorId,
      created_by_mitra_user_id: mitraUserId,
      name,
      sku,
      unit: "pcs",
      lifecycle_status: lifecycleStatus,
    })
    .select("id")
    .single();
  expect(product.error).toBeNull();
  expect(product.data?.id).toBeTruthy();
  const productId = product.data!.id;

  if (assign && mitraUserId) {
    const item = await admin
      .from("consignment_items")
      .insert({
        distributor_id: distributorId,
        mitra_user_id: mitraUserId,
        product_id: productId,
        name,
        sku,
        unit: "pcs",
        stock_quantity: 10,
        minimum_stock: 2,
      })
      .select("id")
      .single();
    expect(item.error).toBeNull();
    expect(item.data?.id).toBeTruthy();
  }

  return productId;
}

async function cleanupFixture() {
  const ids = fixture.filter((user): user is FixtureUser & { id: string } => Boolean(user.id));
  if (ids.length === 0) return;

  const cleanupErrors: string[] = [];
  const userIds = ids.map((user) => user.id);
  const tenantIds = ids.filter((user) => user.role === "distributor").map((user) => user.id);

  if (tenantIds.length > 0) {
    const { error: hppError } = await admin.from("mitra_production_hpp").delete().in("distributor_id", tenantIds);
    if (hppError) cleanupErrors.push(`mitra_production_hpp cleanup failed: ${hppError.message}`);

    const { error: itemError } = await admin.from("consignment_items").delete().in("distributor_id", tenantIds);
    if (itemError) cleanupErrors.push(`consignment_items cleanup failed: ${itemError.message}`);

    const { error: productError } = await admin.from("products").delete().in("distributor_id", tenantIds);
    if (productError) cleanupErrors.push(`products cleanup failed: ${productError.message}`);
  }

  const { error: profileError } = await admin.from("user_profiles").delete().in("user_id", userIds);
  if (profileError) cleanupErrors.push(`user_profiles cleanup failed: ${profileError.message}`);

  for (const user of [...ids].reverse()) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) cleanupErrors.push(`Auth cleanup failed for ${user.email}: ${error.message}`);
  }

  if (cleanupErrors.length > 0) throw new Error(cleanupErrors.join("; "));
}

describe.skipIf(!RUN_LOCAL)("LOCAL Mitra HPP persistent backend E2E", () => {
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
      await provisionUser(fixture[4], fixture[0].id);
      await provisionUser(fixture[5], fixture[1].id);

      tenantAId = fixture[0].distributorId!;
      tenantBId = fixture[1].distributorId!;

      p1Id = await seedProduct(tenantAId, fixture[3].id!, "STEP2F HPP Product A", "STEP2F-HPP-001");
      p1bId = await seedProduct(tenantAId, fixture[3].id!, "STEP2F HPP Product B", "STEP2F-HPP-002");
      p2Id = await seedProduct(tenantAId, fixture[4].id!, "STEP2F HPP Product SameTenant", "STEP2F-HPP-011");
      p3Id = await seedProduct(tenantBId, fixture[5].id!, "STEP2F HPP Product TenantB", "STEP2F-HPP-101");
      p4Id = await seedProduct(tenantAId, null, "STEP2F HPP Unassigned", "STEP2F-HPP-021", "active", false);
      p5Id = await seedProduct(tenantAId, fixture[3].id!, "STEP2F HPP Inactive", "STEP2F-HPP-022", "inactive");
    } catch (error) {
      try {
        await cleanupFixture();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "HPP fixture setup and cleanup failed");
      }
      throw error;
    }
  });

  afterAll(async () => {
    if (admin) await cleanupFixture();
  });

  it("membuat HPP untuk Product A yang aktif dan ditugaskan ke Mitra A", async () => {
    const { caller } = await callerFor(fixture[3]);
    const saved = await caller.hpp.upsert({
      productId: p1Id,
      components: componentsFixture,
      outputQuantity: outputQuantityFixture,
    });
    expect(saved.productId).toBe(p1Id);
    expect(saved.outputQuantity).toBe(outputQuantityFixture);
    expect(saved.updatedAt).toBeTruthy();
  });

  it("mempersist HPP ke mitra_production_hpp dengan tenant identity dari konteks", async () => {
    const { data, error } = await admin
      .from("mitra_production_hpp")
      .select("id, distributor_id, mitra_user_id, product_id, output_quantity")
      .eq("product_id", p1Id)
      .single();
    expect(error).toBeNull();
    expect(data?.distributor_id).toBe(tenantAId);
    expect(data?.mitra_user_id).toBe(fixture[3].id!);
    expect(data?.output_quantity).toBe(outputQuantityFixture);
  });

  it("mengembalikan total yang dihitung server sesuai calculateHppSummary", async () => {
    const { caller } = await callerFor(fixture[3]);
    const saved = await caller.hpp.upsert({
      productId: p1Id,
      components: [RAW_COMPONENT, SUPPORT_COMPONENT, LABOR_COMPONENT],
      outputQuantity: outputQuantityFixture,
    });
    expect(saved.totalRawMaterials).toBe(EXPECTED_SUMMARY.totalRawMaterials);
    expect(saved.totalSupportingMaterials).toBe(EXPECTED_SUMMARY.totalSupportingMaterials);
    expect(saved.totalLabor).toBe(EXPECTED_SUMMARY.totalLabor);
    expect(saved.totalProductionCost).toBe(EXPECTED_SUMMARY.totalProductionCost);
    expect(saved.costPerUnit).toBe(EXPECTED_SUMMARY.costPerUnit);
    expect(saved).toMatchObject(EXPECTED_SUMMARY);
  });

  it("menolak payload dengan total palsu / field tambahan karena input strict", async () => {
    const { caller } = await callerFor(fixture[3]);
    await expect(caller.hpp.upsert({
      productId: p1Id,
      components: componentsFixture,
      outputQuantity: outputQuantityFixture,
      totalProductionCost: 1,
      costPerUnit: 999,
      distributorId: tenantBId,
      mitraUserId: "00000000-0000-0000-0000-000000000000",
    } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("upsert kedua untuk produk yang sama memperbarui baris yang ada tanpa duplikat", async () => {
    const { caller } = await callerFor(fixture[3]);
    const updated = await caller.hpp.upsert({
      productId: p1Id,
      components: [RAW_COMPONENT, SUPPORT_COMPONENT, LABOR_COMPONENT],
      outputQuantity: 200,
    });
    expect(updated.outputQuantity).toBe(200);
    expect(updated.costPerUnit).toBe(200000 / 200);

    const { data: rows, error } = await admin
      .from("mitra_production_hpp")
      .select("id, output_quantity")
      .eq("distributor_id", tenantAId)
      .eq("mitra_user_id", fixture[3].id!)
      .eq("product_id", p1Id);
    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows?.[0].output_quantity).toBe(200);
  });

  it("produk berbeda membuat baris HPP terpisah", async () => {
    const { caller } = await callerFor(fixture[3]);
    const saved = await caller.hpp.upsert({
      productId: p1bId,
      components: [RAW_COMPONENT],
      outputQuantity: 50,
    });
    expect(saved.productId).toBe(p1bId);

    const { data: rows } = await admin
      .from("mitra_production_hpp")
      .select("product_id")
      .eq("distributor_id", tenantAId)
      .eq("mitra_user_id", fixture[3].id!);
    expect(rows?.map((row) => row.product_id).sort()).toEqual([p1Id, p1bId].sort());
  });

  it("Mitra B se-workspace membuat HPP produknya sendiri", async () => {
    const { caller } = await callerFor(fixture[4]);
    const saved = await caller.hpp.upsert({
      productId: p2Id,
      components: [SUPPORT_COMPONENT],
      outputQuantity: outputQuantityFixture,
    });
    expect(saved.productId).toBe(p2Id);
  });

  it("Mitra A hanya melihat HPP miliknya sendiri", async () => {
    const { caller } = await callerFor(fixture[3]);
    const rows = await caller.hpp.list();
    const productIds = rows.map((row) => row.productId);
    expect(productIds).toContain(p1Id);
    expect(productIds).toContain(p1bId);
    expect(productIds).not.toContain(p2Id);
    expect(productIds).not.toContain(p3Id);
  });

  it("Mitra A tidak dapat membuat HPP untuk produk Mitra B se-workspace", async () => {
    const { caller } = await callerFor(fixture[3]);
    await expect(caller.hpp.upsert({
      productId: p2Id,
      components: componentsFixture,
      outputQuantity: outputQuantityFixture,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("Mitra B se-workspace hanya melihat HPP miliknya", async () => {
    const { caller } = await callerFor(fixture[4]);
    const rows = await caller.hpp.list();
    expect(rows.map((row) => row.productId)).toEqual([p2Id]);
  });

  it("Mitra B tenant lain membuat HPP di workspace-nya sendiri", async () => {
    const { caller } = await callerFor(fixture[5]);
    const saved = await caller.hpp.upsert({
      productId: p3Id,
      components: componentsFixture,
      outputQuantity: outputQuantityFixture,
    });
    expect(saved.productId).toBe(p3Id);
  });

  it("Mitra A tidak dapat membuat HPP untuk produk distributor lain", async () => {
    const { caller } = await callerFor(fixture[3]);
    await expect(caller.hpp.upsert({
      productId: p3Id,
      components: componentsFixture,
      outputQuantity: outputQuantityFixture,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("Mitra A tidak dapat membuat HPP untuk produk tidak ditugaskan atau non-aktif", async () => {
    const { caller } = await callerFor(fixture[3]);
    await expect(caller.hpp.upsert({
      productId: p4Id,
      components: componentsFixture,
      outputQuantity: outputQuantityFixture,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(caller.hpp.upsert({
      productId: p5Id,
      components: componentsFixture,
      outputQuantity: outputQuantityFixture,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("Distributor A hanya melihat HPP workspace A", async () => {
    const { caller } = await callerFor(fixture[0]);
    const rows = await caller.hpp.list();
    const productIds = rows.map((row) => row.productId);
    expect(productIds).toContain(p1Id);
    expect(productIds).toContain(p1bId);
    expect(productIds).toContain(p2Id);
    expect(productIds).not.toContain(p3Id);
  });

  it("Distributor B tidak melihat HPP workspace A", async () => {
    const { caller } = await callerFor(fixture[1]);
    const rows = await caller.hpp.list();
    expect(rows).toHaveLength(1);
    expect(rows[0].productId).toBe(p3Id);
  });

  it("Admin A hanya melihat HPP workspace A", async () => {
    const { caller } = await callerFor(fixture[2]);
    const rows = await caller.hpp.list();
    const productIds = rows.map((row) => row.productId);
    expect(productIds).toContain(p1Id);
    expect(productIds).toContain(p1bId);
    expect(productIds).toContain(p2Id);
    expect(productIds).not.toContain(p3Id);
  });

  it("menolak outputQuantity 0, negatif, dan non-integer", async () => {
    const { caller } = await callerFor(fixture[3]);
    await expect(caller.hpp.upsert({ productId: p1Id, components: componentsFixture, outputQuantity: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.hpp.upsert({ productId: p1Id, components: componentsFixture, outputQuantity: -1 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.hpp.upsert({ productId: p1Id, components: componentsFixture, outputQuantity: 1.5 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("menolak cost komponen negatif, NaN, dan infinity", async () => {
    const { caller } = await callerFor(fixture[3]);
    await expect(caller.hpp.upsert({
      productId: p1Id,
      components: [{ id: "bad-1", type: "Bahan Baku", name: "Negatif", cost: -5 }],
      outputQuantity: 10,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.hpp.upsert({
      productId: p1Id,
      components: [{ id: "bad-2", type: "Bahan Baku", name: "NaN", cost: NaN }],
      outputQuantity: 10,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.hpp.upsert({
      productId: p1Id,
      components: [{ id: "bad-3", type: "Bahan Baku", name: "Infinity", cost: Infinity }],
      outputQuantity: 10,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("menolak tipe komponen yang tidak dikenal", async () => {
    const { caller } = await callerFor(fixture[3]);
    await expect(caller.hpp.upsert({
      productId: p1Id,
      components: [{ id: "bad-type", type: "Gaji", name: "Gaji Staf", cost: 1000 } as never],
      outputQuantity: 10,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("memetakan nilai numeric DB dari string PostgreSQL ke number JavaScript", async () => {
    const { caller } = await callerFor(fixture[3]);
    const rows = await caller.hpp.list();
    const p1bRow = rows.find((row) => row.productId === p1bId);
    expect(p1bRow).toBeTruthy();
    expect(typeof p1bRow!.totalProductionCost).toBe("number");
    expect(typeof p1bRow!.costPerUnit).toBe("number");
    expect(p1bRow!.totalProductionCost).toBe(120000);
    expect(p1bRow!.costPerUnit).toBe(2400);

    const { data: raw, error } = await admin
      .from("mitra_production_hpp")
      .select("total_production_cost, cost_per_unit, components")
      .eq("product_id", p1bId)
      .single();
    expect(error).toBeNull();
    expect(Number(raw?.total_production_cost)).toBe(120000);
    expect(Number(raw?.cost_per_unit)).toBe(2400);
    expect(raw?.components).toEqual([RAW_COMPONENT]);
  });

  it("menolak input tanpa field wajib atau objek kosong", async () => {
    const { caller } = await callerFor(fixture[3]);
    await expect(caller.hpp.upsert({
      productId: p1Id,
    } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.hpp.upsert({} as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("menolak hpp.upsert untuk Distributor dan Admin", async () => {
    const distributorCaller = (await callerFor(fixture[0])).caller;
    await expect(distributorCaller.hpp.upsert({
      productId: p1Id,
      components: componentsFixture,
      outputQuantity: outputQuantityFixture,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const adminCaller = (await callerFor(fixture[2])).caller;
    await expect(adminCaller.hpp.upsert({
      productId: p1Id,
      components: componentsFixture,
      outputQuantity: outputQuantityFixture,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});