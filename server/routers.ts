import { COOKIE_NAME } from "../shared/const.js";
import { isManagedRole, ROLE_LABELS, type AppRole } from "../shared/auth";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, supabaseProtectedProcedure, userManagementProcedure } from "./_core/trpc";
import { getDistributorId, getSupabaseAdminClient, getSupabasePublicClient, getUserRole } from "./supabase-admin";
import { TRPCError } from "@trpc/server";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { KTP_CONTENT_TYPES } from "../shared/user-profile";
import { getStockStatus, summarizeStock, type ConsignmentItem } from "../shared/consignment";
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

function toConsignmentItem(item: { id: string; mitra_user_id?: string; name: string; sku?: string | null; unit: string; stock_quantity: number; minimum_stock: number; updated_at: string }) {
  return {
    id: item.id,
    mitraUserId: item.mitra_user_id,
    name: item.name,
    sku: item.sku ?? null,
    unit: item.unit,
    stockQuantity: item.stock_quantity,
    minimumStock: item.minimum_stock,
    status: getStockStatus(item.stock_quantity, item.minimum_stock),
    updatedAt: item.updated_at,
  } as const;
}

async function getMitraInScope(ctx: { supabaseUser: SupabaseUser | null }, userId: string) {
  const target = await getTargetOrThrow(userId);
  const targetRole = getUserRole(target);
  if (targetRole !== "mitra_umkm") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Barang hanya dapat ditugaskan kepada Mitra UMKM." });
  }
  const distributorId = getDistributorId(ctx.supabaseUser);
  const targetDistributorId = typeof target.app_metadata?.distributor_id === "string" ? target.app_metadata.distributor_id : null;
  if (!distributorId || targetDistributorId !== distributorId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Mitra UMKM berada di luar ruang kerja Anda." });
  }
  return { target, distributorId };
}

function toSupplierRequest(request: { id: string; request_type: string; item_id?: string | null; proposed_name?: string | null; proposed_sku?: string | null; proposed_unit?: string | null; proposed_stock_quantity?: number | null; proposed_minimum_stock?: number | null; reason: string; status: string; review_note?: string | null; reviewed_at?: string | null; created_at: string; mitra_user_id: string }) {
  return {
    id: request.id,
    requestType: request.request_type,
    itemId: request.item_id ?? null,
    mitraUserId: request.mitra_user_id,
    proposedName: request.proposed_name ?? null,
    proposedSku: request.proposed_sku ?? null,
    proposedUnit: request.proposed_unit ?? null,
    proposedStockQuantity: request.proposed_stock_quantity ?? null,
    proposedMinimumStock: request.proposed_minimum_stock ?? null,
    reason: request.reason,
    status: request.status,
    reviewNote: request.review_note ?? null,
    reviewedAt: request.reviewed_at ?? null,
    createdAt: request.created_at,
  } as const;
}

function toStockMovement(movement: { id: string; item_id: string; previous_stock: number; change_quantity: number; resulting_stock: number; movement_type: string; reason: string; created_at: string }) {
  return { id: movement.id, itemId: movement.item_id, previousStock: movement.previous_stock, changeQuantity: movement.change_quantity, resultingStock: movement.resulting_stock, movementType: movement.movement_type, reason: movement.reason, createdAt: movement.created_at } as const;
}

