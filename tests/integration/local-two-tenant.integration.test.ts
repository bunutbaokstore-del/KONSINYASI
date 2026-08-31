import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RUN_LOCAL = process.env.RUN_LOCAL_TWO_TENANT === "1";
const LOCAL_URL = process.env.SUPABASE_LOCAL_URL ?? "http://127.0.0.1:54321";
const LOCAL_ANON_KEY = process.env.SUPABASE_LOCAL_ANON_KEY;
const LOCAL_SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;

if (!LOCAL_URL.startsWith("http://127.0.0.1:" ) && !LOCAL_URL.startsWith("http://localhost:" )) {
  throw new Error("local-two-tenant integration test refuses a non-local SUPABASE_LOCAL_URL");
}

type FixtureUser = {
  email: string;
  password: string;
  role: "distributor" | "admin" | "mitra_umkm";
  distributorId?: string;
  id?: string;
};

const fixture: FixtureUser[] = [
  { email: "auth28a-d1@example.local", password: "LocalOnly-A1!safe", role: "distributor" },
  { email: "auth28a-d2@example.local", password: "LocalOnly-A2!safe", role: "distributor" },
  { email: "auth28a-admin-d1@example.local", password: "LocalOnly-B1!safe", role: "admin" },
  { email: "auth28a-admin-d2@example.local", password: "LocalOnly-B2!safe", role: "admin" },
  { email: "auth28a-mitra-d1@example.local", password: "LocalOnly-C1!safe", role: "mitra_umkm" },
  { email: "auth28a-mitra-d2@example.local", password: "LocalOnly-C2!safe", role: "mitra_umkm" },
];

function assertLocalTestConfiguration() {
  if (!RUN_LOCAL) throw new Error("Set RUN_LOCAL_TWO_TENANT=1 to run the local-only integration fixture");
  if (!LOCAL_ANON_KEY || !LOCAL_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_LOCAL_ANON_KEY and SUPABASE_LOCAL_SERVICE_ROLE_KEY are required");
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

async function provisionUser(client: SupabaseClient, user: FixtureUser, distributorId?: string) {
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
  const { data, error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  expect(error).toBeNull();
  expect(data.session?.access_token).toBeTruthy();
  return userClient(data.session!.access_token);
}

describe.skipIf(!RUN_LOCAL)("LOCAL two-tenant isolation fixture", () => {
  const admin = RUN_LOCAL ? adminClient() : null;

  beforeAll(async () => {
    assertLocalTestConfiguration();
    await provisionUser(admin!, fixture[0]);
    await provisionUser(admin!, fixture[1]);
    await provisionUser(admin!, fixture[2], fixture[0].id);
    await provisionUser(admin!, fixture[3], fixture[1].id);
    await provisionUser(admin!, fixture[4], fixture[0].id);
    await provisionUser(admin!, fixture[5], fixture[1].id);
  });

  afterAll(async () => {
    if (!admin) return;
    for (const user of fixture) {
      if (user.id) await admin.auth.admin.deleteUser(user.id);
    }
  });

  it("provisions two isolated Distributor → Admin → Mitra trees", () => {
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
    const first = await d1.from("user_profiles").select("user_id, distributor_id");
    const second = await d2.from("user_profiles").select("user_id, distributor_id");

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(first.data).toHaveLength(3);
    expect(second.data).toHaveLength(3);
    expect(first.data?.every((row) => row.distributor_id === fixture[0].id)).toBe(true);
    expect(second.data?.every((row) => row.distributor_id === fixture[1].id)).toBe(true);
    expect(first.data?.some((row) => row.distributor_id === fixture[1].id)).toBe(false);
    expect(second.data?.some((row) => row.distributor_id === fixture[0].id)).toBe(false);
  });

  it("denies cross-tenant consignment items and tenant access to platform membership", async () => {
    const d1 = await signIn(fixture[0]);
    const crossTenantRead = await d1
      .from("consignment_items")
      .select("id")
      .eq("distributor_id", fixture[1].id!);
    expect(crossTenantRead.error).toBeNull();
    expect(crossTenantRead.data).toEqual([]);

    const tenantPlatformRead = await d1.from("platform_admins").select("user_id");
    expect(tenantPlatformRead.error).toBeNull();
    expect(tenantPlatformRead.data).toEqual([]);
  });
});
