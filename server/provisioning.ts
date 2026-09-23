import type { SupabaseClient } from "@supabase/supabase-js";
import { TRPCError } from "@trpc/server";

const METADATA_ROLE_TO_USER_ROLE = {
  distributor: "DISTRIBUTOR",
  admin: "ADMIN",
  sales_motoris: "SALES_MOTORIS",
  hrd: "HRD",
  supervisor: "SUPERVISOR",
  mitra_umkm: "MITRA_UMKM",
  sys_admin: "PLATFORM_SYS_ADMIN",
} as const;

export type MetadataRole = keyof typeof METADATA_ROLE_TO_USER_ROLE;

export type ProvisionMirrorInput = {
  id: string;
  email: string | null;
  role: MetadataRole;
  status: string;
  distributorId: string | null;
  name: string;
  phone?: string | null;
};

export function isProvisionableRole(value: unknown): value is MetadataRole {
  return typeof value === "string" && value in METADATA_ROLE_TO_USER_ROLE;
}

export function resolveUserRoleEnum(role: MetadataRole) {
  return METADATA_ROLE_TO_USER_ROLE[role];
}

export async function syncUserMirrors(
  client: SupabaseClient,
  input: ProvisionMirrorInput,
): Promise<void> {
  const isActive = input.status !== "disabled";
  const distributorId =
    input.role === "distributor" ? input.id : input.role === "sys_admin" ? null : input.distributorId;

  if (input.role === "distributor") {
    const { error } = await client.from("distributors").upsert(
      {
        id: input.id,
        name: input.name,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Data Distributor belum dapat disimpan." });
    }
  }

  const usersRow: Record<string, unknown> = {
    id: input.id,
    distributor_id: distributorId,
    name: input.name,
    email: input.email,
    role: resolveUserRoleEnum(input.role),
    is_active: isActive,
    updated_at: new Date().toISOString(),
  };
  if (input.phone !== undefined) {
    usersRow.phone = input.phone;
  }

  const { error } = await client.from("users").upsert(usersRow, { onConflict: "id" });
  if (error) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Data pengguna belum dapat disimpan." });
  }
}

export async function removeUserMirror(client: SupabaseClient, userId: string): Promise<void> {
  const { error: usersError } = await client.from("users").delete().eq("id", userId);
  if (usersError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Data pengguna belum dapat dihapus." });
  }

  const { error: distributorsError } = await client.from("distributors").delete().eq("id", userId);
  if (distributorsError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Data Distributor belum dapat dihapus." });
  }
}

export async function rollbackProvisionedUser(client: SupabaseClient, userId: string): Promise<void> {
  try {
    await removeUserMirror(client, userId);
  } catch {
    // Best-effort: identity mirrors are additively provisioned, so a cleanup
    // failure here must never mask the primary rollback error.
  }
}