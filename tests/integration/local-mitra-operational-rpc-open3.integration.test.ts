import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
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
    "OPEN-3 local integration test refuses a non-local SUPABASE_LOCAL_URL",
  );
}

const requireFromCwd = createRequire(import.meta.url);
const DEFAULT_PG_LIB =
  "C:/Users/ahars/AppData/Local/Temp/opencode/ws002-migrate/node_modules/pg";
const PG_LIB = [process.env.OPEN3_PG_LIB, DEFAULT_PG_LIB].find(
  (candidate) => candidate && existsSync(candidate),
);

type PgClientLike = {
  connect(): Promise<void>;
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  end(): Promise<void>;
};
type PgModule = { Client: new (config: Record<string, unknown>) => PgClientLike };
const pgModule: PgModule | null = PG_LIB
  ? (requireFromCwd(PG_LIB) as PgModule)
  : null;

const ANON_SHIP_SIG = "public.ship_mitra_shipment(uuid)";
const ANON_COMPLETE_SIG =
  "public.complete_mitra_production_event(uuid,integer,integer,numeric,text)";

type FixtureUser = {
  email: string;
  password: string;
  role: "distributor" | "admin" | "mitra_umkm";
  id?: string;
  distributorId?: string;
};

const fixture: FixtureUser[] = [
  { email: "open3-d1@example.local", password: "LocalOnly-Open3-D1!safe", role: "distributor" },
  { email: "open3-m1@example.local", password: "LocalOnly-Open3-M1!safe", role: "mitra_umkm" },
  { email: "open3-d2@example.local", password: "LocalOnly-Open3-D2!safe", role: "distributor" },
  { email: "open3-m2@example.local", password: "LocalOnly-Open3-M2!safe", role: "mitra_umkm" },
];

let admin: SupabaseClient;
const createdItems: string[] = [];
const createdProducts: string[] = [];
const createdShipments: string[] = [];
const createdEvents: string[] = [];
let mitraA: SupabaseClient;
let mitraCaller: Awaited<ReturnType<typeof callerFor>>["caller"];
let productA: string;
let consignmentItemA: string;
let eventOne: string;
let eventTwo: string;
let shipmentOne: string;
let shipmentTwo: string;

