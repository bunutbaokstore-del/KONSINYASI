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
  it("enforces Mitra consignment item tenant isolation for insert, select, update, and delete", async () => {
    const mitraA = await signIn(fixture[4]);
    const mitraB = await signIn(fixture[5]);

    const tenantA = fixture[0].id!;
    const tenantB = fixture[1].id!;
    const mitraAId = fixture[4].id!;
    const mitraBId = fixture[5].id!;

    // 1. Mitra A can insert into tenant A.
    const insertA = await mitraA
      .from("consignment_items")
      .insert({
        distributor_id: tenantA,
        mitra_user_id: mitraAId,
        name: "LOCAL-RLS-A",
        sku: "LOCAL-RLS-A",
      })
      .select("id, distributor_id, mitra_user_id")
      .single();

    expect(insertA.error).toBeNull();
    expect(insertA.data?.distributor_id).toBe(tenantA);
    expect(insertA.data?.mitra_user_id).toBe(mitraAId);

    const itemAId = insertA.data!.id;

    // 2. Mitra B can insert into tenant B.
    const insertB = await mitraB
      .from("consignment_items")
      .insert({
        distributor_id: tenantB,
        mitra_user_id: mitraBId,
        name: "LOCAL-RLS-B",
        sku: "LOCAL-RLS-B",
      })
      .select("id, distributor_id, mitra_user_id")
      .single();

    expect(insertB.error).toBeNull();
    expect(insertB.data?.distributor_id).toBe(tenantB);
    expect(insertB.data?.mitra_user_id).toBe(mitraBId);

    const itemBId = insertB.data!.id;

    // 3. Mitra A cannot spoof tenant B on INSERT.
    const spoofA = await mitraA.from("consignment_items").insert({
      distributor_id: tenantB,
      mitra_user_id: mitraAId,
      name: "LOCAL-RLS-SPOOF-A",
      sku: "LOCAL-RLS-SPOOF-A",
    });

    expect(spoofA.error).toBeTruthy();

    // 4. Mitra B cannot spoof tenant A on INSERT.
    const spoofB = await mitraB.from("consignment_items").insert({
      distributor_id: tenantA,
      mitra_user_id: mitraBId,
      name: "LOCAL-RLS-SPOOF-B",
      sku: "LOCAL-RLS-SPOOF-B",
    });

    expect(spoofB.error).toBeTruthy();

    // 5. Mitra A cannot SELECT tenant B's row.
    const crossSelectA = await mitraA
      .from("consignment_items")
      .select("id, distributor_id")
      .eq("id", itemBId);

    expect(crossSelectA.error).toBeNull();
    expect(crossSelectA.data).toEqual([]);

    // 6. Mitra B cannot SELECT tenant A's row.
    const crossSelectB = await mitraB
      .from("consignment_items")
      .select("id, distributor_id")
      .eq("id", itemAId);

    expect(crossSelectB.error).toBeNull();
    expect(crossSelectB.data).toEqual([]);

    // 7. Mitra A cannot UPDATE tenant B's row.
    const crossUpdateA = await mitraA
      .from("consignment_items")
      .update({ name: "CROSS-TENANT-UPDATE-A" })
      .eq("id", itemBId)
      .select("id");

    expect(crossUpdateA.error).toBeNull();
    expect(crossUpdateA.data).toEqual([]);

    // 8. Mitra B cannot UPDATE tenant A's row.
    const crossUpdateB = await mitraB
      .from("consignment_items")
      .update({ name: "CROSS-TENANT-UPDATE-B" })
      .eq("id", itemAId)
      .select("id");

    expect(crossUpdateB.error).toBeNull();
    expect(crossUpdateB.data).toEqual([]);

    // 9. Mitra A cannot change its own row's tenant scope to B.
    const changeScopeA = await mitraA
      .from("consignment_items")
      .update({ distributor_id: tenantB })
      .eq("id", itemAId)
      .select("id, distributor_id");

    expect(changeScopeA.error).toBeTruthy();
expect(changeScopeA.error?.code).toBe("42501");

    // 10. Mitra B cannot change its own row's tenant scope to A.
    const changeScopeB = await mitraB
      .from("consignment_items")
      .update({ distributor_id: tenantA })
      .eq("id", itemBId)
      .select("id, distributor_id");

    expect(changeScopeB.error).toBeTruthy();
expect(changeScopeB.error?.code).toBe("42501");

    // 11. Mitra A cannot DELETE tenant B's row.
    const crossDeleteA = await mitraA
      .from("consignment_items")
      .delete()
      .eq("id", itemBId)
      .select("id");

    expect(crossDeleteA.error).toBeNull();
    expect(crossDeleteA.data).toEqual([]);

    // 12. Mitra B cannot DELETE tenant A's row.
    const crossDeleteB = await mitraB
      .from("consignment_items")
      .delete()
      .eq("id", itemAId)
      .select("id");

    expect(crossDeleteB.error).toBeNull();
    expect(crossDeleteB.data).toEqual([]);

    // Verify tenant scope and records remain unchanged.
    const verifyA = await mitraA
      .from("consignment_items")
      .select("id, distributor_id, mitra_user_id, name")
      .eq("id", itemAId)
      .single();

    const verifyB = await mitraB
      .from("consignment_items")
      .select("id, distributor_id, mitra_user_id, name")
      .eq("id", itemBId)
      .single();

    expect(verifyA.error).toBeNull();
    expect(verifyA.data?.distributor_id).toBe(tenantA);
    expect(verifyA.data?.mitra_user_id).toBe(mitraAId);
    expect(verifyA.data?.name).toBe("LOCAL-RLS-A");

    expect(verifyB.error).toBeNull();
    expect(verifyB.data?.distributor_id).toBe(tenantB);
    expect(verifyB.data?.mitra_user_id).toBe(mitraBId);
    expect(verifyB.data?.name).toBe("LOCAL-RLS-B");

    // Cleanup disposable rows.
    const cleanupA = await admin!
      .from("consignment_items")
      .delete()
      .eq("id", itemAId);

    const cleanupB = await admin!
      .from("consignment_items")
      .delete()
      .eq("id", itemBId);

    expect(cleanupA.error).toBeNull();
    expect(cleanupB.error).toBeNull();
  });
});
