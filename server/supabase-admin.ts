import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import type { Request } from "express";
import { isAppRole, type AppRole } from "../shared/auth";

let adminClient: SupabaseClient | null = null;
let publicClient: SupabaseClient | null = null;

export function getSupabasePublicClient() {
  if (publicClient) return publicClient;

  const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Supabase public credentials are not configured");
  }

  publicClient = createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  return publicClient;
}

export function getSupabaseUserClient(accessToken: string) {
  const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("Supabase public credentials are not configured");
  }
  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export function getSupabaseAdminClient() {
  if (adminClient) return adminClient;

  const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase server credentials are not configured");
  }

  adminClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return adminClient;
}

export function getBearerToken(req: Request) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

export async function getSupabaseUserFromToken(
  client: Pick<SupabaseClient, "auth">,
  token: string,
): Promise<User | null> {
  const { data, error } = await client.auth.getUser(token);
  if (error) return null;
  return data.user;
}

export async function getSupabaseUserFromRequest(
  req: Request,
): Promise<User | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  // Validate the user's access token with the publishable-key client.
  // The service-role client remains server-only for privileged data operations.
  return getSupabaseUserFromToken(getSupabasePublicClient(), token);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function getUserRole(user: User | null): AppRole | null {
  const role = user?.app_metadata?.role;
  return isAppRole(role) ? role : null;
}
export async function isActiveSysAdmin(user: User | null): Promise<boolean> {
  if (!user?.id) return false;

  if (user.app_metadata?.role !== "sys_admin") {
    return false;
  }

  const { data, error } = await getSupabaseAdminClient()
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to verify platform admin membership: ${error.message}`,
    );
  }

  return Boolean(data?.user_id);
}
export function getDistributorId(user: User | null): string | null {
  const role = user?.app_metadata?.role;
  if (role === "sys_admin") {
    return null;
  }
  if (role === "distributor") {
    return isValidUuid(user?.id) ? user.id : null;
  }
  if (!isAppRole(role)) {
    return null;
  }
  const distributorId = user?.app_metadata?.distributor_id;
  return isValidUuid(distributorId) ? distributorId : null;
}