function assertLocalTestConfiguration() {
  if (!RUN_LOCAL)
    throw new Error(
      "Set RUN_LOCAL_TWO_TENANT=1 to run the OPEN-3 local integration fixture",
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
    full_name: `OPEN-3 ${user.role}`,
    phone: "0900000002",
    emergency_contact_name: "Local Fixture",
    emergency_contact_relation: "Test Contact",
    emergency_contact_phone: "0900000003",
    address: "Local Supabase OPEN-3 fixture address",
    ktp_storage_path: `open3/${user.distributorId}/${user.id}/fixture.jpg`,
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
  return { client, caller: appRouter.createCaller(context) };
}

function isRejected(result: { data: unknown; error: unknown }) {
  return result.error !== null || result.data === null;
}

async function livePrivilege(sig: string, role: string) {
  if (!pgModule) throw new Error("pg client unavailable for live privilege check");
  const client = new pgModule.Client({
    host: process.env.OPEN3_PG_HOST ?? "127.0.0.1",
    port: Number(process.env.OPEN3_PG_PORT ?? 54322),
    user: process.env.OPEN3_PG_USER ?? "postgres",
    password: process.env.OPEN3_PG_PASSWORD ?? "postgres",
    database: process.env.OPEN3_PG_DATABASE ?? "postgres",
  });
  await client.connect();
  try {
    const res = await client.query(
      "select has_function_privilege($1::name, $2::regprocedure, $3::text) as can",
      [role, sig, "EXECUTE"],
    );
    return (res.rows[0] as { can: boolean }).can;
  } finally {
    await client.end();
  }
}

async function withPg<T>(fn: (client: PgClientLike) => Promise<T>) {
  if (!pgModule) throw new Error("pg client unavailable");
  const client = new pgModule.Client({
    host: process.env.OPEN3_PG_HOST ?? "127.0.0.1",
    port: Number(process.env.OPEN3_PG_PORT ?? 54322),
    user: process.env.OPEN3_PG_USER ?? "postgres",
    password: process.env.OPEN3_PG_PASSWORD ?? "postgres",
    database: process.env.OPEN3_PG_DATABASE ?? "postgres",
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function stockQuantity() {
  const { data, error } = await admin
    .from("mitra_production_stock")
    .select("available_quantity")
    .eq("distributor_id", fixture[0].id!)
    .eq("mitra_user_id", fixture[1].id!)
    .eq("product_id", productA)
    .maybeSingle();
  expect(error).toBeNull();
  return (data?.available_quantity as number | undefined) ?? 0;
}

async function shipmentMovementCount(shipmentId: string) {
  const { data, error } = await admin
    .from("mitra_shipment_stock_movements")
    .select("id")
    .eq("shipment_id", shipmentId);
  expect(error).toBeNull();
  return data?.length ?? 0;
}

async function eventMovementCount(eventId: string) {
  const { data, error } = await admin
    .from("mitra_production_stock_movements")
    .select("id")
    .eq("production_event_id", eventId);
  expect(error).toBeNull();
  return data?.length ?? 0;
}

async function cleanupFixture() {
  const cleanupErrors: string[] = [];

  if (createdShipments.length > 0) {
    const { error: movementError } = await admin
      .from("mitra_shipment_stock_movements")
      .delete()
      .in("shipment_id", createdShipments);
    if (movementError) {
      cleanupErrors.push(`mitra_shipment_stock_movements cleanup failed: ${movementError.message}`);
    }
    const { error } = await admin
      .from("mitra_shipments")
      .delete()
      .in("id", createdShipments);
    if (error) cleanupErrors.push(`mitra_shipments cleanup failed: ${error.message}`);
  }

  if (createdEvents.length > 0) {
    const { error: movementError } = await admin
      .from("mitra_production_stock_movements")
      .delete()
      .in("production_event_id", createdEvents);
    if (movementError) {
      cleanupErrors.push(`mitra_production_stock_movements cleanup failed: ${movementError.message}`);
    }
    if (pgModule) {
      try {
        await withPg(async (client) => {
          await client.query("begin");
          await client.query(
            "alter table public.mitra_production_events disable trigger prevent_completed_mitra_production_event_mutation",
          );
          for (const id of createdEvents) {
            await client.query("delete from public.mitra_production_events where id = $1", [id]);
          }
          await client.query(
            "alter table public.mitra_production_events enable trigger prevent_completed_mitra_production_event_mutation",
          );
          await client.query("commit");
        });
      } catch (err) {
        try {
          await withPg(async (client) => {
            await client.query(
              "alter table public.mitra_production_events enable trigger prevent_completed_mitra_production_event_mutation",
            );
          });
        } catch {
          // last resort: re-raise the original cleanup error below
        }
        cleanupErrors.push(`mitra_production_events cleanup failed: ${(err as Error).message}`);
      }
    } else {
      const { error } = await admin
        .from("mitra_production_events")
        .delete()
        .in("id", createdEvents);
      if (error) cleanupErrors.push(`mitra_production_events cleanup failed: ${error.message}`);
    }
  }

  if (fixture[0].id && fixture[1].id) {
    const { error: stockError } = await admin
      .from("mitra_production_stock")
      .delete()
      .eq("distributor_id", fixture[0].id)
      .eq("mitra_user_id", fixture[1].id);
    if (stockError) {
      cleanupErrors.push(`mitra_production_stock cleanup failed: ${stockError.message}`);
    }
  }

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
    if (profileError) {
      cleanupErrors.push(`user_profiles cleanup failed: ${profileError.message}`);
    }
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

describe.skipIf(!RUN_LOCAL)("OPEN-3 mitra operational RPC execute scope", () => {
  beforeAll(async () => {
    assertLocalTestConfiguration();
    process.env.SUPABASE_URL = LOCAL_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = LOCAL_SERVICE_ROLE_KEY;
    process.env.SUPABASE_PUBLISHABLE_KEY = LOCAL_ANON_KEY;
    admin = createAdminClient();
    try {
      await provisionUser(fixture[0]);
      await provisionUser(fixture[1], fixture[0].id);
      await provisionUser(fixture[2]);
      await provisionUser(fixture[3], fixture[2].id);

      const { data: product, error: productError } = await admin
        .from("products")
        .insert({
          distributor_id: fixture[0].id,
          name: "OPEN-3 PRODUCT A",
          sku: "OPEN3-PROD-A",
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
          name: "OPEN-3 ITEM A",
          sku: "OPEN3-ITEM-A",
          unit: "pcs",
          stock_quantity: 0,
          minimum_stock: 0,
        })
        .select("id")
        .single();
      expect(itemError).toBeNull();
      expect(item?.id).toBeTruthy();
      consignmentItemA = item!.id;
      createdItems.push(consignmentItemA);

      mitraA = await signIn(fixture[1]);
      mitraCaller = (await callerFor(fixture[1])).caller;

      const plannedOne = await mitraCaller.productionEvents.createPlanned({
        productId: productA,
        productionDate: "2026-01-10",
        budgetPeriod: "Minggu",
        targetQuantity: 10,
        notes: "OPEN-3 planned event one",
      });
      expect(plannedOne.status).toBe("planned");
      eventOne = plannedOne.id;
      createdEvents.push(eventOne);

      const plannedTwo = await mitraCaller.productionEvents.createPlanned({
        productId: productA,
        productionDate: "2026-01-11",
        budgetPeriod: "Minggu",
        targetQuantity: 5,
        notes: "OPEN-3 planned event two",
      });
      expect(plannedTwo.status).toBe("planned");
      eventTwo = plannedTwo.id;
      createdEvents.push(eventTwo);

      const shipmentOnePlanned = await mitraCaller.mitraShipments.create({
        productId: productA,
        consignmentItemId: consignmentItemA,
        quantity: 3,
        shipmentDate: "2026-01-12",
        notes: "OPEN-3 shipment one",
      });
      expect(shipmentOnePlanned.status).toBe("planned");
      shipmentOne = shipmentOnePlanned.id;
      createdShipments.push(shipmentOne);

      const shipmentTwoPlanned = await mitraCaller.mitraShipments.create({
        productId: productA,
        consignmentItemId: consignmentItemA,
        quantity: 99,
        shipmentDate: "2026-01-13",
        notes: "OPEN-3 shipment two",
      });
      expect(shipmentTwoPlanned.status).toBe("planned");
      shipmentTwo = shipmentTwoPlanned.id;
      createdShipments.push(shipmentTwo);
    } catch (error) {
      try {
        await cleanupFixture();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "OPEN-3 fixture setup and cleanup failed",
        );
      }
      throw error;
    }
  });

  afterAll(async () => {
    if (admin) await cleanupFixture();
  });

  it.skipIf(!pgModule)("live: anon has no EXECUTE on public.ship_mitra_shipment(uuid)", async () => {
    expect(await livePrivilege(ANON_SHIP_SIG, "anon")).toBe(false);
  });

  it.skipIf(!pgModule)("live: anon has no EXECUTE on public.complete_mitra_production_event(uuid,integer,integer,numeric,text)", async () => {
    expect(await livePrivilege(ANON_COMPLETE_SIG, "anon")).toBe(false);
  });

  it.skipIf(!pgModule)("live: authenticated keeps EXECUTE on both RPCs", async () => {
    expect(await livePrivilege(ANON_SHIP_SIG, "authenticated")).toBe(true);
    expect(await livePrivilege(ANON_COMPLETE_SIG, "authenticated")).toBe(true);
  });

  it.skipIf(!pgModule)("live: service_role keeps EXECUTE on both RPCs", async () => {
    expect(await livePrivilege(ANON_SHIP_SIG, "service_role")).toBe(true);
    expect(await livePrivilege(ANON_COMPLETE_SIG, "service_role")).toBe(true);
  });

  it("authenticated official path: productionEvents.complete works and stocks production", async () => {
    const completed = await mitraCaller.productionEvents.complete({
      eventId: eventOne,
      actualQuantity: 8,
      damagedQuantity: 0,
      yieldPercentage: null,
      resultNotes: "OPEN-3 completed event",
    });
    expect(completed.status).toBe("completed");
    expect(completed.actualQuantity).toBe(8);
    expect(completed.damagedQuantity).toBe(0);

    const { data: row } = await admin
      .from("mitra_production_events")
      .select("status, completed_at")
      .eq("id", eventOne)
      .maybeSingle();
    expect(row?.status).toBe("completed");
    expect(row?.completed_at).toBeTruthy();
    expect(await eventMovementCount(eventOne)).toBe(1);
    expect(await stockQuantity()).toBe(8);
  });

  it("authenticated official path: productionEvents.complete is idempotent", async () => {
    const again = await mitraCaller.productionEvents.complete({
      eventId: eventOne,
      actualQuantity: 8,
      damagedQuantity: 0,
      yieldPercentage: null,
      resultNotes: "OPEN-3 completed event",
    });
    expect(again.status).toBe("completed");
    expect(await eventMovementCount(eventOne)).toBe(1);
    expect(await stockQuantity()).toBe(8);
  });

  it("authenticated official path: mitraShipments.ship ships a planned shipment and decrements production stock", async () => {
    const { data: before } = await admin
      .from("mitra_shipments")
      .select("status, shipped_at")
      .eq("id", shipmentOne)
      .maybeSingle();
    expect(before?.status).toBe("planned");
    expect(before?.shipped_at).toBeNull();
    expect(await shipmentMovementCount(shipmentOne)).toBe(0);
    expect(await stockQuantity()).toBe(8);

    const result = await mitraA.rpc("ship_mitra_shipment", {
      p_shipment_id: shipmentOne,
    });
    expect(result.error).toBeNull();
    const first = (Array.isArray(result.data) ? result.data[0] : result.data) as
      | {
          shipment_id: string;
          shipment_status: string;
          shipment_quantity: number;
          stock_quantity: number;
          movement_id: string;
          idempotent: boolean;
        }
      | null
      | undefined;
    expect(first).toBeTruthy();
    expect(first!.shipment_id).toBe(shipmentOne);
    expect(first!.shipment_status).toBe("shipped");
    expect(first!.shipment_quantity).toBe(3);
    expect(first!.stock_quantity).toBe(5);
    expect(first!.movement_id).toBeTruthy();
    expect(first!.idempotent).toBe(false);

    const { data: row } = await admin
      .from("mitra_shipments")
      .select("status, shipped_at")
      .eq("id", shipmentOne)
      .maybeSingle();
    expect(row?.status).toBe("shipped");
    expect(row?.shipped_at).toBeTruthy();
    expect(await shipmentMovementCount(shipmentOne)).toBe(1);

    const { data: movements } = await admin
      .from("mitra_shipment_stock_movements")
      .select("movement_type, quantity")
      .eq("shipment_id", shipmentOne);
    expect(movements).toHaveLength(1);
    expect(movements?.[0].movement_type).toBe("shipment_shipped");
    expect(movements?.[0].quantity).toBe(3);
    expect(await stockQuantity()).toBe(5);
  });

  it("authenticated official path: mitraShipments.ship is idempotent", async () => {
    const result = await mitraA.rpc("ship_mitra_shipment", {
      p_shipment_id: shipmentOne,
    });
    expect(result.error).toBeNull();
    const again = Array.isArray(result.data) ? result.data[0] : result.data;
    expect(again?.idempotent).toBe(true);
    expect(again?.shipment_status).toBe("shipped");
    expect(await shipmentMovementCount(shipmentOne)).toBe(1);
    expect(await stockQuantity()).toBe(5);
    const { data: row } = await admin
      .from("mitra_shipments")
      .select("status")
      .eq("id", shipmentOne)
      .maybeSingle();
    expect(row?.status).toBe("shipped");
  });

  it("authenticated official path: ship is rejected when production stock is insufficient", async () => {
    expect(await shipmentMovementCount(shipmentTwo)).toBe(0);
    const stockBefore = await stockQuantity();

    const result = await mitraA.rpc("ship_mitra_shipment", {
      p_shipment_id: shipmentTwo,
    });
    expect(isRejected(result)).toBe(true);
    if (result.error) expect(result.error.code).toBe("22003");

    const { data: row } = await admin
      .from("mitra_shipments")
      .select("status, shipped_at")
      .eq("id", shipmentTwo)
      .maybeSingle();
    expect(row?.status).toBe("planned");
    expect(row?.shipped_at).toBeNull();
    expect(await shipmentMovementCount(shipmentTwo)).toBe(0);
    expect(await stockQuantity()).toBe(stockBefore);
  });

  it("rejects ship by the distributor role and leaves the shipment untouched", async () => {
    const distributorClient = await signIn(fixture[0]);
    const result = await distributorClient.rpc("ship_mitra_shipment", {
      p_shipment_id: shipmentTwo,
    });
    expect(isRejected(result)).toBe(true);
    if (result.error) expect(result.error.code).toBe("42501");

    const { data: row } = await admin
      .from("mitra_shipments")
      .select("status, shipped_at")
      .eq("id", shipmentTwo)
      .maybeSingle();
    expect(row?.status).toBe("planned");
    expect(row?.shipped_at).toBeNull();
    expect(await shipmentMovementCount(shipmentTwo)).toBe(0);
  });

  it("rejects shipping a shipment outside the caller's tenant and leaves it unchanged", async () => {
    const tenantB = await signIn(fixture[3]);
    const result = await tenantB.rpc("ship_mitra_shipment", {
      p_shipment_id: shipmentTwo,
    });
    expect(isRejected(result)).toBe(true);

    const { data: row } = await admin
      .from("mitra_shipments")
      .select("status, shipped_at")
      .eq("id", shipmentTwo)
      .maybeSingle();
    expect(row?.status).toBe("planned");
    expect(row?.shipped_at).toBeNull();
    expect(await shipmentMovementCount(shipmentTwo)).toBe(0);
  });

  it("anon cannot ship a real planned shipment and nothing changes", async () => {
    expect(await shipmentMovementCount(shipmentTwo)).toBe(0);
    const stockBefore = await stockQuantity();

    const anon = createAnonClient();
    const result = await anon.rpc("ship_mitra_shipment", {
      p_shipment_id: shipmentTwo,
    });
    expect(isRejected(result)).toBe(true);

    const { data: row } = await admin
      .from("mitra_shipments")
      .select("status, shipped_at")
      .eq("id", shipmentTwo)
      .maybeSingle();
    expect(row?.status).toBe("planned");
    expect(row?.shipped_at).toBeNull();
    expect(await shipmentMovementCount(shipmentTwo)).toBe(0);
    expect(await stockQuantity()).toBe(stockBefore);
  });

  it("anon cannot complete a real planned production event and nothing changes", async () => {
    expect(await eventMovementCount(eventTwo)).toBe(0);
    const stockBefore = await stockQuantity();

    const anon = createAnonClient();
    const result = await anon.rpc("complete_mitra_production_event", {
      p_production_event_id: eventTwo,
      p_actual_quantity: 5,
      p_damaged_quantity: 0,
      p_yield_percentage: null,
      p_result_notes: "",
    });
    expect(isRejected(result)).toBe(true);

    const { data: row } = await admin
      .from("mitra_production_events")
      .select("status, completed_at")
      .eq("id", eventTwo)
      .maybeSingle();
    expect(row?.status).toBe("planned");
    expect(row?.completed_at).toBeNull();
    expect(await eventMovementCount(eventTwo)).toBe(0);
    expect(await stockQuantity()).toBe(stockBefore);
  });
});