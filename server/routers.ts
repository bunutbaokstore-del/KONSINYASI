import { COOKIE_NAME } from "../shared/const.js";
import { isManagedRole, ROLE_LABELS, type AppRole } from "../shared/auth";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, userManagementProcedure } from "./_core/trpc";
import { getDistributorId, getSupabaseAdminClient, getSupabasePublicClient, getUserRole } from "./supabase-admin";
import { TRPCError } from "@trpc/server";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { KTP_CONTENT_TYPES } from "../shared/user-profile";
import { z } from "zod";

const roleSchema = z.enum(["distributor", "admin", "mitra_umkm", "supervisor", "sales_motoris", "hrd"]);
const emailSchema = z.string().trim().toLowerCase().email().max(320);
const fullNameSchema = z.string().trim().min(2, "Nama minimal 2 karakter").max(120);
const phoneSchema = z.string().trim().transform((value) => value.replace(/[\s()-]/g, "")).refine((value) => /^\+?\d{8,15}$/.test(value), "Nomor HP tidak valid.");
const addressSchema = z.string().trim().min(10, "Alamat minimal 10 karakter.").max(500);
const passwordSchema = z.string().min(8, "Password minimal 8 karakter").max(72);
const ktpContentTypeSchema = z.enum(KTP_CONTENT_TYPES);

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
  registration: router({
    createDistributor: publicProcedure
      .input(z.object({
        name: fullNameSchema,
        email: emailSchema,
        phone: phoneSchema,
        emergencyContactName: fullNameSchema,
        emergencyContactRelation: z.string().trim().min(2, "Hubungan kontak darurat wajib diisi.").max(80),
        emergencyContactPhone: phoneSchema,
        address: addressSchema,
        ktpBase64: z.string().min(1, "Foto KTP wajib diunggah.").max(7000000),
        ktpContentType: ktpContentTypeSchema,
        ktpOriginalName: z.string().trim().min(1).max(255),
        password: passwordSchema,
      }))
      .mutation(async ({ input }) => {
        const adminClient = getSupabaseAdminClient();
        const { data, error } = await adminClient.auth.admin.createUser({
          email: input.email,
          password: input.password,
          email_confirm: false,
          user_metadata: { full_name: input.name },
          app_metadata: { role: "distributor", status: "active" },
        });
        if (error || !data.user) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error?.message ?? "Pendaftaran belum dapat diproses." });
        }

        const extension = input.ktpContentType === "image/png" ? "png" : input.ktpContentType === "image/webp" ? "webp" : "jpg";
        const ktpStoragePath = `${data.user.id}/${data.user.id}/${crypto.randomUUID()}.${extension}`;
        const base64Payload = input.ktpBase64.replace(/^data:[^;]+;base64,/, "");
        const ktpBytes = Buffer.from(base64Payload, "base64");
        if (ktpBytes.byteLength === 0 || ktpBytes.byteLength > 5242880) {
          await adminClient.auth.admin.deleteUser(data.user.id);
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ukuran foto KTP maksimal 5 MB." });
        }

        const { error: uploadError } = await adminClient.storage.from("user-ktp").upload(ktpStoragePath, ktpBytes, {
          contentType: input.ktpContentType,
          upsert: false,
        });
        if (uploadError) {
          await adminClient.auth.admin.deleteUser(data.user.id);
          throw new TRPCError({ code: "BAD_REQUEST", message: "Foto KTP belum dapat disimpan." });
        }

        const { error: profileError } = await adminClient.from("user_profiles").insert({
          user_id: data.user.id,
          distributor_id: data.user.id,
          full_name: input.name,
          phone: input.phone,
          emergency_contact_name: input.emergencyContactName,
          emergency_contact_relation: input.emergencyContactRelation,
          emergency_contact_phone: input.emergencyContactPhone,
          address: input.address,
          ktp_storage_path: ktpStoragePath,
          ktp_original_name: input.ktpOriginalName,
          ktp_content_type: input.ktpContentType,
        });
        if (profileError) {
          await adminClient.storage.from("user-ktp").remove([ktpStoragePath]);
          await adminClient.auth.admin.deleteUser(data.user.id);
          throw new TRPCError({ code: "BAD_REQUEST", message: "Data profil belum dapat disimpan." });
        }

        const { error: confirmationError } = await getSupabasePublicClient().auth.resend({
          type: "signup",
          email: input.email,
          options: { emailRedirectTo: "konsinyasi://auth/callback" },
        });
        if (confirmationError) {
          await adminClient.storage.from("user-ktp").remove([ktpStoragePath]);
          await adminClient.from("user_profiles").delete().eq("user_id", data.user.id);
          await adminClient.auth.admin.deleteUser(data.user.id);
          throw new TRPCError({ code: "BAD_REQUEST", message: "Email konfirmasi belum dapat dikirim." });
        }

        return { email: data.user.email ?? input.email };
      }),
  }),
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
        phone: phoneSchema,
        emergencyContactName: fullNameSchema,
        emergencyContactRelation: z.string().trim().min(2, "Hubungan kontak darurat wajib diisi.").max(80),
        emergencyContactPhone: phoneSchema,
        address: addressSchema,
        ktpBase64: z.string().min(1, "Foto KTP wajib diunggah.").max(7000000),
        ktpContentType: ktpContentTypeSchema,
        ktpOriginalName: z.string().trim().min(1).max(255),
        password: passwordSchema,
        role: roleSchema,
      }))
      .mutation(async ({ ctx, input }) => {
        const currentRole = callerRole(ctx);
        ensureTargetRoleAllowed(currentRole, input.role);
        ensureDistributorCannotBeCreated(input.role);
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
        }
        const appMetadata = { role: input.role, status: "active", distributor_id: distributorId };
        const adminClient = getSupabaseAdminClient();

        const { data, error } = await adminClient.auth.admin.createUser({
          email: input.email,
          password: input.password,
          email_confirm: true,
          user_metadata: { full_name: input.name },
          app_metadata: appMetadata,
        });
        if (error || !data.user) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error?.message ?? "Akun belum dapat dibuat." });
        }

        const extension = input.ktpContentType === "image/png" ? "png" : input.ktpContentType === "image/webp" ? "webp" : "jpg";
        const ktpStoragePath = `${distributorId}/${data.user.id}/${crypto.randomUUID()}.${extension}`;
        const base64Payload = input.ktpBase64.replace(/^data:[^;]+;base64,/, "");
        const ktpBytes = Buffer.from(base64Payload, "base64");
        if (ktpBytes.byteLength === 0 || ktpBytes.byteLength > 5242880) {
          await adminClient.auth.admin.deleteUser(data.user.id);
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ukuran foto KTP maksimal 5 MB." });
        }

        const { error: uploadError } = await adminClient.storage.from("user-ktp").upload(ktpStoragePath, ktpBytes, {
          contentType: input.ktpContentType,
          upsert: false,
        });
        if (uploadError) {
          await adminClient.auth.admin.deleteUser(data.user.id);
          throw new TRPCError({ code: "BAD_REQUEST", message: "Foto KTP belum dapat disimpan." });
        }

        const { error: profileError } = await adminClient.from("user_profiles").insert({
          user_id: data.user.id,
          distributor_id: distributorId,
          full_name: input.name,
          phone: input.phone,
          emergency_contact_name: input.emergencyContactName,
          emergency_contact_relation: input.emergencyContactRelation,
          emergency_contact_phone: input.emergencyContactPhone,
          address: input.address,
          ktp_storage_path: ktpStoragePath,
          ktp_original_name: input.ktpOriginalName,
          ktp_content_type: input.ktpContentType,
        });
        if (profileError) {
          await adminClient.storage.from("user-ktp").remove([ktpStoragePath]);
          await adminClient.auth.admin.deleteUser(data.user.id);
          throw new TRPCError({ code: "BAD_REQUEST", message: "Data profil pengguna belum dapat disimpan." });
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
        const adminClient = getSupabaseAdminClient();
        const { data, error } = await adminClient.auth.admin.updateUserById(input.userId, {
          email: input.email,
          email_confirm: true,
          user_metadata: { ...(target.user_metadata ?? {}), full_name: input.name },
          app_metadata: appMetadata,
        });
        if (error || !data.user) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error?.message ?? "Akun belum dapat diperbarui." });
        }
        await adminClient.from("user_profiles").update({ full_name: input.name, updated_at: new Date().toISOString() }).eq("user_id", input.userId);
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
        const adminClient = getSupabaseAdminClient();
        const { data: profile } = await adminClient.from("user_profiles").select("ktp_storage_path").eq("user_id", input.userId).maybeSingle();
        if (profile?.ktp_storage_path) {
          await adminClient.storage.from("user-ktp").remove([profile.ktp_storage_path]);
        }
        const { error } = await adminClient.auth.admin.deleteUser(input.userId);
        if (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Akun belum dapat dihapus." });
        }
        return { success: true } as const;
      }),
  }),
});

export type AppRouter = typeof appRouter;
