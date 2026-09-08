import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "../../server/routers";
import type { TrpcContext } from "../../server/_core/context";

const RUN_LOCAL = process.env.RUN_LOCAL_TWO_TENANT === "1";
const LOCAL_URL = process.env.SUPABASE_LOCAL_URL ?? "http://127.0.0.1:54321";
const LOCAL_ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;
const LOCAL_SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;

if (!LOCAL_URL.startsWith("http://127.0.0.1:") && !LOCAL_URL.startsWith("http://localhost:")) {
  throw new Error("local-mitra-budget integration test refuses a non-local SUPABASE_LOCAL_URL");
}

type FixtureUser = {
  email: string;
  password: string;
  role: "distributor" | "admin" | "mitra_umkm";
  id?: string;
  distributorId?: string;
};

const fixture: FixtureUser[] = [
  { email: "auth-step3f-budget-d1@example.local", password: "LocalOnly-BudgetD1!safe", role: "distributor" },
  { email: "auth-step3f-budget-d2@example.local", password: "LocalOnly-BudgetD2!safe", role: "distributor" },
  { email: "auth-step3f-budget-a1@example.local", password: "LocalOnly-BudgetA1!safe", role: "admin" },
  { email: "auth-step3f-budget-m1@example.local", password: "LocalOnly-BudgetM1!safe", role: "mitra_umkm" },
  { email: "auth-step3f-budget-m1b@example.local", password: "LocalOnly-BudgetM1B!safe", role: "mitra_umkm" },
  { email: "auth-step3f-budget-m2@example.local", password: "LocalOnly-BudgetM2!safe", role: "mitra_umkm" },
];

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
  if (!RUN_LOCAL) throw new Error("Set RUN_LOCAL_TWO_TENANT=1 to run the local-only Budget fixture");
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
    full_name: `STEP 3F BUDGET ${user.role}`,
    phone: "0900000000",
    emergency_contact_name: "Local Fixture",
    emergency_contact_relation: "Test Contact",
    emergency_contact_phone: "0900000001",
    address: "Local Supabase Budget fixture address",
    ktp_storage_path: `step3f/${user.distributorId}/${user.id}/fixture.jpg`,
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
    const { error: budgetError } = await admin.from("mitra_production_budgets").delete().in("distributor_id", tenantIds);
    if (budgetError) cleanupErrors.push(`mitra_production_budgets cleanup failed: ${budgetError.message}`);

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

