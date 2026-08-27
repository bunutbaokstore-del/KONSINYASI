import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Request } from "express";
import type { AppRole } from "../shared/auth";

let adminClient: SupabaseClient | null = null;
let publicClient: SupabaseClient | null = null;

export function getSupabasePublicClient() {
  if (publicClient) return publicClient;

  const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
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

export async function getSupabaseUserFromRequest(req: Request): Promise<User | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  const { data, error } = await getSupabaseAdminClient().auth.getUser(token);
  if (error) return null;
  return data.user;
}

export function getUserRole(user: User | null): AppRole {
  const role = user?.app_metadata?.role ?? user?.user_metadata?.role;
  return role === "admin" || role === "mitra_umkm" || role === "supervisor" || role === "sales_motoris" || role === "hrd" || role === "distributor"
    ? role
    : "distributor";
}

export function getDistributorId(user: User | null) {
  const distributorId = user?.app_metadata?.distributor_id ?? user?.user_metadata?.distributor_id;
  return typeof distributorId === "string" && distributorId.length > 0 ? distributorId : user?.id ?? null;
}
