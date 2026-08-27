import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import type { User } from "../../drizzle/schema";
import { getSupabaseUserFromRequest } from "../supabase-admin";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  supabaseUser: SupabaseUser | null;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  let user: User | null = null;
  let supabaseUser: SupabaseUser | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch {
    user = null;
  }

  try {
    supabaseUser = await getSupabaseUserFromRequest(opts.req);
  } catch {
    supabaseUser = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    supabaseUser,
  };
}
