import { COOKIE_NAME } from "../shared/const.js";
import { isManagedRole, ROLE_LABELS, type AppRole } from "../shared/auth";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, userManagementProcedure } from "./_core/trpc";
import { getDistributorId, getSupabaseAdminClient, getUserRole } from "./supabase-admin";
import { TRPCError } from "@trpc/server";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { z } from "zod";

const roleSchema = z.enum(["distributor", "admin", "mitra_umkm", "supervisor", "sales_motoris", "hrd"]);
const emailSchema = z.string().trim().toLowerCase().email().max(320);
const fullNameSchema = z.string().trim().min(2, "Nama minimal 2 karakter").max(120);
const passwordSchema = z.string().min(8, "Password minimal 8 karakter").max(72);

function callerRole(ctx: { supabaseUser: SupabaseUser | null }) {
  return getUserRole(ctx.supabaseUser);
}

function ensureTargetRoleAllowed(currentRole: AppRole, targetRole: AppRole) {
  if (currentRole === "admin" && !isManagedRole(targetRole)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin hanya dapat mengelola role bawahan." });
  }
  if (currentRole !== "admin" && currentRole !== "distributor") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Role ini tidak dapat mengelola pengguna." });
  }
}

function ensureDistributorCannotBeCreated(targetRole: AppRole) {
  if (targetRole === "distributor") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Akun Distributor utama sudah tersedia dan tidak dapat dibuat dari Manajemen Pengguna." });
  }
}

async function getTargetOrThrow(userId: string) {
  const { data, error } = await getSupabaseAdminClient().auth.admin.getUserById(userId);
  if (error || !data.user) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Pengguna tidak ditemukan." });
  }
  return data.user;
}

function ensureTargetInScope(ctx: { supabaseUser: SupabaseUser | null }, target: { id: string; app_metadata?: Record<string, unknown> }) {
  const role = callerRole(ctx);
  const distributorId = getDistributorId(ctx.supabaseUser);
  const targetRole = getUserRole(target as never);
  const targetDistributorId = typeof target.app_metadata?.distributor_id === "string" ? target.app_metadata.distributor_id : targetRole === "distributor" ? target.id : null;

  if (role === "admin" && targetRole === "distributor") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin tidak dapat mengelola akun Distributor." });
  }
  if (target.id !== ctx.supabaseUser?.id && targetDistributorId !== distributorId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Pengguna berada di luar ruang kerja Anda." });
  }
}

function toManagedUser(user: { id: string; email?: string; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown>; created_at: string; last_sign_in_at?: string | null }) {
  const role = getUserRole(user as never);
  const status = user.app_metadata?.status === "disabled" ? "disabled" : "active";
  const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name;
  return {
    id: user.id,
    email: user.email ?? "",
    name: typeof metadataName === "string" && metadataName.trim() ? metadataName.trim() : user.email?.split("@")[0] ?? "Pengguna",
    role,
    roleLabel: ROLE_LABELS[role],
    status,
    createdAt: user.created_at,
    lastSignInAt: user.last_sign_in_at ?? null,
  } as const;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  management: router({
    list: userManagementProcedure.query(async ({ ctx }) => {
      const role = callerRole(ctx);
      const distributorId = getDistributorId(ctx.supabaseUser);
      const { data, error } = await getSupabaseAdminClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Daftar pengguna belum dapat dimuat." });
      }

      return data.users
        .filter((user) => {
          const userRole = getUserRole(user);
          const userDistributorId = typeof user.app_metadata?.distributor_id === "string" ? user.app_metadata.distributor_id : userRole === "distributor" ? user.id : null;
          if (role === "admin" && userRole === "distributor") return false;
          return user.id === ctx.supabaseUser?.id || userDistributorId === distributorId;
        })
        .map(toManagedUser)
        .sort((a, b) => a.name.localeCompare(b.name));
    }),
    create: userManagementProcedure
      .input(z.object({
        name: fullNameSchema,
        email: emailSchema,
        password: passwordSchema,
        role: roleSchema,
      }))
      .mutation(async ({ ctx, input }) => {
        const currentRole = callerRole(ctx);
        ensureTargetRoleAllowed(currentRole, input.role);
        ensureDistributorCannotBeCreated(input.role);
        const distributorId = getDistributorId(ctx.supabaseUser);
        const appMetadata = { role: input.role, status: "active", distributor_id: distributorId };

        const { data, error } = await getSupabaseAdminClient().auth.admin.createUser({
          email: input.email,
          password: input.password,
          email_confirm: true,
          user_metadata: { full_name: input.name, must_change_password: true },
          app_metadata: appMetadata,
        });
        if (error || !data.user) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error?.message ?? "Akun belum dapat dibuat." });
        }
        return toManagedUser(data.user);
      }),
    update: userManagementProcedure
      .input(z.object({
        userId: z.string().uuid(),
        name: fullNameSchema,
        email: emailSchema,
        role: roleSchema,
        status: z.enum(["active", "disabled"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const currentRole = callerRole(ctx);
        ensureTargetRoleAllowed(currentRole, input.role);
        const target = await getTargetOrThrow(input.userId);
        ensureTargetInScope(ctx, target);
        const targetRole = getUserRole(target);
        if (targetRole === "distributor" && target.id !== ctx.supabaseUser?.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Akun Distributor utama tidak dapat diubah dari Manajemen Pengguna." });
        }
        if (input.role === "distributor" && target.id !== ctx.supabaseUser?.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Role Distributor hanya untuk akun Distributor utama." });
        }
        if (target.id === ctx.supabaseUser?.id && input.role !== "distributor") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Role akun yang sedang digunakan tidak dapat diturunkan." });
        }
        if (target.id === ctx.supabaseUser?.id && input.status === "disabled") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Akun yang sedang digunakan tidak dapat dinonaktifkan." });
        }

        const existingMetadata = target.app_metadata ?? {};
        const appMetadata = input.role === "distributor"
          ? { ...existingMetadata, role: input.role, status: input.status, distributor_id: undefined }
          : { ...existingMetadata, role: input.role, status: input.status, distributor_id: getDistributorId(ctx.supabaseUser) };
        const { data, error } = await getSupabaseAdminClient().auth.admin.updateUserById(input.userId, {
          email: input.email,
          email_confirm: true,
          user_metadata: { ...(target.user_metadata ?? {}), full_name: input.name },
          app_metadata: appMetadata,
        });
        if (error || !data.user) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error?.message ?? "Akun belum dapat diperbarui." });
        }
        return toManagedUser(data.user);
      }),
    remove: userManagementProcedure
      .input(z.object({ userId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        if (input.userId === ctx.supabaseUser?.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Anda tidak dapat menghapus akun yang sedang digunakan." });
        }
        const target = await getTargetOrThrow(input.userId);
        ensureTargetInScope(ctx, target);
        if (getUserRole(target) === "distributor") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Akun Distributor utama tidak dapat dihapus dari Manajemen Pengguna." });
        }
        const { error } = await getSupabaseAdminClient().auth.admin.deleteUser(input.userId);
        if (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Akun belum dapat dihapus." });
        }
        return { success: true } as const;
      }),
  }),
});

export type AppRouter = typeof appRouter;
