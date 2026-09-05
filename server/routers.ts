import { COOKIE_NAME } from "../shared/const.js";
import { isManagedRole, ROLE_LABELS, type AppRole } from "../shared/auth";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { distributorProcedure, publicProcedure, router, supabaseProtectedProcedure, sysAdminProcedure, userManagementProcedure } from "./_core/trpc";
import { getBearerToken, getDistributorId, getSupabaseAdminClient, getSupabasePublicClient, getSupabaseUserClient, getUserRole } from "./supabase-admin";
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

function ensureTargetRoleAllowed(currentRole: AppRole | null, targetRole: AppRole) {
  if (!currentRole) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Role pengguna tidak valid." });
  }
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

function toConsignmentItem(item: { id: string; product_id?: string | null; mitra_user_id?: string; name: string; sku?: string | null; unit: string; stock_quantity: number; minimum_stock: number; updated_at: string }) {
  return {
    id: item.id,
    productId: item.product_id ?? null,
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

async function notifyWorkspaceAdmins(distributorId: string, requestId: string, title: string, body: string) {
  const adminClient = getSupabaseAdminClient();
  const { data, error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pesan masuk Admin belum dapat dibuat." });
  const recipientIds = data.users
    .filter((user) => {
      const userRole = getUserRole(user);
      if (userRole === "distributor") {
        return user.id === distributorId;
      }
      return userRole === "admin" && user.app_metadata?.distributor_id === distributorId;
    })
    .map((user) => user.id);
  if (!recipientIds.length) return;
  const { error: notificationError } = await adminClient.from("notifications").insert(recipientIds.map((recipientUserId) => ({ recipient_user_id: recipientUserId, distributor_id: distributorId, request_id: requestId, notification_type: "request_pending", title, body })));
  if (notificationError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pesan masuk Admin belum dapat dibuat." });
}

function toSupplierRequest(request: { id: string; request_type: string; item_id?: string | null; product_id?: string | null; proposed_name?: string | null; proposed_sku?: string | null; proposed_unit?: string | null; proposed_stock_quantity?: number | null; proposed_minimum_stock?: number | null; reason: string; status: string; review_note?: string | null; reviewed_at?: string | null; created_at: string; mitra_user_id: string }) {
  return {
    id: request.id,
    requestType: request.request_type,
    itemId: request.item_id ?? null,
    productId: request.product_id ?? null,
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

function toProduct(product: { id: string; distributor_id: string; created_by_mitra_user_id?: string | null; name: string; sku?: string | null; unit: string; lifecycle_status: string; created_at: string; updated_at: string }) {
  return {
    id: product.id,
    distributorId: product.distributor_id,
    createdByMitraUserId: product.created_by_mitra_user_id ?? null,
    name: product.name,
    sku: product.sku ?? null,
    unit: product.unit,
    lifecycleStatus: product.lifecycle_status,
    createdAt: product.created_at,
    updatedAt: product.updated_at,
  } as const;
}

const productionEventSelect = "id, distributor_id, mitra_user_id, product_id, production_date, budget_period, target_quantity, actual_quantity, damaged_quantity, yield_percentage, notes, result_notes, status, created_at, completed_at";
const mitraShipmentSelect = "id, distributor_id, mitra_user_id, product_id, consignment_item_id, quantity, status, shipment_date, notes, created_at, updated_at, shipped_at, received_at, received_by, received_notes";

function toProductionEvent(event: { id: string; distributor_id: string; mitra_user_id: string; product_id: string; production_date: string; budget_period: string; target_quantity: number; actual_quantity?: number | null; damaged_quantity: number; yield_percentage?: number | null; notes: string; result_notes: string; status: string; created_at: string; completed_at?: string | null }) {
  return {
    id: event.id,
    distributorId: event.distributor_id,
    mitraUserId: event.mitra_user_id,
    productId: event.product_id,
    productionDate: event.production_date,
    budgetPeriod: event.budget_period,
    targetQuantity: event.target_quantity,
    actualQuantity: event.actual_quantity ?? null,
    damagedQuantity: event.damaged_quantity,
    yieldPercentage: event.yield_percentage ?? null,
    notes: event.notes,
    resultNotes: event.result_notes,
    status: event.status,
    createdAt: event.created_at,
    completedAt: event.completed_at ?? null,
  } as const;
}

function toMitraShipment(shipment: { id: string; distributor_id: string; mitra_user_id: string; product_id: string; consignment_item_id: string; quantity: number; status: string; shipment_date: string; notes: string; created_at: string; updated_at: string; shipped_at?: string | null; received_at?: string | null; received_by?: string | null; received_notes?: string | null }) {
  return {
    id: shipment.id,
    distributorId: shipment.distributor_id,
    mitraUserId: shipment.mitra_user_id,
    productId: shipment.product_id,
    consignmentItemId: shipment.consignment_item_id,
    quantity: shipment.quantity,
    status: shipment.status,
    shipmentDate: shipment.shipment_date,
    notes: shipment.notes,
    createdAt: shipment.created_at,
    updatedAt: shipment.updated_at,
    shippedAt: shipment.shipped_at ?? null,
    receivedAt: shipment.received_at ?? null,
    receivedBy: shipment.received_by ?? null,
    receivedNotes: shipment.received_notes ?? null,
  } as const;
}

function requireMitraProductionContext(ctx: { supabaseUser: SupabaseUser | null }) {
  if (getUserRole(ctx.supabaseUser) !== "mitra_umkm" || !ctx.supabaseUser) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Fitur produksi hanya tersedia untuk Mitra UMKM." });
  }
  const distributorId = getDistributorId(ctx.supabaseUser);
  if (!distributorId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Mitra UMKM tidak ditemukan." });
  }
  return { mitraUserId: ctx.supabaseUser.id, distributorId };
}

async function validateMitraProductionProduct(productId: string, mitraUserId: string, distributorId: string) {
  const adminClient = getSupabaseAdminClient();
  const { data: product, error: productError } = await adminClient
    .from("products")
    .select("id, distributor_id, lifecycle_status")
    .eq("id", productId)
    .eq("distributor_id", distributorId)
    .eq("lifecycle_status", "active")
    .maybeSingle();
  if (productError || !product) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Produk aktif dalam Product Master tidak ditemukan." });
  }
  const { data: assignment, error: assignmentError } = await adminClient
    .from("consignment_items")
    .select("id")
    .eq("product_id", productId)
    .eq("mitra_user_id", mitraUserId)
    .eq("distributor_id", distributorId)
    .maybeSingle();
  if (assignmentError || !assignment) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Produk tidak ditugaskan kepada Mitra ini." });
  }
}

async function validateMitraShipmentAssignment(productId: string, consignmentItemId: string, mitraUserId: string, distributorId: string) {
  const adminClient = getSupabaseAdminClient();
  const { data: product, error: productError } = await adminClient
    .from("products")
    .select("id, distributor_id, lifecycle_status")
    .eq("id", productId)
    .eq("distributor_id", distributorId)
    .eq("lifecycle_status", "active")
    .maybeSingle();
  if (productError || !product) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Produk aktif dalam Product Master tidak ditemukan." });
  }
  const { data: assignment, error: assignmentError } = await adminClient
    .from("consignment_items")
    .select("id, product_id, mitra_user_id, distributor_id")
    .eq("id", consignmentItemId)
    .maybeSingle();
  if (assignmentError || !assignment || assignment.product_id !== productId || assignment.mitra_user_id !== mitraUserId || assignment.distributor_id !== distributorId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Assignment Consignment Item tidak valid untuk Shipment ini." });
  }
}

function toManagedUser(user: { id: string; email?: string; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown>; created_at: string; last_sign_in_at?: string | null }) {
  const role = getUserRole(user as never);
  if (!role) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pengguna memiliki role yang tidak valid." });
  }
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
  platform: router({
    me: sysAdminProcedure.query(({ ctx }) => ({
      userId: ctx.supabaseUser.id,
      role: "sys_admin" as const,
    })),

    tenants: sysAdminProcedure.query(async () => {
      const { data, error } =
        await getSupabaseAdminClient().auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Daftar Distributor belum dapat dimuat.",
        });
      }

      return data.users
        .filter((user) => user.app_metadata?.role === "distributor")
        .map((user) => ({
          userId: user.id,
          email: user.email ?? "",
          name:
            typeof user.user_metadata?.name === "string"
              ? user.user_metadata.name
              : "",
          phone:
            typeof user.user_metadata?.phone === "string"
              ? user.user_metadata.phone
              : "",
          status: user.banned_until ? "disabled" : "active",
        }));
    }),
  }),
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
          if (!userRole) return false;
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
        .select("id, product_id, mitra_user_id, name, sku, unit, stock_quantity, minimum_stock, updated_at")
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
          .select("id, product_id, name, sku, unit, stock_quantity, minimum_stock, updated_at")
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
    requests: supabaseProtectedProcedure.query(async ({ ctx }) => {
      const role = callerRole(ctx);
      const distributorId = getDistributorId(ctx.supabaseUser);
      if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja supplier tidak ditemukan." });
      let query = getSupabaseAdminClient()
        .from("consignment_requests")
        .select("id, request_type, item_id, product_id, mitra_user_id, proposed_name, proposed_sku, proposed_unit, proposed_stock_quantity, proposed_minimum_stock, reason, status, review_note, reviewed_at, created_at")
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
        const { data, error } = await getSupabaseAdminClient().from("consignment_requests").insert({ distributor_id: distributorId, mitra_user_id: ctx.supabaseUser.id, request_type: "new_item", proposed_name: input.name, proposed_sku: input.sku || null, proposed_unit: input.unit, proposed_stock_quantity: input.proposedStockQuantity, proposed_minimum_stock: input.proposedMinimumStock, reason: input.reason, status: "pending" }).select("id, request_type, item_id, product_id, mitra_user_id, proposed_name, proposed_sku, proposed_unit, proposed_stock_quantity, proposed_minimum_stock, reason, status, review_note, reviewed_at, created_at").single();
        if (error || !data) throw new TRPCError({ code: "BAD_REQUEST", message: "Pengajuan barang belum dapat dikirim." });
        const mitraName = typeof ctx.supabaseUser.user_metadata?.full_name === "string" && ctx.supabaseUser.user_metadata.full_name.trim() ? ctx.supabaseUser.user_metadata.full_name.trim() : "Mitra UMKM";
        await notifyWorkspaceAdmins(distributorId, data.id, "Pengajuan barang baru", `${mitraName} mengajukan barang “${input.name}” untuk diperiksa.`);
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
        const { data, error } = await getSupabaseAdminClient().from("consignment_requests").insert({ distributor_id: distributorId, mitra_user_id: ctx.supabaseUser.id, item_id: input.itemId, request_type: "stock_change", proposed_stock_quantity: input.proposedStockQuantity, reason: input.reason, status: "pending" }).select("id, request_type, item_id, product_id, mitra_user_id, proposed_name, proposed_sku, proposed_unit, proposed_stock_quantity, proposed_minimum_stock, reason, status, review_note, reviewed_at, created_at").single();
        if (error || !data) throw new TRPCError({ code: "BAD_REQUEST", message: "Pengajuan perubahan stok belum dapat dikirim." });
        const mitraName = typeof ctx.supabaseUser.user_metadata?.full_name === "string" && ctx.supabaseUser.user_metadata.full_name.trim() ? ctx.supabaseUser.user_metadata.full_name.trim() : "Mitra UMKM";
        await notifyWorkspaceAdmins(distributorId, data.id, "Pengajuan perubahan stok", `${mitraName} mengajukan perubahan stok menjadi ${input.proposedStockQuantity}.`);
        return toSupplierRequest(data);
      }),
    review: distributorProcedure
      .input(z.object({ requestId: z.string().uuid(), decision: z.enum(["approved", "rejected"]), reviewNote: z.string().trim().max(500).optional() }))
      .mutation(async ({ ctx, input }) => {
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja supplier tidak ditemukan." });
        const reviewerId = ctx.supabaseUser?.id;
        if (!reviewerId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sesi Admin tidak ditemukan." });
        const adminClient = getSupabaseAdminClient();
        const { data: rpcData, error: rpcError } = await adminClient.rpc("review_consignment_request", {
          p_request_id: input.requestId,
          p_distributor_id: distributorId,
          p_reviewer_id: reviewerId,
          p_decision: input.decision,
          p_review_note: input.reviewNote?.trim() || null,
        });

        if (rpcError) {
          if (rpcError.code === "42501") throw new TRPCError({ code: "FORBIDDEN", message: "Anda tidak berwenang memproses pengajuan ini." });
          if (rpcError.code === "P0002") throw new TRPCError({ code: "NOT_FOUND", message: "Pengajuan tidak ditemukan." });
          if (rpcError.code === "P0001") throw new TRPCError({ code: "BAD_REQUEST", message: "Pengajuan ini sudah diproses." });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Keputusan pengajuan belum dapat diproses." });
        }

        const rpcResult = Array.isArray(rpcData) ? rpcData[0] : rpcData;
        if (!rpcResult) throw new TRPCError({ code: "NOT_FOUND", message: "Pengajuan tidak ditemukan." });

        const { data: request, error: requestError } = await adminClient
          .from("consignment_requests")
          .select("id, request_type, item_id, product_id, mitra_user_id, proposed_name, proposed_sku, proposed_unit, proposed_stock_quantity, proposed_minimum_stock, reason, status, review_note, reviewed_at, created_at")
          .eq("id", rpcResult.request_id)
          .eq("distributor_id", distributorId)
          .maybeSingle();
        if (requestError || !request) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Hasil keputusan belum dapat dimuat." });
        return toSupplierRequest(request);
      }),
  }),
  products: router({
    list: supabaseProtectedProcedure
      .input(z.object({
        lifecycleStatus: z.enum(["active", "inactive"]).optional(),
        search: z.string().trim().max(160).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const role = callerRole(ctx);
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId || !["admin", "distributor", "mitra_umkm"].includes(role ?? "")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Role ini tidak dapat melihat katalog produk." });
        }

        const adminClient = getSupabaseAdminClient();
        let query = adminClient
          .from("products")
          .select("id, distributor_id, created_by_mitra_user_id, name, sku, unit, lifecycle_status, created_at, updated_at")
          .eq("distributor_id", distributorId)
          .order("updated_at", { ascending: false });
        if (input?.lifecycleStatus) query = query.eq("lifecycle_status", input.lifecycleStatus);
        if (input?.search) query = query.or(`name.ilike.%${input.search}%,sku.ilike.%${input.search}%`);
        const { data, error } = await query;
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Katalog produk belum dapat dimuat." });

        if (role !== "mitra_umkm") return (data ?? []).map(toProduct);

        const { data: assignments, error: assignmentError } = await adminClient
          .from("consignment_items")
          .select("product_id")
          .eq("distributor_id", distributorId)
          .eq("mitra_user_id", ctx.supabaseUser.id)
          .not("product_id", "is", null);
        if (assignmentError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Relasi produk Mitra belum dapat dimuat." });
        const assignedIds = new Set((assignments ?? []).map((item) => item.product_id).filter((id): id is string => Boolean(id)));
        return (data ?? []).filter((product) => assignedIds.has(product.id)).map(toProduct);
      }),
    detail: supabaseProtectedProcedure
      .input(z.object({ productId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const role = callerRole(ctx);
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId || !["admin", "distributor", "mitra_umkm"].includes(role ?? "")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Role ini tidak dapat melihat detail produk." });
        }
        const adminClient = getSupabaseAdminClient();
        const { data: product, error } = await adminClient
          .from("products")
          .select("id, distributor_id, created_by_mitra_user_id, name, sku, unit, lifecycle_status, created_at, updated_at")
          .eq("id", input.productId)
          .eq("distributor_id", distributorId)
          .maybeSingle();
        if (error || !product) throw new TRPCError({ code: "NOT_FOUND", message: "Produk tidak ditemukan." });
        if (role === "mitra_umkm") {
          const { data: assignment } = await adminClient
            .from("consignment_items")
            .select("id")
            .eq("product_id", product.id)
            .eq("distributor_id", distributorId)
            .eq("mitra_user_id", ctx.supabaseUser.id)
            .maybeSingle();
          if (!assignment) throw new TRPCError({ code: "FORBIDDEN", message: "Produk tidak ditugaskan kepada Mitra ini." });
        }
        return toProduct(product);
      }),
    activate: distributorProcedure
      .input(z.object({ productId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
        const { data, error } = await getSupabaseAdminClient()
          .from("products")
          .update({ lifecycle_status: "active", updated_at: new Date().toISOString() })
          .eq("id", input.productId)
          .eq("distributor_id", distributorId)
          .select("id, distributor_id, created_by_mitra_user_id, name, sku, unit, lifecycle_status, created_at, updated_at")
          .maybeSingle();
        if (error || !data) throw new TRPCError({ code: "NOT_FOUND", message: "Produk tidak ditemukan." });
        return toProduct(data);
      }),
    deactivate: distributorProcedure
      .input(z.object({ productId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
        const { data, error } = await getSupabaseAdminClient()
          .from("products")
          .update({ lifecycle_status: "inactive", updated_at: new Date().toISOString() })
          .eq("id", input.productId)
          .eq("distributor_id", distributorId)
          .select("id, distributor_id, created_by_mitra_user_id, name, sku, unit, lifecycle_status, created_at, updated_at")
          .maybeSingle();
        if (error || !data) throw new TRPCError({ code: "NOT_FOUND", message: "Produk tidak ditemukan." });
        return toProduct(data);
      }),
  }),
  mitraShipments: router({
    list: supabaseProtectedProcedure.query(async ({ ctx }) => {
      const role = callerRole(ctx);
      if (!role || !["mitra_umkm", "distributor", "admin"].includes(role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Role ini tidak dapat melihat Shipment." });
      }
      const distributorId = getDistributorId(ctx.supabaseUser);
      if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
      let query = getSupabaseAdminClient()
        .from("mitra_shipments")
        .select(mitraShipmentSelect)
        .eq("distributor_id", distributorId)
        .order("shipment_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (role === "mitra_umkm") query = query.eq("mitra_user_id", ctx.supabaseUser!.id);
      const { data, error } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Shipment belum dapat dimuat." });
      return (data ?? []).map(toMitraShipment);
    }),
    create: supabaseProtectedProcedure
      .input(z.object({
        productId: z.string().uuid(),
        consignmentItemId: z.string().uuid(),
        quantity: z.number().int().positive(),
        shipmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal Shipment tidak valid."),
        notes: z.string().trim().max(500).default(""),
      }))
      .mutation(async ({ ctx, input }) => {
        const { mitraUserId, distributorId } = requireMitraProductionContext(ctx);
        await validateMitraShipmentAssignment(input.productId, input.consignmentItemId, mitraUserId, distributorId);
        const { data, error } = await getSupabaseAdminClient()
          .from("mitra_shipments")
          .insert({
            distributor_id: distributorId,
            mitra_user_id: mitraUserId,
            product_id: input.productId,
            consignment_item_id: input.consignmentItemId,
            quantity: input.quantity,
            status: "planned",
            shipment_date: input.shipmentDate,
            notes: input.notes,
          })
          .select(mitraShipmentSelect)
          .single();
        if (error || !data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Shipment belum dapat disimpan." });
        return toMitraShipment(data);
      }),
    ship: supabaseProtectedProcedure
      .input(z.object({ shipmentId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        requireMitraProductionContext(ctx);
        const accessToken = getBearerToken(ctx.req);
        if (!accessToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sesi Mitra tidak ditemukan." });
        const { data, error } = await getSupabaseUserClient(accessToken).rpc("ship_mitra_shipment", { p_shipment_id: input.shipmentId });
        if (error) {
          if (error.code === "P0002") throw new TRPCError({ code: "NOT_FOUND", message: "Shipment atau Production Stock tidak ditemukan." });
          if (error.code === "42501") throw new TRPCError({ code: "FORBIDDEN", message: "Shipment tidak berada dalam ruang kerja Mitra." });
          if (error.code === "22003") throw new TRPCError({ code: "BAD_REQUEST", message: "Production Stock tidak mencukupi." });
          throw new TRPCError({ code: "BAD_REQUEST", message: "Shipment belum dapat dikirim." });
        }
        const result = Array.isArray(data) ? data[0] : data;
        if (!result) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Hasil pengiriman belum dapat dimuat." });
        const { data: shipment, error: shipmentError } = await getSupabaseAdminClient()
          .from("mitra_shipments")
          .select(mitraShipmentSelect)
          .eq("id", input.shipmentId)
          .single();
        if (shipmentError || !shipment) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Shipment berhasil diproses tetapi belum dapat dimuat ulang." });
        return { shipment: toMitraShipment(shipment), idempotent: Boolean(result.idempotent) };
      }),
  }),
  productionEvents: router({
    list: supabaseProtectedProcedure.query(async ({ ctx }) => {
      const role = callerRole(ctx);
      if (role !== "mitra_umkm" && role !== "distributor" && role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Role ini tidak dapat melihat event produksi." });
      }
      const distributorId = getDistributorId(ctx.supabaseUser);
      if (!distributorId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
      }
      let query = getSupabaseAdminClient()
        .from("mitra_production_events")
        .select(productionEventSelect)
        .eq("distributor_id", distributorId)
        .order("production_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (role === "mitra_umkm") query = query.eq("mitra_user_id", ctx.supabaseUser!.id);
      const { data, error } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Event produksi belum dapat dimuat." });
      return (data ?? []).map(toProductionEvent);
    }),
    createPlanned: supabaseProtectedProcedure
      .input(z.object({
        productId: z.string().uuid(),
        productionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal produksi tidak valid."),
        budgetPeriod: z.enum(["Hari", "Minggu", "Bulan"]),
        targetQuantity: z.number().int().min(0),
        notes: z.string().trim().max(500).default(""),
      }))
      .mutation(async ({ ctx, input }) => {
        const { mitraUserId, distributorId } = requireMitraProductionContext(ctx);
        await validateMitraProductionProduct(input.productId, mitraUserId, distributorId);
        const { data, error } = await getSupabaseAdminClient()
          .from("mitra_production_events")
          .insert({
            distributor_id: distributorId,
            mitra_user_id: mitraUserId,
            product_id: input.productId,
            production_date: input.productionDate,
            budget_period: input.budgetPeriod,
            target_quantity: input.targetQuantity,
            notes: input.notes,
            status: "planned",
          })
          .select(productionEventSelect)
          .single();
        if (error || !data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Event produksi belum dapat disimpan." });
        return toProductionEvent(data);
      }),
    complete: supabaseProtectedProcedure
      .input(z.object({
        eventId: z.string().uuid(),
        actualQuantity: z.number().int().positive(),
        damagedQuantity: z.number().int().min(0).default(0),
        yieldPercentage: z.number().min(0).nullable().default(null),
        resultNotes: z.string().trim().max(500).default(""),
      }))
      .mutation(async ({ ctx, input }) => {
        requireMitraProductionContext(ctx);
        const accessToken = getBearerToken(ctx.req);
        if (!accessToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sesi Mitra tidak ditemukan." });
        const userClient = getSupabaseUserClient(accessToken);
        const { error: rpcError } = await userClient.rpc("complete_mitra_production_event", {
          p_production_event_id: input.eventId,
          p_actual_quantity: input.actualQuantity,
          p_damaged_quantity: input.damagedQuantity,
          p_yield_percentage: input.yieldPercentage,
          p_result_notes: input.resultNotes,
        });
        if (rpcError) {
          if (rpcError.code === "P0002") throw new TRPCError({ code: "NOT_FOUND", message: "Event produksi tidak ditemukan." });
          if (rpcError.code === "42501") throw new TRPCError({ code: "FORBIDDEN", message: "Event produksi tidak berada dalam ruang kerja Mitra." });
          throw new TRPCError({ code: "BAD_REQUEST", message: "Event produksi belum dapat diproses." });
        }
        const { data, error } = await userClient
          .from("mitra_production_events")
          .select(productionEventSelect)
          .eq("id", input.eventId)
          .single();
        if (error || !data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Event produksi berhasil diproses tetapi belum dapat dimuat ulang." });
        return toProductionEvent(data);
      }),
  }),
  productApproval: router({
    notifyDistributor: supabaseProtectedProcedure
      .input(z.object({
        requestId: z.string().uuid(),
        title: z.string().trim().min(1).max(120),
        body: z.string().trim().min(1).max(500),
      }))
      .mutation(async ({ ctx, input }) => {
        if (callerRole(ctx) !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Hanya Administrator yang dapat mengirim informasi approval." });
        }

        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Administrator tidak ditemukan." });
        }

        const adminClient = getSupabaseAdminClient();
        const { data: request, error: requestError } = await adminClient
          .from("consignment_requests")
          .select("id, distributor_id, status")
          .eq("id", input.requestId)
          .eq("distributor_id", distributorId)
          .maybeSingle();
        if (requestError || !request) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Pengajuan tidak ditemukan dalam ruang kerja Administrator." });
        }
        if (request.status !== "pending") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Informasi hanya dapat dikirim untuk pengajuan yang masih menunggu approval." });
        }

        const { data: distributor, error: distributorError } = await adminClient.auth.admin.getUserById(distributorId);
        if (distributorError || !distributor.user || getUserRole(distributor.user) !== "distributor") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Distributor dalam ruang kerja ini tidak ditemukan." });
        }

        const { data, error } = await adminClient
          .from("notifications")
          .insert({
            recipient_user_id: distributorId,
            distributor_id: distributorId,
            request_id: request.id,
            notification_type: "request_pending",
            title: input.title,
            body: input.body,
          })
          .select("id, notification_type, title, body, is_read, request_id, created_at")
          .single();
        if (error || !data) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Informasi belum dapat dikirim kepada Distributor." });
        }
        return toNotification(data);
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