function toNotification(notification: { id: string; notification_type: string; title: string; body: string; is_read: boolean; request_id?: string | null; created_at: string }) {
  return { id: notification.id, notificationType: notification.notification_type, title: notification.title, body: notification.body, isRead: notification.is_read, requestId: notification.request_id ?? null, createdAt: notification.created_at } as const;
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
  inventory: router({
    list: userManagementProcedure.query(async ({ ctx }) => {
      const distributorId = getDistributorId(ctx.supabaseUser);
      if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
      const { data, error } = await getSupabaseAdminClient()
        .from("consignment_items")
        .select("id, mitra_user_id, name, sku, unit, stock_quantity, minimum_stock, updated_at")
        .eq("distributor_id", distributorId)
        .order("updated_at", { ascending: false });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Daftar barang titipan belum dapat dimuat." });
      return (data ?? []).map(toConsignmentItem);
    }),
    mitras: userManagementProcedure.query(async ({ ctx }) => {
      const distributorId = getDistributorId(ctx.supabaseUser);
      if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
      const { data, error } = await getSupabaseAdminClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Daftar Mitra UMKM belum dapat dimuat." });
      return data.users
        .filter((user) => getUserRole(user) === "mitra_umkm" && user.app_metadata?.distributor_id === distributorId)
        .map((user) => ({ id: user.id, name: typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim() ? user.user_metadata.full_name.trim() : user.email?.split("@")[0] ?? "Mitra UMKM", email: user.email ?? "" }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }),
    create: userManagementProcedure
      .input(z.object({
        mitraUserId: z.string().uuid(),
        name: z.string().trim().min(1, "Nama barang wajib diisi.").max(160),
        sku: z.string().trim().max(80).nullable().optional(),
        unit: z.string().trim().min(1, "Satuan wajib diisi.").max(40),
        stockQuantity: z.number().int().min(0).max(1000000000),
        minimumStock: z.number().int().min(0).max(1000000000),
      }))
      .mutation(() => {
        throw new TRPCError({ code: "FORBIDDEN", message: "Barang resmi hanya dapat ditambahkan melalui persetujuan supplier." });
      }),
    update: userManagementProcedure
      .input(z.object({
        itemId: z.string().uuid(),
        mitraUserId: z.string().uuid(),
        name: z.string().trim().min(1, "Nama barang wajib diisi.").max(160),
        sku: z.string().trim().max(80).nullable().optional(),
        unit: z.string().trim().min(1, "Satuan wajib diisi.").max(40),
        stockQuantity: z.number().int().min(0).max(1000000000),
        minimumStock: z.number().int().min(0).max(1000000000),
      }))
      .mutation(async ({ ctx, input }) => {
        const { distributorId } = await getMitraInScope(ctx, input.mitraUserId);
        const { data, error } = await getSupabaseAdminClient()
          .from("consignment_items")
          .update({ mitra_user_id: input.mitraUserId, name: input.name, sku: input.sku || null, unit: input.unit, minimum_stock: input.minimumStock, updated_at: new Date().toISOString() })
          .eq("id", input.itemId)
          .eq("distributor_id", distributorId)
          .select("id, name, sku, unit, stock_quantity, minimum_stock, updated_at")
          .maybeSingle();
        if (error || !data) throw new TRPCError({ code: "NOT_FOUND", message: "Barang titipan tidak ditemukan." });
        return toConsignmentItem(data);
      }),
    remove: userManagementProcedure
      .input(z.object({ itemId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
        const { error, count } = await getSupabaseAdminClient().from("consignment_items").delete({ count: "exact" }).eq("id", input.itemId).eq("distributor_id", distributorId);
        if (error || count !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "Barang titipan tidak ditemukan." });
        return { success: true } as const;
      }),
  }),
  stockMovements: router({
    list: supabaseProtectedProcedure.query(async ({ ctx }) => {
      const role = callerRole(ctx);
      const distributorId = getDistributorId(ctx.supabaseUser);
      if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja tidak ditemukan." });
      let query = getSupabaseAdminClient().from("stock_movements").select("id, item_id, previous_stock, change_quantity, resulting_stock, movement_type, reason, created_at").eq("distributor_id", distributorId).order("created_at", { ascending: false }).limit(100);
      if (role === "mitra_umkm") query = query.eq("mitra_user_id", ctx.supabaseUser.id);
      else if (role !== "admin" && role !== "distributor") throw new TRPCError({ code: "FORBIDDEN", message: "Role ini tidak dapat melihat audit stok." });
      const { data, error } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Riwayat stok belum dapat dimuat." });
      return (data ?? []).map(toStockMovement);
    }),
  }),
  notifications: router({
    list: supabaseProtectedProcedure.query(async ({ ctx }) => {
      const { data, error } = await getSupabaseAdminClient().from("notifications").select("id, notification_type, title, body, is_read, request_id, created_at").eq("recipient_user_id", ctx.supabaseUser.id).order("created_at", { ascending: false }).limit(50);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Notifikasi belum dapat dimuat." });
      return (data ?? []).map(toNotification);
    }),
    markRead: supabaseProtectedProcedure.input(z.object({ notificationId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
      const { error } = await getSupabaseAdminClient().from("notifications").update({ is_read: true }).eq("id", input.notificationId).eq("recipient_user_id", ctx.supabaseUser.id);
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: "Notifikasi belum dapat ditandai dibaca." });
      return { success: true } as const;
    }),
  }),
  supplier: router({
    pendingNewItemCount: userManagementProcedure.query(async ({ ctx }) => {
      if (callerRole(ctx) !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Jumlah pengajuan pending hanya tersedia untuk Admin." });
      const distributorId = getDistributorId(ctx.supabaseUser);
      if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja supplier tidak ditemukan." });
      const { count, error } = await getSupabaseAdminClient()
        .from("consignment_requests")
        .select("id", { count: "exact", head: true })
        .eq("distributor_id", distributorId)
        .eq("request_type", "new_item")
        .eq("status", "pending");
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Jumlah pengajuan pending belum dapat dimuat." });
      return { count: count ?? 0 } as const;
    }),
    requests: supabaseProtectedProcedure.query(async ({ ctx }) => {
      const role = callerRole(ctx);
      const distributorId = getDistributorId(ctx.supabaseUser);
      if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja supplier tidak ditemukan." });
      let query = getSupabaseAdminClient()
        .from("consignment_requests")
        .select("id, request_type, item_id, mitra_user_id, proposed_name, proposed_sku, proposed_unit, proposed_stock_quantity, proposed_minimum_stock, reason, status, review_note, reviewed_at, created_at")
        .eq("distributor_id", distributorId)
        .order("created_at", { ascending: false });
      if (role === "mitra_umkm") query = query.eq("mitra_user_id", ctx.supabaseUser.id);
      else if (role !== "admin" && role !== "distributor") throw new TRPCError({ code: "FORBIDDEN", message: "Role ini tidak dapat melihat pengajuan supplier." });
      const { data, error } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pengajuan supplier belum dapat dimuat." });
      return (data ?? []).map(toSupplierRequest);
    }),
    submitNewItem: supabaseProtectedProcedure
      .input(z.object({
        name: z.string().trim().min(1, "Nama barang wajib diisi.").max(160),
        sku: z.string().trim().max(80).nullable().optional(),
        unit: z.string().trim().min(1, "Satuan wajib diisi.").max(40),
        proposedStockQuantity: z.number().int().min(0).max(1000000000),
        proposedMinimumStock: z.number().int().min(0).max(1000000000),
        reason: z.string().trim().min(3, "Alasan pengajuan wajib diisi.").max(500),
      }))
      .mutation(async ({ ctx, input }) => {
        if (callerRole(ctx) !== "mitra_umkm") throw new TRPCError({ code: "FORBIDDEN", message: "Hanya Mitra UMKM yang dapat mengajukan barang." });
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja supplier tidak ditemukan." });
        const { data, error } = await getSupabaseAdminClient().from("consignment_requests").insert({ distributor_id: distributorId, mitra_user_id: ctx.supabaseUser.id, request_type: "new_item", proposed_name: input.name, proposed_sku: input.sku || null, proposed_unit: input.unit, proposed_stock_quantity: input.proposedStockQuantity, proposed_minimum_stock: input.proposedMinimumStock, reason: input.reason, status: "pending" }).select("id, request_type, item_id, mitra_user_id, proposed_name, proposed_sku, proposed_unit, proposed_stock_quantity, proposed_minimum_stock, reason, status, review_note, reviewed_at, created_at").single();
        if (error || !data) throw new TRPCError({ code: "BAD_REQUEST", message: "Pengajuan barang belum dapat dikirim." });
        return toSupplierRequest(data);
      }),
    submitStockChange: supabaseProtectedProcedure
      .input(z.object({ itemId: z.string().uuid(), proposedStockQuantity: z.number().int().min(0).max(1000000000), reason: z.string().trim().min(3, "Alasan pengajuan wajib diisi.").max(500) }))
      .mutation(async ({ ctx, input }) => {
        if (callerRole(ctx) !== "mitra_umkm") throw new TRPCError({ code: "FORBIDDEN", message: "Hanya Mitra UMKM yang dapat mengajukan perubahan stok." });
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja supplier tidak ditemukan." });
        const { data: item } = await getSupabaseAdminClient().from("consignment_items").select("id").eq("id", input.itemId).eq("mitra_user_id", ctx.supabaseUser.id).eq("distributor_id", distributorId).maybeSingle();
        if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Barang supplier tidak ditemukan." });
        const { data, error } = await getSupabaseAdminClient().from("consignment_requests").insert({ distributor_id: distributorId, mitra_user_id: ctx.supabaseUser.id, item_id: input.itemId, request_type: "stock_change", proposed_stock_quantity: input.proposedStockQuantity, reason: input.reason, status: "pending" }).select("id, request_type, item_id, mitra_user_id, proposed_name, proposed_sku, proposed_unit, proposed_stock_quantity, proposed_minimum_stock, reason, status, review_note, reviewed_at, created_at").single();
        if (error || !data) throw new TRPCError({ code: "BAD_REQUEST", message: "Pengajuan perubahan stok belum dapat dikirim." });
        return toSupplierRequest(data);
      }),
    review: userManagementProcedure
      .input(z.object({ requestId: z.string().uuid(), decision: z.enum(["approved", "rejected"]), reviewNote: z.string().trim().max(500).optional() }))
      .mutation(async ({ ctx, input }) => {
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja supplier tidak ditemukan." });
        const adminClient = getSupabaseAdminClient();
        const { data: request, error: requestError } = await adminClient.from("consignment_requests").select("id, request_type, item_id, mitra_user_id, proposed_name, proposed_sku, proposed_unit, proposed_stock_quantity, proposed_minimum_stock, reason, status, review_note, reviewed_at, created_at").eq("id", input.requestId).eq("distributor_id", distributorId).maybeSingle();
        if (requestError || !request) throw new TRPCError({ code: "NOT_FOUND", message: "Pengajuan tidak ditemukan." });
        if (request.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Pengajuan ini sudah diproses." });

        let itemId = request.item_id ?? null;
        let previousStock = 0;
        let resultingStock: number | null = null;
        if (input.decision === "approved" && request.request_type === "new_item") {
          if (!request.proposed_name || !request.proposed_unit || request.proposed_stock_quantity === null || request.proposed_minimum_stock === null) throw new TRPCError({ code: "BAD_REQUEST", message: "Data pengajuan barang tidak lengkap." });
          const { data: newItem, error: itemError } = await adminClient.from("consignment_items").insert({ distributor_id: distributorId, mitra_user_id: request.mitra_user_id, name: request.proposed_name, sku: request.proposed_sku, unit: request.proposed_unit, stock_quantity: request.proposed_stock_quantity, minimum_stock: request.proposed_minimum_stock }).select("id").single();
          if (itemError || !newItem) throw new TRPCError({ code: "BAD_REQUEST", message: "Barang resmi belum dapat dibuat." });
          itemId = newItem.id;
          resultingStock = request.proposed_stock_quantity;
        } else if (input.decision === "approved" && request.request_type === "stock_change") {
          if (!request.item_id || request.proposed_stock_quantity === null) throw new TRPCError({ code: "BAD_REQUEST", message: "Data perubahan stok tidak lengkap." });
          const { data: currentItem, error: currentItemError } = await adminClient.from("consignment_items").select("id, stock_quantity").eq("id", request.item_id).eq("distributor_id", distributorId).eq("mitra_user_id", request.mitra_user_id).maybeSingle();
          if (currentItemError || !currentItem) throw new TRPCError({ code: "NOT_FOUND", message: "Barang untuk perubahan stok tidak ditemukan." });
          previousStock = currentItem.stock_quantity;
          resultingStock = request.proposed_stock_quantity;
          const { data: updatedItem, error: itemError } = await adminClient.from("consignment_items").update({ stock_quantity: resultingStock, updated_at: new Date().toISOString() }).eq("id", request.item_id).eq("distributor_id", distributorId).eq("mitra_user_id", request.mitra_user_id).select("id").maybeSingle();
          if (itemError || !updatedItem) throw new TRPCError({ code: "NOT_FOUND", message: "Barang untuk perubahan stok tidak ditemukan." });
        }

        const reviewerId = ctx.supabaseUser?.id;
        if (!reviewerId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sesi Admin tidak ditemukan." });
        const { data: updatedRequest, error: reviewError } = await adminClient.from("consignment_requests").update({ status: input.decision, reviewed_by: reviewerId, review_note: input.reviewNote?.trim() || null, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString(), item_id: itemId }).eq("id", input.requestId).eq("status", "pending").select("id, request_type, item_id, mitra_user_id, proposed_name, proposed_sku, proposed_unit, proposed_stock_quantity, proposed_minimum_stock, reason, status, review_note, reviewed_at, created_at").single();
        if (reviewError || !updatedRequest) throw new TRPCError({ code: "BAD_REQUEST", message: "Keputusan pengajuan belum dapat disimpan." });

        if (input.decision === "approved" && itemId && resultingStock !== null) {
          const { error: auditError } = await adminClient.from("stock_movements").insert({ distributor_id: distributorId, mitra_user_id: request.mitra_user_id, item_id: itemId, request_id: request.id, previous_stock: previousStock, change_quantity: resultingStock - previousStock, resulting_stock: resultingStock, movement_type: request.request_type === "new_item" ? "initial_stock" : "supplier_stock_change", reason: request.reason, approved_by: reviewerId });
          if (auditError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Keputusan tersimpan, tetapi audit stok belum dapat dibuat." });
        }

        const notificationTitle = input.decision === "approved" ? "Pengajuan supplier disetujui" : "Pengajuan supplier ditolak";
        const notificationBody = input.decision === "approved" ? "Pengajuan Anda telah disetujui Admin dan data resmi sudah diperbarui." : `Pengajuan Anda ditolak Admin${input.reviewNote?.trim() ? `: ${input.reviewNote.trim()}` : "."}`;
        const { error: notificationError } = await adminClient.from("notifications").insert({ recipient_user_id: request.mitra_user_id, distributor_id: distributorId, request_id: request.id, notification_type: input.decision === "approved" ? "request_approved" : "request_rejected", title: notificationTitle, body: notificationBody });
        if (notificationError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Keputusan tersimpan, tetapi notifikasi belum dapat dibuat." });
        return toSupplierRequest(updatedRequest);
      }),
  }),
  mitraDashboard: router({
    stock: supabaseProtectedProcedure.query(async ({ ctx }) => {
      const role = callerRole(ctx);
      if (role !== "mitra_umkm") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Dashboard stok ini hanya tersedia untuk Mitra UMKM." });
      }

      const distributorId = getDistributorId(ctx.supabaseUser);
      if (!distributorId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Mitra UMKM tidak ditemukan." });
      }

      const { data, error } = await getSupabaseAdminClient()
        .from("consignment_items")
        .select("id, name, sku, unit, stock_quantity, minimum_stock, updated_at")
        .eq("mitra_user_id", ctx.supabaseUser.id)
        .eq("distributor_id", distributorId)
        .order("updated_at", { ascending: false });

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Daftar barang titipan belum dapat dimuat." });
      }

      const items = (data ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        sku: item.sku ?? null,
        unit: item.unit,
        stockQuantity: item.stock_quantity,
        minimumStock: item.minimum_stock,
        status: getStockStatus(item.stock_quantity, item.minimum_stock),
        updatedAt: item.updated_at,
      })) as ConsignmentItem[];

      return { items, summary: summarizeStock(items) };
    }),
  }),
});

export type AppRouter = typeof appRouter;