describe.skipIf(!RUN_LOCAL)("LOCAL Mitra Budget persistent backend E2E", () => {
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

      p1Id = await seedProduct(tenantAId, fixture[3].id!, "STEP3F Budget Product A", "STEP3F-BUDGET-001");
      p1bId = await seedProduct(tenantAId, fixture[3].id!, "STEP3F Budget Product B", "STEP3F-BUDGET-002");
      p2Id = await seedProduct(tenantAId, fixture[4].id!, "STEP3F Budget Product SameTenant", "STEP3F-BUDGET-011");
      p3Id = await seedProduct(tenantBId, fixture[5].id!, "STEP3F Budget Product TenantB", "STEP3F-BUDGET-101");
      p4Id = await seedProduct(tenantAId, null, "STEP3F Budget Unassigned", "STEP3F-BUDGET-021", "active", false);
      p5Id = await seedProduct(tenantAId, fixture[3].id!, "STEP3F Budget Inactive", "STEP3F-BUDGET-022", "inactive");
    } catch (error) {
      try {
        await cleanupFixture();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Budget fixture setup and cleanup failed");
      }
      throw error;
    }
  });

  afterAll(async () => {
    if (admin) await cleanupFixture();
  });

  it("Mitra A membuat budget untuk Product A yang aktif dan ditugaskan", async () => {
    const { caller } = await callerFor(fixture[3]);
    const saved = await caller.budgets.upsert({
      productId: p1Id,
      period: "Bulan",
      productionBudget: 1500000,
      productionTarget: 100,
    });
    expect(saved.productId).toBe(p1Id);
    expect(saved.period).toBe("Bulan");
    expect(saved.productionBudget).toBe(1500000);
    expect(saved.productionTarget).toBe(100);
    expect(saved.updatedAt).toBeTruthy();
  });

  it("mempersist budget ke mitra_production_budgets dengan tenant identity dari konteks auth", async () => {
    const { data, error } = await admin
      .from("mitra_production_budgets")
      .select("id, distributor_id, mitra_user_id, product_id, period, production_budget, production_target")
      .eq("product_id", p1Id)
      .eq("period", "Bulan")
      .single();
    expect(error).toBeNull();
    expect(data?.distributor_id).toBe(tenantAId);
    expect(data?.mitra_user_id).toBe(fixture[3].id!);
    expect(data?.period).toBe("Bulan");
    expect(Number(data?.production_budget)).toBe(1500000);
    expect(data?.production_target).toBe(100);
  });

  it("produk berbeda membuat row budget terpisah", async () => {
    const { caller } = await callerFor(fixture[3]);
    const saved = await caller.budgets.upsert({
      productId: p1bId,
      period: "Bulan",
      productionBudget: 750000.5,
      productionTarget: 40,
    });
    expect(saved.productId).toBe(p1bId);
    expect(saved.productionBudget).toBe(750000.5);
    expect(saved.productionTarget).toBe(40);
  });

  it("periode berbeda untuk produk yang sama membuat row terpisah", async () => {
    const { caller } = await callerFor(fixture[3]);
    const saved = await caller.budgets.upsert({
      productId: p1Id,
      period: "Hari",
      productionBudget: 50000,
      productionTarget: 4,
    });
    expect(saved.period).toBe("Hari");

    const { data: rows, error } = await admin
      .from("mitra_production_budgets")
      .select("period")
      .eq("distributor_id", tenantAId)
      .eq("mitra_user_id", fixture[3].id!)
      .eq("product_id", p1Id);
    expect(error).toBeNull();
    expect(rows).toHaveLength(2);
    expect(rows?.map((row) => row.period).sort()).toEqual(["Bulan", "Hari"]);
  });

  it("upsert dengan product + period yang sama memperbarui row lama tanpa duplikat", async () => {
    const { caller } = await callerFor(fixture[3]);
    const updated = await caller.budgets.upsert({
      productId: p1Id,
      period: "Bulan",
      productionBudget: 2500000,
      productionTarget: 180,
    });
    expect(updated.productionBudget).toBe(2500000);
    expect(updated.productionTarget).toBe(180);

    const { data: rows, error } = await admin
      .from("mitra_production_budgets")
      .select("id, production_budget, production_target")
      .eq("distributor_id", tenantAId)
      .eq("mitra_user_id", fixture[3].id!)
      .eq("product_id", p1Id)
      .eq("period", "Bulan");
    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
    expect(Number(rows?.[0].production_budget)).toBe(2500000);
    expect(rows?.[0].production_target).toBe(180);
  });

  it("memetakan productionBudget numeric dari string PostgreSQL ke number JavaScript", async () => {
    const { caller } = await callerFor(fixture[3]);
    const rows = await caller.budgets.list();
    const bulanRow = rows.find((row) => row.productId === p1Id && row.period === "Bulan");
    const bulanBRow = rows.find((row) => row.productId === p1bId && row.period === "Bulan");
    expect(bulanRow).toBeTruthy();
    expect(bulanBRow).toBeTruthy();
    expect(typeof bulanRow!.productionBudget).toBe("number");
    expect(typeof bulanBRow!.productionBudget).toBe("number");
    expect(bulanRow!.productionBudget).toBe(2500000);
    expect(bulanBRow!.productionBudget).toBe(750000.5);

    const { data: raw, error } = await admin
      .from("mitra_production_budgets")
      .select("production_budget")
      .eq("product_id", p1bId)
      .eq("period", "Bulan")
      .single();
    expect(error).toBeNull();
    expect(Number(raw?.production_budget)).toBe(750000.5);
  });

  it("Mitra B se-workspace membuat budget produknya sendiri", async () => {
    const { caller } = await callerFor(fixture[4]);
    const saved = await caller.budgets.upsert({
      productId: p2Id,
      period: "Bulan",
      productionBudget: 1500,
      productionTarget: 20,
    });
    expect(saved.productId).toBe(p2Id);
  });

  it("Mitra A hanya melihat budget miliknya sendiri", async () => {
    const { caller } = await callerFor(fixture[3]);
    const rows = await caller.budgets.list();
    const productIds = rows.map((row) => row.productId);
    expect(productIds).toContain(p1Id);
    expect(productIds).toContain(p1bId);
    expect(productIds).not.toContain(p2Id);
    expect(productIds).not.toContain(p3Id);
  });

  it("Mitra B se-workspace hanya melihat budget miliknya", async () => {
    const { caller } = await callerFor(fixture[4]);
    const rows = await caller.budgets.list();
    expect(rows.map((row) => row.productId)).toEqual([p2Id]);
  });

  it("Mitra B tenant lain membuat budget di workspace-nya sendiri", async () => {
    const { caller } = await callerFor(fixture[5]);
    const saved = await caller.budgets.upsert({
      productId: p3Id,
      period: "Bulan",
      productionBudget: 4000,
      productionTarget: 60,
    });
    expect(saved.productId).toBe(p3Id);
  });

  it("Mitra A tidak dapat membuat budget untuk product tenant lain", async () => {
    const { caller } = await callerFor(fixture[3]);
    await expect(caller.budgets.upsert({
      productId: p3Id,
      period: "Bulan",
      productionBudget: 4000,
      productionTarget: 60,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("Mitra A tidak dapat membuat budget untuk product yang tidak ditugaskan", async () => {
    const { caller } = await callerFor(fixture[3]);
    await expect(caller.budgets.upsert({
      productId: p4Id,
      period: "Bulan",
      productionBudget: 4000,
      productionTarget: 60,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("product inactive ditolak sesuai pola existing", async () => {
    const { caller } = await callerFor(fixture[3]);
    await expect(caller.budgets.upsert({
      productId: p5Id,
      period: "Bulan",
      productionBudget: 4000,
      productionTarget: 60,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("Distributor A hanya melihat budget workspace A", async () => {
    const { caller } = await callerFor(fixture[0]);
    const rows = await caller.budgets.list();
    const productIds = rows.map((row) => row.productId);
    expect(productIds).toContain(p1Id);
    expect(productIds).toContain(p1bId);
    expect(productIds).toContain(p2Id);
    expect(productIds).not.toContain(p3Id);
  });

  it("Distributor B tidak melihat budget workspace A", async () => {
    const { caller } = await callerFor(fixture[1]);
    const rows = await caller.budgets.list();
    expect(rows).toHaveLength(1);
    expect(rows[0].productId).toBe(p3Id);
  });

  it("Admin A hanya melihat budget workspace A", async () => {
    const { caller } = await callerFor(fixture[2]);
    const rows = await caller.budgets.list();
    const productIds = rows.map((row) => row.productId);
    expect(productIds).toContain(p1Id);
    expect(productIds).toContain(p1bId);
    expect(productIds).toContain(p2Id);
    expect(productIds).not.toContain(p3Id);
  });

  it("menolak field unknown distributorId/mitraUserId karena Zod strict", async () => {
    const { caller } = await callerFor(fixture[3]);
    await expect(caller.budgets.upsert({
      productId: p1Id,
      period: "Bulan",
      productionBudget: 1000,
      productionTarget: 10,
      distributorId: tenantBId,
      mitraUserId: "00000000-0000-0000-0000-000000000000",
    } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("menolak period yang tidak dikenal", async () => {
    const { caller } = await callerFor(fixture[3]);
    await expect(caller.budgets.upsert({
      productId: p1Id,
      period: "Tahun",
      productionBudget: 1000,
      productionTarget: 10,
    } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("menolak productionBudget negatif", async () => {
    const { caller } = await callerFor(fixture[3]);
    await expect(caller.budgets.upsert({
      productId: p1Id,
      period: "Bulan",
      productionBudget: -1,
      productionTarget: 10,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("menolak productionTarget 0, negatif, dan non-integer", async () => {
    const { caller } = await callerFor(fixture[3]);
    await expect(caller.budgets.upsert({
      productId: p1Id,
      period: "Bulan",
      productionBudget: 1000,
      productionTarget: 0,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(caller.budgets.upsert({
      productId: p1Id,
      period: "Bulan",
      productionBudget: 1000,
      productionTarget: -1,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(caller.budgets.upsert({
      productId: p1Id,
      period: "Bulan",
      productionBudget: 1000,
      productionTarget: 1.5,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("menolak input objek kosong", async () => {
    const { caller } = await callerFor(fixture[3]);
    await expect(caller.budgets.upsert({} as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("menolak budgets.upsert untuk Distributor dan Admin", async () => {
    const distributorCaller = (await callerFor(fixture[0])).caller;
    await expect(distributorCaller.budgets.upsert({
      productId: p1Id,
      period: "Bulan",
      productionBudget: 1000,
      productionTarget: 10,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const adminCaller = (await callerFor(fixture[2])).caller;
    await expect(adminCaller.budgets.upsert({
      productId: p1Id,
      period: "Bulan",
      productionBudget: 1000,
      productionTarget: 10,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});