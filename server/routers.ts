import { COOKIE_NAME } from "../shared/const.js";
import { isManagedRole, ROLE_LABELS, type AppRole } from "../shared/auth";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import type { TrpcContext } from "./_core/context";
import { adminTenantProcedure as adminTenantProcedureBase, distributorProcedure, publicProcedure, router, supabaseProtectedProcedure, sysAdminProcedure, userManagementProcedure } from "./_core/trpc";
import { getBearerToken, getDistributorId, getSupabaseAdminClient, getSupabasePublicClient, getSupabaseUserClient, getUserRole } from "./supabase-admin";
import { TRPCError } from "@trpc/server";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { KTP_CONTENT_TYPES } from "../shared/user-profile";
import { getStockStatus, summarizeStock } from "../shared/consignment";
import { calculateHppSummary, type HppComponent } from "../shared/hpp";
import type { BudgetPeriod } from "../shared/budgets";
import { z } from "zod";
import type { AssignmentHistoryEntry, OutletRecord, RuteDetail, SalesRecord, WilayahDetail, WilayahRecord, DayOfWeek } from "../shared/distribution";

const roleSchema = z.enum(["distributor", "admin", "mitra_umkm", "supervisor", "sales_motoris", "hrd"]);
const emailSchema = z.string().trim().toLowerCase().email().max(320);
const fullNameSchema = z.string().trim().min(2, "Nama minimal 2 karakter").max(120);
const phoneSchema = z.string().trim().transform((value) => value.replace(/[\s()-]/g, "")).refine((value) => /^\+?\d{8,15}$/.test(value), "Nomor HP tidak valid.");
const addressSchema = z.string().trim().min(10, "Alamat minimal 10 karakter.").max(500);
const passwordSchema = z.string().min(8, "Password minimal 8 karakter").max(72);
const ktpContentTypeSchema = z.enum(KTP_CONTENT_TYPES);

type AdminTenantQueryBuilder<TSchema extends z.ZodType> = ReturnType<typeof adminTenantProcedureBase.input<TSchema>>;

function adminTenantQuery<TSchema extends z.ZodType>(schema: TSchema): AdminTenantQueryBuilder<TSchema>["query"];
function adminTenantQuery(): typeof adminTenantProcedureBase.query;
function adminTenantQuery<TSchema extends z.ZodType>(schema?: TSchema) {
  if (schema) return adminTenantProcedureBase.input(schema).query;
  return adminTenantProcedureBase.query;
}

function adminTenantMutation<TSchema extends z.ZodType>(schema: TSchema): AdminTenantQueryBuilder<TSchema>["mutation"];
function adminTenantMutation(): typeof adminTenantProcedureBase.mutation;
function adminTenantMutation<TSchema extends z.ZodType>(schema?: TSchema) {
  if (schema) return adminTenantProcedureBase.input(schema).mutation;
  return adminTenantProcedureBase.mutation;
}

const adminTenantProcedure = { query: adminTenantQuery, mutation: adminTenantMutation };

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
    .filter((user) => getUserRole(user) === "admin" && user.app_metadata?.distributor_id === distributorId)
    .map((user) => user.id);
  if (!recipientIds.length) return;
  const { error: notificationError } = await adminClient.from("notifications").insert(recipientIds.map((recipientUserId) => ({ recipient_user_id: recipientUserId, distributor_id: distributorId, request_id: requestId, notification_type: "request_pending", title, body })));
  if (notificationError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pesan masuk Admin belum dapat dibuat." });
}

function toSupplierRequest(request: { id: string; request_type: string; item_id?: string | null; product_id?: string | null; proposed_name?: string | null; proposed_sku?: string | null; proposed_unit?: string | null; proposed_stock_quantity?: number | null; proposed_minimum_stock?: number | null; proposed_category?: string | null; proposed_size?: string | null; proposed_selling_price?: string | number | null; reason: string; status: string; admin_reviewed_by?: string | null; admin_reviewed_at?: string | null; review_note?: string | null; reviewed_at?: string | null; created_at: string; mitra_user_id: string }) {
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
    proposedCategory: request.proposed_category ?? null,
    proposedSize: request.proposed_size ?? null,
    proposedSellingPrice: request.proposed_selling_price == null ? null : Number(request.proposed_selling_price),
    reason: request.reason,
    status: request.status,
    adminReviewedBy: request.admin_reviewed_by ?? null,
    adminReviewedAt: request.admin_reviewed_at ?? null,
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

const PRODUCT_SELECT = "id, distributor_id, created_by_mitra_user_id, name, sku, unit, category, size, selling_price, lifecycle_status, created_at, updated_at";

function toProduct(product: { id: string; distributor_id: string; created_by_mitra_user_id?: string | null; name: string; sku?: string | null; unit: string; lifecycle_status: string; created_at: string; updated_at: string; category?: string | null; size?: string | null; selling_price?: string | number | null }) {
  return {
    id: product.id,
    distributorId: product.distributor_id,
    createdByMitraUserId: product.created_by_mitra_user_id ?? null,
    name: product.name,
    sku: product.sku ?? null,
    unit: product.unit,
    category: product.category ?? null,
    size: product.size ?? null,
    sellingPrice: product.selling_price == null ? null : Number(product.selling_price),
    lifecycleStatus: product.lifecycle_status,
    createdAt: product.created_at,
    updatedAt: product.updated_at,
  } as const;
}

const productionEventSelect = "id, distributor_id, mitra_user_id, product_id, production_date, budget_period, target_quantity, actual_quantity, damaged_quantity, yield_percentage, notes, result_notes, status, created_at, completed_at";
const mitraShipmentSelect = "id, distributor_id, mitra_user_id, product_id, consignment_item_id, quantity, status, shipment_date, notes, created_at, updated_at, shipped_at, received_at, received_by, received_notes";
const hppSelect = "id, distributor_id, mitra_user_id, product_id, components, output_quantity, total_raw_materials, total_supporting_materials, total_labor, total_production_cost, cost_per_unit, created_at, updated_at";
const budgetSelect = "id, distributor_id, mitra_user_id, product_id, period, production_budget, production_target, created_at, updated_at";

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

function toHpp(row: { product_id: string; components: HppComponent[] | null; output_quantity: number; total_raw_materials: string | number; total_supporting_materials: string | number; total_labor: string | number; total_production_cost: string | number; cost_per_unit: string | number; updated_at: string }) {
  return {
    productId: row.product_id,
    components: Array.isArray(row.components) ? row.components : [],
    outputQuantity: row.output_quantity,
    totalRawMaterials: Number(row.total_raw_materials),
    totalSupportingMaterials: Number(row.total_supporting_materials),
    totalLabor: Number(row.total_labor),
    totalProductionCost: Number(row.total_production_cost),
    costPerUnit: Number(row.cost_per_unit),
    updatedAt: row.updated_at,
  } as const;
}

function toBudget(row: { product_id: string; period: string; production_budget: string | number; production_target: number; updated_at: string }) {
  return {
    productId: row.product_id,
    period: row.period as BudgetPeriod,
    productionBudget: Number(row.production_budget),
    productionTarget: row.production_target,
    updatedAt: row.updated_at,
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

function requireDistributorReceivingContext(ctx: { supabaseUser: SupabaseUser | null }) {
  if (getUserRole(ctx.supabaseUser) !== "distributor" || !ctx.supabaseUser) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Receiving hanya tersedia untuk Distributor." });
  }
  const distributorId = getDistributorId(ctx.supabaseUser);
  if (!distributorId || distributorId !== ctx.supabaseUser.id) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Identitas Distributor tidak valid." });
  }
  return { distributorId };
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

type DistributionUser = { id: string; nama: string; email: string | null; role: AppRole };

async function listTenantUsers(distributorId: string): Promise<DistributionUser[]> {
  const { data, error } = await getSupabaseAdminClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return [];
  return data.users
    .filter((user) => {
      const role = getUserRole(user);
      if (role !== "sales_motoris" && role !== "admin") return false;
      const userDistributorId = typeof user.app_metadata?.distributor_id === "string" ? user.app_metadata.distributor_id : null;
      return userDistributorId === distributorId;
    })
    .map((user) => {
      const role = getUserRole(user);
      const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name;
      return {
        id: user.id,
        nama: typeof metadataName === "string" && metadataName.trim() ? metadataName.trim() : user.email?.split("@")[0] ?? "Pengguna",
        email: user.email ?? null,
        role: role ?? "sales_motoris",
      };
    });
}

function countByRute(rows: { rute_id: string }[]) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.rute_id, (counts.get(row.rute_id) ?? 0) + 1);
  return counts;
}

function toWilayahRecord(
  wilayah: { id: string; kode: string; nama: string; keterangan?: string | null; is_active: boolean; created_at: string; updated_at: string },
  ruteCounts: Map<string, number>,
  outletCounts: Map<string, number>,
  salesCounts: Map<string, number>,
) {
  return {
    id: wilayah.id,
    kode: wilayah.kode,
    nama: wilayah.nama,
    keterangan: wilayah.keterangan ?? null,
    isActive: wilayah.is_active,
    createdAt: wilayah.created_at,
    updatedAt: wilayah.updated_at,
    ruteCount: ruteCounts.get(wilayah.id) ?? 0,
    outletCount: outletCounts.get(wilayah.id) ?? 0,
    salesCount: salesCounts.get(wilayah.id) ?? 0,
  } as const satisfies WilayahRecord;
}

function toRuteRecord(rute: { id: string; wilayah_id: string; kode: string; nama: string; keterangan?: string | null; is_active: boolean; created_at: string; updated_at: string }) {
  return {
    id: rute.id,
    wilayahId: rute.wilayah_id,
    kode: rute.kode,
    nama: rute.nama,
    keterangan: rute.keterangan ?? null,
    isActive: rute.is_active,
    createdAt: rute.created_at,
    updatedAt: rute.updated_at,
  } as const;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toOutletRecord(
  outlet: {
    id: string;
    distributor_id: string;
    kode: string;
    nama: string;
    nama_pemilik?: string | null;
    no_hp?: string | null;
    alamat?: string | null;
    latitude?: unknown;
    longitude?: unknown;
    foto_depan_url?: string | null;
    status?: "ACTIVE" | "INACTIVE";
    created_at?: string;
    updated_at?: string;
    desa_id?: string | null;
    desa_nama?: string | null;
    kecamatan_id?: string | null;
    kecamatan_nama?: string | null;
    kabupaten_kota_id?: string | null;
    kabupaten_kota_nama?: string | null;
    provinsi_id?: string | null;
    provinsi_nama?: string | null;
  },
  activeRuteId: string | null,
  activeRuteNama: string | null,
  visitDays: DayOfWeek[] = [],
  desaInfo?: OutletRecord["desaInfo"],
) {
  const d = desaInfo ?? {
    desaId: outlet.desa_id ?? null,
    desaNama: outlet.desa_nama ?? null,
    kecamatanId: outlet.kecamatan_id ?? null,
    kecamatanNama: outlet.kecamatan_nama ?? null,
    kabupatenKotaId: outlet.kabupaten_kota_id ?? null,
    kabupatenKotaNama: outlet.kabupaten_kota_nama ?? null,
    provinsiId: outlet.provinsi_id ?? null,
    provinsiNama: outlet.provinsi_nama ?? null,
  };
  return {
    id: outlet.id,
    kode: outlet.kode,
    nama: outlet.nama,
    namaPemilik: outlet.nama_pemilik ?? null,
    noHp: outlet.no_hp ?? null,
    alamat: outlet.alamat ?? null,
    alamatSingkat: outlet.alamat && outlet.alamat.length > 80 ? `${outlet.alamat.slice(0, 80).trimEnd()}...` : (outlet.alamat ?? ""),
    latitude: toNullableNumber(outlet.latitude),
    longitude: toNullableNumber(outlet.longitude),
    fotoDepanUrl: outlet.foto_depan_url ?? null,
    status: outlet.status ?? "ACTIVE",
    createdAt: outlet.created_at ?? "",
    updatedAt: outlet.updated_at ?? "",
    activeRuteId,
    activeRuteNama,
    visitDays,
    desaId: d.desaId,
    desaNama: d.desaNama,
    kecamatanId: d.kecamatanId,
    kecamatanNama: d.kecamatanNama,
    kabupatenKotaId: d.kabupatenKotaId,
    kabupatenKotaNama: d.kabupatenKotaNama,
    provinsiId: d.provinsiId,
    provinsiNama: d.provinsiNama,
  } as const satisfies OutletRecord;
}

function toSalesRecord(user: DistributionUser, ruteNamaById: Map<string, string>, activeRuteBySales: Map<string, string>): SalesRecord {
  const ruteId = activeRuteBySales.get(user.id) ?? null;
  return {
    id: user.id,
    nama: user.nama,
    email: user.email,
    activeRuteId: ruteId,
    activeRuteNama: ruteId ? ruteNamaById.get(ruteId) ?? null : null,
  } as const satisfies SalesRecord;
}

function rpcFailure(error: { code?: string; message?: string; hint?: string } | null): never {
  const code = error?.code;
  const message = error?.message?.replace(/^[A-Z0-9]{5}:\s*/, "") ?? error?.hint ?? "";
  if (code === "42501") throw new TRPCError({ code: "FORBIDDEN", message: "Aksi ini hanya dapat dilakukan Admin pada ruang kerja yang sama." });
  if (code === "P0002") throw new TRPCError({ code: "NOT_FOUND", message: message || "Data tidak ditemukan." });
  if (code === "23505") throw new TRPCError({ code: "CONFLICT", message: "Data tersebut sudah digunakan." });
  if (code === "22000") throw new TRPCError({ code: "BAD_REQUEST", message: message || "Operasi gagal." });
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: message || "Operasi gagal." });
}

function generateOutletKode(): string {
  return `OUT-${crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

type CreateOutletInput = {
  nama: string;
  namaPemilik?: string | null;
  noHp?: string | null;
  alamat?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  fotoDepanUrl?: string | null;
  desaId?: string | null;
};

async function createOutletForTenant(args: { actorId: string; distributorId: string; input: CreateOutletInput }): Promise<OutletRecord> {
  const outletColumns = "id, distributor_id, kode, nama, nama_pemilik, no_hp, alamat, latitude, longitude, foto_depan_url, status, created_at, updated_at, desa_id";
  let conflict = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await getSupabaseAdminClient().from("outlets").insert({
      distributor_id: args.distributorId,
      kode: generateOutletKode(),
      nama: args.input.nama,
      nama_pemilik: args.input.namaPemilik ?? null,
      no_hp: args.input.noHp ?? null,
      alamat: args.input.alamat ?? null,
      latitude: args.input.latitude ?? null,
      longitude: args.input.longitude ?? null,
      gps_radius_m: 100,
      status: "ACTIVE",
      foto_depan_url: args.input.fotoDepanUrl ?? null,
      created_by: args.actorId,
      desa_id: args.input.desaId ?? null,
    }).select(outletColumns).maybeSingle();
    if (error?.code === "23505") { conflict = true; continue; }
    if (error || !data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Outlet belum dapat dibuat." });
    return toOutletRecord(data, null, null);
  }
  if (conflict) throw new TRPCError({ code: "CONFLICT", message: "Kode Outlet sudah digunakan." });
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Outlet belum dapat dibuat." });
}

async function assignOutletToRute(distributorId: string, assignedBy: string, outletId: string, ruteId: string) {
  const { data, error } = await getSupabaseAdminClient().rpc("assign_outlet_to_rute", {
    p_outlet_id: outletId,
    p_rute_id: ruteId,
    p_distributor_id: distributorId,
    p_assigned_by: assignedBy,
  });
  if (error) rpcFailure(error);
  const row = Array.isArray(data) ? data?.[0] : data;
  if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Penugasan tidak berhasil." });
  return {
    assignmentId: row.assignment_id as string,
    action: row.action as "assign" | "reassign",
    previousRuteId: row.previous_rute_id as string | null,
    assignedAt: row.assigned_at as string,
  };
}

async function assignSalesToRute(distributorId: string, assignedBy: string, salesUserId: string, ruteId: string) {
  const { data, error } = await getSupabaseAdminClient().rpc("assign_sales_to_rute", {
    p_sales_user: salesUserId,
    p_rute_id: ruteId,
    p_distributor_id: distributorId,
    p_assigned_by: assignedBy,
  });
  if (error) rpcFailure(error);
  const row = Array.isArray(data) ? data?.[0] : data;
  if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Penugasan tidak berhasil." });
  return {
    assignmentId: row.assignment_id as string,
    action: row.action as "assign" | "reassign",
    previousRuteId: row.previous_rute_id as string | null,
    assignedAt: row.assigned_at as string,
  };
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
    geography: router({
      createProvinsi: sysAdminProcedure
        .input(z.object({
          nama: z.string().trim().min(1, "Nama provinsi wajib diisi.").max(120, "Nama provinsi maksimal 120 karakter."),
        }))
        .mutation(async ({ ctx, input }) => {
          const adminClient = getSupabaseAdminClient();
          const { data, error } = await adminClient.rpc("create_provinsi", {
            p_nama: input.nama,
            p_actor_id: ctx.supabaseUser.id,
          });
          if (error) {
            if (error.code === "42501") throw new TRPCError({ code: "FORBIDDEN", message: error.message });
            if (error.code === "22001") throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Provinsi belum dapat dibuat." });
          }
          return data;
        }),

      createKabupatenKota: sysAdminProcedure
        .input(z.object({
          provinsiId: z.string().uuid("Provinsi ID tidak valid."),
          nama: z.string().trim().min(1, "Nama Kabupaten/Kota wajib diisi.").max(120, "Nama Kabupaten/Kota maksimal 120 karakter."),
          tipe: z.enum(["KABUPATEN", "KOTA"]),
        }))
        .mutation(async ({ ctx, input }) => {
          const adminClient = getSupabaseAdminClient();
          const { data, error } = await adminClient.rpc("create_kabupaten_kota", {
            p_provinsi_id: input.provinsiId,
            p_nama: input.nama,
            p_tipe: input.tipe,
            p_actor_id: ctx.supabaseUser.id,
          });
          if (error) {
            if (error.code === "42501") throw new TRPCError({ code: "FORBIDDEN", message: error.message });
            if (error.code === "P0002") throw new TRPCError({ code: "NOT_FOUND", message: error.message });
            if (error.code === "22001") throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Kabupaten/Kota belum dapat dibuat." });
          }
          return data;
        }),

      createKecamatan: sysAdminProcedure
        .input(z.object({
          kabupatenKotaId: z.string().uuid("Kabupaten/Kota ID tidak valid."),
          nama: z.string().trim().min(1, "Nama Kecamatan wajib diisi.").max(120, "Nama Kecamatan maksimal 120 karakter."),
        }))
        .mutation(async ({ ctx, input }) => {
          const adminClient = getSupabaseAdminClient();
          const { data, error } = await adminClient.rpc("create_kecamatan", {
            p_kabupaten_kota_id: input.kabupatenKotaId,
            p_nama: input.nama,
            p_actor_id: ctx.supabaseUser.id,
          });
          if (error) {
            if (error.code === "42501") throw new TRPCError({ code: "FORBIDDEN", message: error.message });
            if (error.code === "P0002") throw new TRPCError({ code: "NOT_FOUND", message: error.message });
            if (error.code === "22001") throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Kecamatan belum dapat dibuat." });
          }
          return data;
        }),

      createDesa: sysAdminProcedure
        .input(z.object({
          kabupatenKotaId: z.string().uuid("Kabupaten/Kota ID tidak valid."),
          kecamatanId: z.string().uuid("Kecamatan ID tidak valid."),
          nama: z.string().trim().min(1, "Nama Desa/Kelurahan wajib diisi.").max(120, "Nama Desa/Kelurahan maksimal 120 karakter."),
          kodePos: z.string().trim().max(10, "Kode pos maksimal 10 karakter.").nullable().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          const adminClient = getSupabaseAdminClient();
          const { data, error } = await adminClient.rpc("create_desa", {
            p_kabupaten_kota_id: input.kabupatenKotaId,
            p_kecamatan_id: input.kecamatanId,
            p_nama: input.nama,
            p_kode_pos: input.kodePos ?? null,
            p_actor_id: ctx.supabaseUser.id,
          });
          if (error) {
            if (error.code === "42501") throw new TRPCError({ code: "FORBIDDEN", message: error.message });
            if (error.code === "P0002") throw new TRPCError({ code: "NOT_FOUND", message: error.message });
            if (error.code === "22003") throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
            if (error.code === "22001") throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Desa/Kelurahan belum dapat dibuat." });
          }
          return data;
        }),

      updateProvinsi: sysAdminProcedure
        .input(z.object({
          id: z.string().uuid("Provinsi ID tidak valid."),
          nama: z.string().trim().min(1, "Nama provinsi wajib diisi.").max(120, "Nama provinsi maksimal 120 karakter."),
        }))
        .mutation(async ({ ctx, input }) => {
          const adminClient = getSupabaseAdminClient();
          const { data, error } = await adminClient.rpc("update_provinsi", {
            p_id: input.id,
            p_nama: input.nama,
            p_actor_id: ctx.supabaseUser.id,
          });
          if (error) {
            if (error.code === "42501") throw new TRPCError({ code: "FORBIDDEN", message: error.message });
            if (error.code === "P0002") throw new TRPCError({ code: "NOT_FOUND", message: error.message });
            if (error.code === "22001") throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Provinsi belum dapat diperbarui." });
          }
          return data;
        }),

      updateKabupatenKota: sysAdminProcedure
        .input(z.object({
          id: z.string().uuid("Kabupaten/Kota ID tidak valid."),
          nama: z.string().trim().min(1, "Nama Kabupaten/Kota wajib diisi.").max(120, "Nama Kabupaten/Kota maksimal 120 karakter."),
          tipe: z.enum(["KABUPATEN", "KOTA"]),
        }))
        .mutation(async ({ ctx, input }) => {
          const adminClient = getSupabaseAdminClient();
          const { data, error } = await adminClient.rpc("update_kabupaten_kota", {
            p_id: input.id,
            p_nama: input.nama,
            p_tipe: input.tipe,
            p_actor_id: ctx.supabaseUser.id,
          });
          if (error) {
            if (error.code === "42501") throw new TRPCError({ code: "FORBIDDEN", message: error.message });
            if (error.code === "P0002") throw new TRPCError({ code: "NOT_FOUND", message: error.message });
            if (error.code === "22001") throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Kabupaten/Kota belum dapat diperbarui." });
          }
          return data;
        }),

      updateKecamatan: sysAdminProcedure
        .input(z.object({
          id: z.string().uuid("Kecamatan ID tidak valid."),
          nama: z.string().trim().min(1, "Nama Kecamatan wajib diisi.").max(120, "Nama Kecamatan maksimal 120 karakter."),
        }))
        .mutation(async ({ ctx, input }) => {
          const adminClient = getSupabaseAdminClient();
          const { data, error } = await adminClient.rpc("update_kecamatan", {
            p_id: input.id,
            p_nama: input.nama,
            p_actor_id: ctx.supabaseUser.id,
          });
          if (error) {
            if (error.code === "42501") throw new TRPCError({ code: "FORBIDDEN", message: error.message });
            if (error.code === "P0002") throw new TRPCError({ code: "NOT_FOUND", message: error.message });
            if (error.code === "22001") throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Kecamatan belum dapat diperbarui." });
          }
          return data;
        }),

      updateDesa: sysAdminProcedure
        .input(z.object({
          id: z.string().uuid("Desa/Kelurahan ID tidak valid."),
          nama: z.string().trim().min(1, "Nama Desa/Kelurahan wajib diisi.").max(120, "Nama Desa/Kelurahan maksimal 120 karakter."),
          kodePos: z.string().trim().max(10, "Kode pos maksimal 10 karakter.").nullable().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          const adminClient = getSupabaseAdminClient();
          const { data, error } = await adminClient.rpc("update_desa", {
            p_id: input.id,
            p_nama: input.nama,
            p_kode_pos: input.kodePos ?? null,
            p_actor_id: ctx.supabaseUser.id,
          });
          if (error) {
            if (error.code === "42501") throw new TRPCError({ code: "FORBIDDEN", message: error.message });
            if (error.code === "P0002") throw new TRPCError({ code: "NOT_FOUND", message: error.message });
            if (error.code === "22001") throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
            if (error.code === "22003") throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
            if (error.code === "23503") throw new TRPCError({ code: "BAD_REQUEST", message: "Desa/Kelurahan tidak dapat diperbarui karena masih memiliki referensi data lain." });
            if (error.code === "23505") throw new TRPCError({ code: "BAD_REQUEST", message: "Nama Desa/Kelurahan sudah digunakan." });
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message ?? "Desa/Kelurahan belum dapat diperbarui." });
          }
          return data;
        }),

      setProvinsiActive: sysAdminProcedure
        .input(z.object({
          id: z.string().uuid("Provinsi ID tidak valid."),
          isActive: z.boolean(),
        }))
        .mutation(async ({ ctx, input }) => {
          const adminClient = getSupabaseAdminClient();
          const { data, error } = await adminClient.rpc("set_provinsi_active", {
            p_id: input.id,
            p_is_active: input.isActive,
            p_actor_id: ctx.supabaseUser.id,
          });
          if (error) {
            if (error.code === "42501") throw new TRPCError({ code: "FORBIDDEN", message: error.message });
            if (error.code === "P0002") throw new TRPCError({ code: "NOT_FOUND", message: error.message });
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Status provinsi belum dapat diubah." });
          }
          return data;
        }),

      setKabupatenKotaActive: sysAdminProcedure
        .input(z.object({
          id: z.string().uuid("Kabupaten/Kota ID tidak valid."),
          isActive: z.boolean(),
        }))
        .mutation(async ({ ctx, input }) => {
          const adminClient = getSupabaseAdminClient();
          const { data, error } = await adminClient.rpc("set_kabupaten_kota_active", {
            p_id: input.id,
            p_is_active: input.isActive,
            p_actor_id: ctx.supabaseUser.id,
          });
          if (error) {
            if (error.code === "42501") throw new TRPCError({ code: "FORBIDDEN", message: error.message });
            if (error.code === "P0002") throw new TRPCError({ code: "NOT_FOUND", message: error.message });
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Status Kabupaten/Kota belum dapat diubah." });
          }
          return data;
        }),

      setKecamatanActive: sysAdminProcedure
        .input(z.object({
          id: z.string().uuid("Kecamatan ID tidak valid."),
          isActive: z.boolean(),
        }))
        .mutation(async ({ ctx, input }) => {
          const adminClient = getSupabaseAdminClient();
          const { data, error } = await adminClient.rpc("set_kecamatan_active", {
            p_id: input.id,
            p_is_active: input.isActive,
            p_actor_id: ctx.supabaseUser.id,
          });
          if (error) {
            if (error.code === "42501") throw new TRPCError({ code: "FORBIDDEN", message: error.message });
            if (error.code === "P0002") throw new TRPCError({ code: "NOT_FOUND", message: error.message });
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Status Kecamatan belum dapat diubah." });
          }
          return data;
        }),

      setDesaActive: sysAdminProcedure
        .input(z.object({
          id: z.string().uuid("Desa/Kelurahan ID tidak valid."),
          isActive: z.boolean(),
        }))
        .mutation(async ({ ctx, input }) => {
          const adminClient = getSupabaseAdminClient();
          const { data, error } = await adminClient.rpc("set_desa_active", {
            p_id: input.id,
            p_is_active: input.isActive,
            p_actor_id: ctx.supabaseUser.id,
          });
          if (error) {
            if (error.code === "42501") throw new TRPCError({ code: "FORBIDDEN", message: error.message });
            if (error.code === "P0002") throw new TRPCError({ code: "NOT_FOUND", message: error.message });
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Status Desa/Kelurahan belum dapat diubah." });
          }
          return data;
        }),

      deleteProvinsi: sysAdminProcedure
        .input(z.object({
          id: z.string().uuid("Provinsi ID tidak valid."),
        }))
        .mutation(async ({ ctx, input }) => {
          const adminClient = getSupabaseAdminClient();
          const { error } = await adminClient.rpc("delete_provinsi", {
            p_id: input.id,
            p_actor_id: ctx.supabaseUser.id,
          });
          if (error) {
            if (error.code === "42501") throw new TRPCError({ code: "FORBIDDEN", message: error.message });
            if (error.code === "P0002") throw new TRPCError({ code: "NOT_FOUND", message: error.message });
            if (error.code === "22003") throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Provinsi belum dapat dihapus." });
          }
          return { success: true };
        }),

      deleteKabupatenKota: sysAdminProcedure
        .input(z.object({
          id: z.string().uuid("Kabupaten/Kota ID tidak valid."),
        }))
        .mutation(async ({ ctx, input }) => {
          const adminClient = getSupabaseAdminClient();
          const { error } = await adminClient.rpc("delete_kabupaten_kota", {
            p_id: input.id,
            p_actor_id: ctx.supabaseUser.id,
          });
          if (error) {
            if (error.code === "42501") throw new TRPCError({ code: "FORBIDDEN", message: error.message });
            if (error.code === "P0002") throw new TRPCError({ code: "NOT_FOUND", message: error.message });
            if (error.code === "22003") throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Kabupaten/Kota belum dapat dihapus." });
          }
          return { success: true };
        }),

      deleteKecamatan: sysAdminProcedure
        .input(z.object({
          id: z.string().uuid("Kecamatan ID tidak valid."),
        }))
        .mutation(async ({ ctx, input }) => {
          const adminClient = getSupabaseAdminClient();
          const { error } = await adminClient.rpc("delete_kecamatan", {
            p_id: input.id,
            p_actor_id: ctx.supabaseUser.id,
          });
          if (error) {
            if (error.code === "42501") throw new TRPCError({ code: "FORBIDDEN", message: error.message });
            if (error.code === "P0002") throw new TRPCError({ code: "NOT_FOUND", message: error.message });
            if (error.code === "22003") throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Kecamatan belum dapat dihapus." });
          }
          return { success: true };
        }),

      deleteDesa: sysAdminProcedure
        .input(z.object({
          id: z.string().uuid("Desa/Kelurahan ID tidak valid."),
        }))
        .mutation(async ({ ctx, input }) => {
          const adminClient = getSupabaseAdminClient();
          const { error } = await adminClient.rpc("delete_desa", {
            p_id: input.id,
            p_actor_id: ctx.supabaseUser.id,
          });
          if (error) {
            if (error.code === "42501") throw new TRPCError({ code: "FORBIDDEN", message: error.message });
            if (error.code === "P0002") throw new TRPCError({ code: "NOT_FOUND", message: error.message });
            if (error.code === "22003") throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
            // Handle additional PostgreSQL error codes
            if (error.code === "23503") throw new TRPCError({ code: "BAD_REQUEST", message: "Desa/Kelurahan tidak dapat dihapus karena masih memiliki referensi data lain." });
            if (error.code === "23505") throw new TRPCError({ code: "BAD_REQUEST", message: "Kode Desa/Kelurahan sudah digunakan." });
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message ?? "Desa/Kelurahan belum dapat dihapus." });
          }
          return { success: true };
        }),
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
        const ktpStoragePath = profile?.ktp_storage_path ?? null;

        if (getUserRole(target) === "mitra_umkm") {
          const { count, error: historyError } = await adminClient
            .from("stock_movements")
            .select("id", { count: "exact", head: true })
            .eq("mitra_user_id", input.userId);
          if (historyError) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Riwayat stok/transaksi belum dapat diperiksa." });
          }
          if ((count ?? 0) > 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Akun memiliki riwayat stok/transaksi. Nonaktifkan akun saja." });
          }
        }

        const { error } = await adminClient.auth.admin.deleteUser(input.userId);
        if (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Akun belum dapat dihapus." });
        }

        if (ktpStoragePath) {
          await adminClient.storage.from("user-ktp").remove([ktpStoragePath]);
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
        const adminClient = getSupabaseAdminClient();
        const { count: movementCount, error: movementError } = await adminClient
          .from("stock_movements")
          .select("id", { count: "exact", head: true })
          .eq("item_id", input.itemId)
          .eq("distributor_id", distributorId);
        if (movementError) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Riwayat stok barang belum dapat diperiksa." });
        }
        const { count: requestCount, error: requestError } = await adminClient
          .from("consignment_requests")
          .select("id", { count: "exact", head: true })
          .eq("item_id", input.itemId)
          .eq("distributor_id", distributorId);
        if (requestError) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pengajuan barang belum dapat diperiksa." });
        }
        if ((movementCount ?? 0) > 0 || (requestCount ?? 0) > 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Barang memiliki riwayat stok atau pengajuan. Barang tidak dapat dihapus." });
        }
        const { error, count } = await adminClient.from("consignment_items").delete({ count: "exact" }).eq("id", input.itemId).eq("distributor_id", distributorId);
        if (error) {
          if (error.code === "23503") {
            throw new TRPCError({ code: "CONFLICT", message: "Barang sedang dirujuk shipment atau data terkait. Barang tidak dapat dihapus." });
          }
          throw new TRPCError({ code: "BAD_REQUEST", message: "Barang belum dapat dihapus." });
        }
        if (count !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "Barang titipan tidak ditemukan." });
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
      if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja tidak ditemukan." });
      let query = getSupabaseAdminClient()
        .from("consignment_requests")
        .select("id, request_type, item_id, product_id, mitra_user_id, proposed_name, proposed_sku, proposed_unit, proposed_stock_quantity, proposed_minimum_stock, proposed_category, proposed_size, proposed_selling_price, reason, status, admin_reviewed_by, admin_reviewed_at, review_note, reviewed_at, created_at")
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
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja mitra tidak ditemukan." });
        const { data, error } = await getSupabaseAdminClient().from("consignment_requests").insert({ distributor_id: distributorId, mitra_user_id: ctx.supabaseUser.id, request_type: "new_item", proposed_name: input.name, proposed_sku: input.sku || null, proposed_unit: input.unit, proposed_stock_quantity: input.proposedStockQuantity, proposed_minimum_stock: input.proposedMinimumStock, reason: input.reason, status: "pending" }).select("id, request_type, item_id, product_id, mitra_user_id, proposed_name, proposed_sku, proposed_unit, proposed_stock_quantity, proposed_minimum_stock, proposed_category, proposed_size, proposed_selling_price, reason, status, admin_reviewed_by, admin_reviewed_at, review_note, reviewed_at, created_at").single();
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
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja mitra tidak ditemukan." });
        const { data: item } = await getSupabaseAdminClient().from("consignment_items").select("id").eq("id", input.itemId).eq("mitra_user_id", ctx.supabaseUser.id).eq("distributor_id", distributorId).maybeSingle();
        if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Barang supplier tidak ditemukan." });
        const { data, error } = await getSupabaseAdminClient().from("consignment_requests").insert({ distributor_id: distributorId, mitra_user_id: ctx.supabaseUser.id, item_id: input.itemId, request_type: "stock_change", proposed_stock_quantity: input.proposedStockQuantity, reason: input.reason, status: "pending" }).select("id, request_type, item_id, product_id, mitra_user_id, proposed_name, proposed_sku, proposed_unit, proposed_stock_quantity, proposed_minimum_stock, proposed_category, proposed_size, proposed_selling_price, reason, status, admin_reviewed_by, admin_reviewed_at, review_note, reviewed_at, created_at").single();
        if (error || !data) throw new TRPCError({ code: "BAD_REQUEST", message: "Pengajuan perubahan stok belum dapat dikirim." });
        const mitraName = typeof ctx.supabaseUser.user_metadata?.full_name === "string" && ctx.supabaseUser.user_metadata.full_name.trim() ? ctx.supabaseUser.user_metadata.full_name.trim() : "Mitra UMKM";
        await notifyWorkspaceAdmins(distributorId, data.id, "Pengajuan perubahan stok", `${mitraName} mengajukan perubahan stok menjadi ${input.proposedStockQuantity}.`);
        return toSupplierRequest(data);
      }),
    adminReview: supabaseProtectedProcedure
      .input(z.object({ requestId: z.string().uuid(), action: z.enum(["approve", "reject", "forward"]), reviewNote: z.string().trim().max(500).optional() }))
      .mutation(async ({ ctx, input }) => {
        if (callerRole(ctx) !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Hanya Administrator yang dapat memproses review pengajuan." });
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Administrator tidak ditemukan." });
        const adminId = ctx.supabaseUser?.id;
        if (!adminId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sesi Administrator tidak ditemukan." });
        const adminClient = getSupabaseAdminClient();
        const effectiveAction = input.action === "forward" ? "approve" : input.action;
        const { data: dbRow } = await adminClient
          .from("consignment_requests")
          .select("id, status, distributor_id")
          .eq("id", input.requestId)
          .eq("distributor_id", distributorId)
          .maybeSingle();
        console.log("[adminReview:db-read]", JSON.stringify({ requestId: input.requestId, dbStatus: dbRow?.status ?? null, dbDistributorId: dbRow?.distributor_id ?? null }));
        console.log("[adminReview:before-rpc]", JSON.stringify({ requestId: input.requestId, distributorId, adminId, action: effectiveAction }));
        const { error: rpcError } = await adminClient.rpc("admin_review_consignment_request", {
          p_request_id: input.requestId,
          p_distributor_id: distributorId,
          p_admin_id: adminId,
          p_action: effectiveAction,
          p_note: input.reviewNote?.trim() || null,
        });
        console.log("[adminReview:rpc-result]", JSON.stringify({ requestId: input.requestId, rpcErrorCode: rpcError?.code ?? null, rpcSucceeded: !rpcError }));

        if (rpcError) {
          if (rpcError.code === "42501") throw new TRPCError({ code: "FORBIDDEN", message: "Anda tidak berwenang memproses pengajuan ini." });
          if (rpcError.code === "P0002") throw new TRPCError({ code: "NOT_FOUND", message: "Pengajuan tidak ditemukan." });
          if (rpcError.code === "P0001") throw new TRPCError({ code: "BAD_REQUEST", message: "Pengajuan ini sudah diproses." });
          if (rpcError.code === "22023") throw new TRPCError({ code: "BAD_REQUEST", message: "Aksi review tidak valid." });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Keputusan pengajuan belum dapat diproses." });
        }

        const { data: request, error: requestError } = await adminClient
          .from("consignment_requests")
          .select("id, request_type, item_id, product_id, mitra_user_id, proposed_name, proposed_sku, proposed_unit, proposed_stock_quantity, proposed_minimum_stock, proposed_category, proposed_size, proposed_selling_price, reason, status, admin_reviewed_by, admin_reviewed_at, review_note, reviewed_at, created_at")
          .eq("id", input.requestId)
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
          .select(PRODUCT_SELECT)
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
          .select(PRODUCT_SELECT)
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
          .select(PRODUCT_SELECT)
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
          .select(PRODUCT_SELECT)
          .maybeSingle();
        if (error || !data) throw new TRPCError({ code: "NOT_FOUND", message: "Produk tidak ditemukan." });
        return toProduct(data);
      }),
    update: distributorProcedure
      .input(z.object({
        productId: z.string().uuid("ID produk tidak valid."),
        category: z.string().trim().min(1, "Kategori minimal 1 karakter.").max(80, "Kategori maksimal 80 karakter.").nullable().optional(),
        size: z.string().trim().min(1, "Ukuran minimal 1 karakter.").max(40, "Ukuran maksimal 40 karakter.").nullable().optional(),
        sellingPrice: z.number().finite("Harga jual tidak valid.").min(0, "Harga jual tidak boleh negatif.").max(9999999999999.99, "Harga jual melebihi batas maksimal.").nullable().optional(),
      }).strict())
      .mutation(async ({ ctx, input }) => {
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
        if (input.category === undefined && input.size === undefined && input.sellingPrice === undefined) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Tidak ada metadata produk yang diberikan." });
        }
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (input.category !== undefined) patch.category = input.category;
        if (input.size !== undefined) patch.size = input.size;
        if (input.sellingPrice !== undefined) patch.selling_price = input.sellingPrice;
        const { data, error } = await getSupabaseAdminClient()
          .from("products")
          .update(patch)
          .eq("id", input.productId)
          .eq("distributor_id", distributorId)
          .select(PRODUCT_SELECT)
          .maybeSingle();
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Metadata produk belum dapat diperbarui." });
        if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Produk tidak ditemukan." });
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
  distributorReceiving: router({
    receive: supabaseProtectedProcedure
      .input(z.object({ shipmentId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        requireDistributorReceivingContext(ctx);
        const accessToken = getBearerToken(ctx.req);
        if (!accessToken) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sesi Distributor tidak ditemukan." });
        const { data, error } = await getSupabaseUserClient(accessToken).rpc("receive_mitra_shipment", { p_shipment_id: input.shipmentId });
        if (error) {
          if (error.code === "P0002") throw new TRPCError({ code: "NOT_FOUND", message: "Shipment tidak ditemukan pada workspace Distributor." });
          if (error.code === "42501") throw new TRPCError({ code: "FORBIDDEN", message: "Distributor tidak berwenang menerima Shipment ini." });
          if (error.code === "55000") throw new TRPCError({ code: "CONFLICT", message: "Shipment belum berada pada status shipped atau movement receiving tidak konsisten." });
          if (error.code === "23514") throw new TRPCError({ code: "BAD_REQUEST", message: "Product Master atau assignment Consignment Item tidak valid." });
          throw new TRPCError({ code: "BAD_REQUEST", message: "Shipment belum dapat diterima." });
        }
        const result = Array.isArray(data) ? data[0] : data;
        if (!result) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Hasil receiving belum dapat dimuat." });
        return {
          shipmentId: result.shipment_id,
          status: result.shipment_status,
          quantity: result.shipment_quantity,
          distributorStockQuantity: result.distributor_stock_quantity,
          movementId: result.movement_id,
          idempotent: Boolean(result.idempotent),
        } as const;
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
  hpp: router({
    list: supabaseProtectedProcedure.query(async ({ ctx }) => {
      const role = callerRole(ctx);
      if (role !== "mitra_umkm" && role !== "distributor" && role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Role ini tidak dapat melihat HPP produksi." });
      }

      const distributorId = getDistributorId(ctx.supabaseUser);
      if (!distributorId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja HPP produksi tidak ditemukan." });
      }

      let query = getSupabaseAdminClient()
        .from("mitra_production_hpp")
        .select(hppSelect)
        .eq("distributor_id", distributorId)
        .order("updated_at", { ascending: false });
      if (role === "mitra_umkm") query = query.eq("mitra_user_id", ctx.supabaseUser!.id);

      const { data, error } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "HPP produksi belum dapat dimuat." });

      return (data ?? []).map(toHpp);
    }),
    upsert: supabaseProtectedProcedure
      .input(z.object({
        productId: z.string().uuid(),
        components: z.array(z.object({
          id: z.string().trim().min(1, "ID komponen tidak valid.").max(80),
          type: z.enum(["Bahan Baku", "Bahan Penunjang", "Tenaga Produksi"]),
          name: z.string().trim().min(1, "Nama komponen tidak boleh kosong.").max(80),
          cost: z.number().finite().min(0).max(9999999999999.99),
        })).max(50, "Jumlah komponen HPP terlalu banyak."),
        outputQuantity: z.number().int().min(1, "Jumlah hasil produksi harus lebih besar dari 0.").max(1000000000),
      }).strict())
      .mutation(async ({ ctx, input }) => {
        const { mitraUserId, distributorId } = requireMitraProductionContext(ctx);
        await validateMitraProductionProduct(input.productId, mitraUserId, distributorId);
        const components: HppComponent[] = input.components.map((component) => ({
          id: component.id,
          type: component.type,
          name: component.name,
          cost: component.cost,
        }));
        const summary = calculateHppSummary(components, input.outputQuantity);
        const { data, error } = await getSupabaseAdminClient()
          .from("mitra_production_hpp")
          .upsert({
            distributor_id: distributorId,
            mitra_user_id: mitraUserId,
            product_id: input.productId,
            components,
            output_quantity: input.outputQuantity,
            total_raw_materials: summary.totalRawMaterials,
            total_supporting_materials: summary.totalSupportingMaterials,
            total_labor: summary.totalLabor,
            total_production_cost: summary.totalProductionCost,
            cost_per_unit: summary.costPerUnit,
            updated_at: new Date().toISOString(),
          }, { onConflict: "distributor_id,mitra_user_id,product_id" })
          .select(hppSelect)
          .single();
        if (error || !data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "HPP produksi belum dapat disimpan." });
        return toHpp(data);
      }),
  }),
  budgets: router({
    list: supabaseProtectedProcedure.query(async ({ ctx }) => {
      const role = callerRole(ctx);
      if (role !== "mitra_umkm" && role !== "distributor" && role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Role ini tidak dapat melihat anggaran produksi." });
      }

      const distributorId = getDistributorId(ctx.supabaseUser);
      if (!distributorId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja anggaran produksi tidak ditemukan." });
      }

      let query = getSupabaseAdminClient()
        .from("mitra_production_budgets")
        .select(budgetSelect)
        .eq("distributor_id", distributorId)
        .order("updated_at", { ascending: false });
      if (role === "mitra_umkm") query = query.eq("mitra_user_id", ctx.supabaseUser!.id);

      const { data, error } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Anggaran produksi belum dapat dimuat." });

      return (data ?? []).map(toBudget);
    }),
    upsert: supabaseProtectedProcedure
      .input(z.object({
        productId: z.string().uuid(),
        period: z.enum(["Hari", "Minggu", "Bulan"]),
        productionBudget: z.number().finite().min(0).max(9999999999999.99),
        productionTarget: z.number().int().min(1, "Target produksi harus lebih besar dari 0.").max(1000000000),
      }).strict())
      .mutation(async ({ ctx, input }) => {
        const { mitraUserId, distributorId } = requireMitraProductionContext(ctx);
        await validateMitraProductionProduct(input.productId, mitraUserId, distributorId);
        const { data, error } = await getSupabaseAdminClient()
          .from("mitra_production_budgets")
          .upsert({
            distributor_id: distributorId,
            mitra_user_id: mitraUserId,
            product_id: input.productId,
            period: input.period,
            production_budget: input.productionBudget,
            production_target: input.productionTarget,
            updated_at: new Date().toISOString(),
          }, { onConflict: "distributor_id,mitra_user_id,product_id,period" })
          .select(budgetSelect)
          .single();
        if (error || !data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Anggaran produksi belum dapat disimpan." });
        return toBudget(data);
      }),
  }),
  distribution: router({
    listProvinsi: publicProcedure
      .input(z.object({ filter: z.enum(["active", "inactive", "all"]).optional() }).optional())
      .query(async ({ input }) => {
        const adminClient = getSupabaseAdminClient();
        let query = adminClient.from("provinsi").select("id, nama, is_active").order("nama", { ascending: true });
        const filter = input?.filter ?? "active";
        if (filter === "active") query = query.eq("is_active", true);
        else if (filter === "inactive") query = query.eq("is_active", false);
        const { data, error } = await query;
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Daftar provinsi belum dapat dimuat." });
        return (data ?? []).map((p) => ({ id: p.id, nama: p.nama, isActive: p.is_active }));
      }),
    listKabupatenKota: publicProcedure
      .input(z.object({ provinsiId: z.string().uuid().nullable().optional(), filter: z.enum(["active", "inactive", "all"]).optional() }).optional())
      .query(async ({ input }) => {
        const adminClient = getSupabaseAdminClient();
        let query = adminClient.from("kabupaten_kota").select("id, provinsi_id, nama, is_active").order("nama", { ascending: true });
        if (input?.provinsiId) query = query.eq("provinsi_id", input.provinsiId);
        const filter = input?.filter ?? "active";
        if (filter === "active") query = query.eq("is_active", true);
        else if (filter === "inactive") query = query.eq("is_active", false);
        const { data, error } = await query;
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Daftar kabupaten/kota belum dapat dimuat." });
        return (data ?? []).map((k) => ({ id: k.id, provinsiId: k.provinsi_id, nama: k.nama, isActive: k.is_active }));
      }),
    listKecamatan: publicProcedure
      .input(z.object({ kabupatenKotaId: z.string().uuid(), filter: z.enum(["active", "inactive", "all"]).optional() }))
      .query(async ({ input }) => {
        const adminClient = getSupabaseAdminClient();
        let query = adminClient
          .from("kecamatan")
          .select("id, kabupaten_kota_id, kode_bps, nama, is_active")
          .eq("kabupaten_kota_id", input.kabupatenKotaId)
          .order("nama", { ascending: true });
        const filter = input?.filter ?? "active";
        if (filter === "active") query = query.eq("is_active", true);
        else if (filter === "inactive") query = query.eq("is_active", false);
        const { data, error } = await query;
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Daftar kecamatan belum dapat dimuat." });
        return (data ?? []).map((k) => ({
          id: k.id,
          kabupatenKotaId: k.kabupaten_kota_id,
          kodeBps: k.kode_bps,
          nama: k.nama,
          isActive: k.is_active,
        }));
      }),
    listDesa: publicProcedure
      .input(z.object({ kecamatanId: z.string().uuid(), filter: z.enum(["active", "inactive", "all"]).optional() }))
      .query(async ({ input }) => {
        const adminClient = getSupabaseAdminClient();
        let query = adminClient
          .from("desa")
          .select("id, kecamatan_id, kabupaten_kota_id, nama, is_active")
          .eq("kecamatan_id", input.kecamatanId)
          .order("nama", { ascending: true });
        const filter = input?.filter ?? "active";
        if (filter === "active") query = query.eq("is_active", true);
        else if (filter === "inactive") query = query.eq("is_active", false);
        const { data, error } = await query;
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Daftar desa/kelurahan belum dapat dimuat." });
        return (data ?? []).map((d) => ({
          id: d.id,
          kecamatanId: d.kecamatan_id,
          kabupatenKotaId: d.kabupaten_kota_id,
          nama: d.nama,
          isActive: d.is_active,
        }));
      }),
    listWilayah: adminTenantProcedure.query()(async ({ ctx }) => {
      const distributorId = getDistributorId(ctx.supabaseUser);
      if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
      const adminClient = getSupabaseAdminClient();
      const [wilayahResult, ruteResult] = await Promise.all([
        adminClient.from("wilayah").select("id, kode, nama, keterangan, is_active, created_at, updated_at").eq("distributor_id", distributorId).order("created_at", { ascending: true }),
        adminClient.from("rute").select("id, wilayah_id").eq("distributor_id", distributorId),
      ]);
      if (wilayahResult.error || ruteResult.error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Daftar wilayah belum dapat dimuat." });

      const ruteToWilayah = new Map<string, string>();
      for (const rute of ruteResult.data ?? []) ruteToWilayah.set(rute.id, rute.wilayah_id);

      const ruteCounts = new Map<string, number>();
      for (const rute of ruteResult.data ?? []) ruteCounts.set(rute.wilayah_id, (ruteCounts.get(rute.wilayah_id) ?? 0) + 1);

      let outletCounts = new Map<string, number>();
      let salesCounts = new Map<string, number>();
      const ruteIds = [...ruteToWilayah.keys()];
      if (ruteIds.length > 0) {
        const [outletResult, salesResult] = await Promise.all([
          adminClient.from("rute_outlet_assignments").select("rute_id").eq("distributor_id", distributorId).in("rute_id", ruteIds).is("ended_at", null),
          adminClient.from("rute_sales_assignments").select("rute_id").eq("distributor_id", distributorId).in("rute_id", ruteIds).is("ended_at", null),
        ]);
        outletCounts = countByRute(outletResult.data ?? []);
        salesCounts = countByRute(salesResult.data ?? []);
        outletCounts = new Map([...outletCounts].map(([ruteId, count]) => [ruteToWilayah.get(ruteId) ?? ruteId, count]));
        salesCounts = new Map([...salesCounts].map(([ruteId, count]) => [ruteToWilayah.get(ruteId) ?? ruteId, count]));
      }

      return (wilayahResult.data ?? []).map((wilayah) => toWilayahRecord(wilayah, ruteCounts, outletCounts, salesCounts));
    }),
    getWilayah: adminTenantProcedure.query(
      z.object({ wilayahId: z.string().uuid() }),
    )(async ({ ctx, input }) => {
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
        const adminClient = getSupabaseAdminClient();
        const { data: wilayah, error: wilayahError } = await adminClient.from("wilayah").select("id, kode, nama, keterangan, is_active, created_at, updated_at").eq("id", input.wilayahId).eq("distributor_id", distributorId).maybeSingle();
        if (wilayahError || !wilayah) throw new TRPCError({ code: "NOT_FOUND", message: "Wilayah tidak ditemukan." });

        const { data: rutes, error: ruteError } = await adminClient.from("rute").select("id, wilayah_id, kode, nama, keterangan, is_active, created_at, updated_at").eq("distributor_id", distributorId).eq("wilayah_id", input.wilayahId).order("created_at", { ascending: true });
        if (ruteError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Daftar rute belum dapat dimuat." });

        const ruteIds = (rutes ?? []).map((rute) => rute.id);
        const ruteNamaById = new Map((rutes ?? []).map((rute) => [rute.id, rute.nama]));
        const assignments = ruteIds.length > 0
          ? await Promise.all([
              adminClient.from("rute_outlet_assignments").select("rute_id, outlet_id, assigned_at").eq("distributor_id", distributorId).in("rute_id", ruteIds).is("ended_at", null),
              adminClient.from("rute_sales_assignments").select("rute_id, sales_id, assigned_at").eq("distributor_id", distributorId).in("rute_id", ruteIds).is("ended_at", null),
            ])
          : null;
        const outletAssigns = assignments?.[0]?.data ?? [];
        const salesAssigns = assignments?.[1]?.data ?? [];

        const outletByRute = new Map<string, OutletRecord[]>();
        const outletIds = [...new Set(outletAssigns.map((a) => a.outlet_id))];
        if (outletIds.length > 0) {
          const { data: outletRows } = await adminClient.from("outlets").select("id, distributor_id, kode, nama, alamat, latitude, longitude, foto_depan_url, status, created_at, updated_at, desa_id").eq("distributor_id", distributorId).in("id", outletIds);
          const outletById = new Map((outletRows ?? []).map((outlet) => [outlet.id, outlet]));
          for (const a of outletAssigns) {
            const outlet = outletById.get(a.outlet_id);
            if (!outlet) continue;
            const list = outletByRute.get(a.rute_id) ?? [];
            list.push(toOutletRecord(outlet, a.rute_id, ruteNamaById.get(a.rute_id) ?? null, [], undefined));
            outletByRute.set(a.rute_id, list);
          }
        }

        const salesByRute = new Map<string, SalesRecord[]>();
        const salesIds = [...new Set(salesAssigns.map((a) => a.sales_id))];
        if (salesIds.length > 0) {
          const tenantUsers = await listTenantUsers(distributorId);
          const salesById = new Map(tenantUsers.filter((user) => user.role === "sales_motoris").map((user) => [user.id, user]));
          const activeRuteBySales = new Map(salesAssigns.map((a) => [a.sales_id, a.rute_id]));
          for (const salesUserId of salesIds) {
            const user = salesById.get(salesUserId);
            if (!user) continue;
            const list = salesByRute.get(activeRuteBySales.get(salesUserId) ?? "") ?? [];
            list.push(toSalesRecord(user, ruteNamaById, new Map([[salesUserId, activeRuteBySales.get(salesUserId) ?? ""]])));
            salesByRute.set(activeRuteBySales.get(salesUserId) ?? "", list);
          }
        }

        return {
          wilayah: {
            id: wilayah.id,
            kode: wilayah.kode,
            nama: wilayah.nama,
            keterangan: wilayah.keterangan ?? null,
            isActive: wilayah.is_active,
            createdAt: wilayah.created_at,
            updatedAt: wilayah.updated_at,
          },
          rutes: (rutes ?? []).map((rute) => {
            const outlets = outletByRute.get(rute.id) ?? [];
            const sales = salesByRute.get(rute.id) ?? [];
            return {
              ...toRuteRecord(rute),
              outlets,
              sales,
              outletCount: outlets.length,
              salesCount: sales.length,
            };
          }),
        } satisfies WilayahDetail;
      }),
    createWilayah: adminTenantProcedure.mutation(
      z.object({
        kode: z.string().trim().min(1, "Kode minimal 1 karakter.").max(40, "Kode maksimal 40 karakter."),
        nama: z.string().trim().min(2, "Nama minimal 2 karakter.").max(120, "Nama maksimal 120 karakter."),
        keterangan: z.string().trim().max(500, "Keterangan maksimal 500 karakter.").nullable().optional(),
      }),
    )(async ({ ctx, input }) => {
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
        const { data, error } = await getSupabaseAdminClient().from("wilayah").insert({
          distributor_id: distributorId,
          kode: input.kode,
          nama: input.nama,
          keterangan: input.keterangan ?? null,
          created_by: ctx.supabaseUser!.id,
        }).select("id, kode, nama, keterangan, is_active, created_at, updated_at").maybeSingle();
        if (error?.code === "23505") throw new TRPCError({ code: "CONFLICT", message: "Kode Wilayah sudah digunakan." });
        if (error || !data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Wilayah belum dapat dibuat." });
        return toWilayahRecord(data, new Map(), new Map(), new Map());
      }),
    updateWilayah: adminTenantProcedure.mutation(
      z.object({
        wilayahId: z.string().uuid(),
        kode: z.string().trim().min(1, "Kode minimal 1 karakter.").max(40, "Kode maksimal 40 karakter.").optional(),
        nama: z.string().trim().min(2, "Nama minimal 2 karakter.").max(120, "Nama maksimal 120 karakter.").optional(),
        keterangan: z.string().trim().max(500, "Keterangan maksimal 500 karakter.").nullable().optional(),
      }),
    )(async ({ ctx, input }) => {
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
        if (input.kode === undefined && input.nama === undefined && input.keterangan === undefined) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Tidak ada data yang diubah." });
        }
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (input.kode !== undefined) patch.kode = input.kode;
        if (input.nama !== undefined) patch.nama = input.nama;
        if (input.keterangan !== undefined) patch.keterangan = input.keterangan;
        const { data, error } = await getSupabaseAdminClient().from("wilayah").update(patch).eq("id", input.wilayahId).eq("distributor_id", distributorId).select("id, kode, nama, keterangan, is_active, created_at, updated_at").maybeSingle();
        if (error?.code === "23505") throw new TRPCError({ code: "CONFLICT", message: "Kode Wilayah sudah digunakan." });
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Wilayah belum dapat diperbarui." });
        if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Wilayah tidak ditemukan." });
        return toWilayahRecord(data, new Map(), new Map(), new Map());
      }),
    setWilayahActive: adminTenantProcedure.mutation(
      z.object({ wilayahId: z.string().uuid(), isActive: z.boolean() }),
    )(async ({ ctx, input }) => {
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
        const { data, error } = await getSupabaseAdminClient().from("wilayah").update({ is_active: input.isActive, updated_at: new Date().toISOString() }).eq("id", input.wilayahId).eq("distributor_id", distributorId).select("id, kode, nama, keterangan, is_active, created_at, updated_at").maybeSingle();
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Status Wilayah belum dapat diperbarui." });
        if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Wilayah tidak ditemukan." });
        return toWilayahRecord(data, new Map(), new Map(), new Map());
      }),
    listRute: adminTenantProcedure.query(
      z.object({ wilayahId: z.string().uuid().optional() }).optional(),
    )(async ({ ctx, input }) => {
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
        const adminClient = getSupabaseAdminClient();
        let query = adminClient.from("rute").select("id, wilayah_id, kode, nama, keterangan, is_active, created_at, updated_at").eq("distributor_id", distributorId).order("created_at", { ascending: true });
        if (input?.wilayahId) query = query.eq("wilayah_id", input.wilayahId);
        const { data, error } = await query;
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Daftar rute belum dapat dimuat." });

        const ruteIds = (data ?? []).map((rute) => rute.id);
        let outletCounts = new Map<string, number>();
        let salesCounts = new Map<string, number>();
        if (ruteIds.length > 0) {
          const [outletResult, salesResult] = await Promise.all([
            adminClient.from("rute_outlet_assignments").select("rute_id").eq("distributor_id", distributorId).in("rute_id", ruteIds).is("ended_at", null),
            adminClient.from("rute_sales_assignments").select("rute_id").eq("distributor_id", distributorId).in("rute_id", ruteIds).is("ended_at", null),
          ]);
          outletCounts = countByRute(outletResult.data ?? []);
          salesCounts = countByRute(salesResult.data ?? []);
        }
        return (data ?? []).map((rute) => ({ ...toRuteRecord(rute), outletCount: outletCounts.get(rute.id) ?? 0, salesCount: salesCounts.get(rute.id) ?? 0 }));
      }),
    createRute: adminTenantProcedure.mutation(
      z.object({
        wilayahId: z.string().uuid(),
        kode: z.string().trim().min(1, "Kode minimal 1 karakter.").max(40, "Kode maksimal 40 karakter."),
        nama: z.string().trim().min(2, "Nama minimal 2 karakter.").max(120, "Nama maksimal 120 karakter."),
        keterangan: z.string().trim().max(500, "Keterangan maksimal 500 karakter.").nullable().optional(),
      }),
    )(async ({ ctx, input }) => {
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
        const adminClient = getSupabaseAdminClient();
        const { data: wilayah } = await adminClient.from("wilayah").select("id").eq("id", input.wilayahId).eq("distributor_id", distributorId).maybeSingle();
        if (!wilayah) throw new TRPCError({ code: "NOT_FOUND", message: "Wilayah tidak ditemukan." });
        const { data, error } = await adminClient.from("rute").insert({
          distributor_id: distributorId,
          wilayah_id: input.wilayahId,
          kode: input.kode,
          nama: input.nama,
          keterangan: input.keterangan ?? null,
          created_by: ctx.supabaseUser!.id,
        }).select("id, wilayah_id, kode, nama, keterangan, is_active, created_at, updated_at").maybeSingle();
        if (error?.code === "23505") throw new TRPCError({ code: "CONFLICT", message: "Kode Rute sudah digunakan." });
        if (error || !data) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Rute belum dapat dibuat." });
        return toRuteRecord(data);
      }),
    getRute: adminTenantProcedure.query(
      z.object({ ruteId: z.string().uuid() }),
    )(async ({ ctx, input }) => {
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
        const adminClient = getSupabaseAdminClient();
        const { data: rute, error: ruteError } = await adminClient.from("rute").select("id, wilayah_id, kode, nama, keterangan, is_active, created_at, updated_at").eq("id", input.ruteId).eq("distributor_id", distributorId).maybeSingle();
        if (ruteError || !rute) throw new TRPCError({ code: "NOT_FOUND", message: "Rute tidak ditemukan." });
        const { data: wilayah, error: wilayahError } = await adminClient.from("wilayah").select("id, kode, nama").eq("id", rute.wilayah_id).eq("distributor_id", distributorId).maybeSingle();
        if (wilayahError || !wilayah) throw new TRPCError({ code: "NOT_FOUND", message: "Wilayah tidak ditemukan." });

        const [outletResult, salesResult] = await Promise.all([
          adminClient.from("rute_outlet_assignments").select("rute_id, outlet_id, assigned_at").eq("distributor_id", distributorId).eq("rute_id", input.ruteId).is("ended_at", null),
          adminClient.from("rute_sales_assignments").select("rute_id, sales_id, assigned_at").eq("distributor_id", distributorId).eq("rute_id", input.ruteId).is("ended_at", null),
        ]);
        const outletAssigns = outletResult.data ?? [];
        const salesAssigns = salesResult.data ?? [];

        const outlets: OutletRecord[] = [];
        const outletIds = [...new Set(outletAssigns.map((a) => a.outlet_id))];
        const desaInfoByOutlet = new Map<string, { desaId: string; desaNama: string; kecamatanId: string; kecamatanNama: string; kabupatenKotaId: string; kabupatenKotaNama: string; provinsiId: string; provinsiNama: string }>();
        if (outletIds.length > 0) {
          const { data: outletRows } = await adminClient.from("outlets").select("id, distributor_id, kode, nama, alamat, latitude, longitude, foto_depan_url, status, created_at, updated_at, desa_id").eq("distributor_id", distributorId).in("id", outletIds);
          const outletById = new Map((outletRows ?? []).map((outlet) => [outlet.id, outlet]));
          const desaIds = [...new Set(outletRows?.map((o) => o.desa_id).filter(Boolean) ?? [])];
          if (desaIds.length > 0) {
            const { data: desaData } = await adminClient.from("desa").select("id, nama, kecamatan_id, kabupaten_kota_id").in("id", desaIds);
            if (desaData) {
              const kecamatanIds = [...new Set(desaData.map((d) => d.kecamatan_id).filter(Boolean))];
              const { data: kecamatanData } = await adminClient.from("kecamatan").select("id, nama, kabupaten_kota_id").in("id", kecamatanIds);
              const kabupatenIds = [...new Set(kecamatanData?.map((k) => k.kabupaten_kota_id).filter(Boolean) ?? [])];
              const { data: kabupatenData } = await adminClient.from("kabupaten_kota").select("id, nama, provinsi_id").in("id", kabupatenIds);
              const provinsiIds = [...new Set(kabupatenData?.map((k) => k.provinsi_id).filter(Boolean) ?? [])];
              const { data: provinsiData } = await adminClient.from("provinsi").select("id, nama").in("id", provinsiIds);

              const desaMap = new Map(desaData?.map((d) => [d.id, d]) ?? []);
              const kecamatanMap = new Map(kecamatanData?.map((k) => [k.id, k]) ?? []);
              const kabupatenMap = new Map(kabupatenData?.map((k) => [k.id, k]) ?? []);
              const provinsiMap = new Map(provinsiData?.map((p) => [p.id, p]) ?? []);

              for (const desa of desaData ?? []) {
                const desaId = desa.id;
                if (desaId && desaMap.has(desaId)) {
                  const desa = desaMap.get(desaId)!;
                  const kecamatan = desa.kecamatan_id ? kecamatanMap.get(desa.kecamatan_id) : null;
                  const kabupaten = kecamatan?.kabupaten_kota_id ? kabupatenMap.get(kecamatan.kabupaten_kota_id) : null;
                  const provinsi = kabupaten?.provinsi_id ? provinsiMap.get(kabupaten.provinsi_id) : null;
                  desaInfoByOutlet.set(desa.id, {
                    desaId: desa.id,
                    desaNama: desa.nama,
                    kecamatanId: kecamatan?.id ?? null,
                    kecamatanNama: kecamatan?.nama ?? null,
                    kabupatenKotaId: kabupaten?.id ?? null,
                    kabupatenKotaNama: kabupaten?.nama ?? null,
                    provinsiId: provinsi?.id ?? null,
                    provinsiNama: provinsi?.nama ?? null,
                  });
                }
              }
            }
          }
          for (const a of outletAssigns) {
            const outlet = outletById.get(a.outlet_id);
            if (outlet) outlets.push(toOutletRecord(outlet, input.ruteId, rute.nama, [], desaInfoByOutlet.get(outlet.id) ?? undefined));
          }
        }

        const sales: SalesRecord[] = [];
        const salesIds = [...new Set(salesAssigns.map((a) => a.sales_id))];
        if (salesIds.length > 0) {
          const tenantUsers = await listTenantUsers(distributorId);
          const salesById = new Map(tenantUsers.filter((user) => user.role === "sales_motoris").map((user) => [user.id, user]));
          for (const salesUserId of salesIds) {
            const user = salesById.get(salesUserId);
            if (!user) continue;
            sales.push(toSalesRecord(user, new Map([[input.ruteId, rute.nama]]), new Map([[salesUserId, input.ruteId]])));
          }
        }

        return {
          wilayah: { id: wilayah.id, kode: wilayah.kode, nama: wilayah.nama },
          rute: toRuteRecord(rute),
          outlets,
          sales,
          outletCount: outlets.length,
          salesCount: sales.length,
        } satisfies RuteDetail;
      }),
    updateRute: adminTenantProcedure.mutation(
      z.object({
        ruteId: z.string().uuid(),
        wilayahId: z.string().uuid().optional(),
        kode: z.string().trim().min(1, "Kode minimal 1 karakter.").max(40, "Kode maksimal 40 karakter.").optional(),
        nama: z.string().trim().min(2, "Nama minimal 2 karakter.").max(120, "Nama maksimal 120 karakter.").optional(),
        keterangan: z.string().trim().max(500, "Keterangan maksimal 500 karakter.").nullable().optional(),
      }),
    )(async ({ ctx, input }) => {
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
        if (input.wilayahId === undefined && input.kode === undefined && input.nama === undefined && input.keterangan === undefined) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Tidak ada data yang diubah." });
        }
        if (input.wilayahId !== undefined) {
          const { data: wilayah } = await getSupabaseAdminClient().from("wilayah").select("id").eq("id", input.wilayahId).eq("distributor_id", distributorId).maybeSingle();
          if (!wilayah) throw new TRPCError({ code: "NOT_FOUND", message: "Wilayah tidak ditemukan." });
        }
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (input.wilayahId !== undefined) patch.wilayah_id = input.wilayahId;
        if (input.kode !== undefined) patch.kode = input.kode;
        if (input.nama !== undefined) patch.nama = input.nama;
        if (input.keterangan !== undefined) patch.keterangan = input.keterangan;
        const { data, error } = await getSupabaseAdminClient().from("rute").update(patch).eq("id", input.ruteId).eq("distributor_id", distributorId).select("id, wilayah_id, kode, nama, keterangan, is_active, created_at, updated_at").maybeSingle();
        if (error?.code === "23505") throw new TRPCError({ code: "CONFLICT", message: "Kode Rute sudah digunakan." });
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Rute belum dapat diperbarui." });
        if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Rute tidak ditemukan." });
        return toRuteRecord(data);
      }),
    setRuteActive: adminTenantProcedure.mutation(
      z.object({ ruteId: z.string().uuid(), isActive: z.boolean() }),
    )(async ({ ctx, input }) => {
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
        const { data, error } = await getSupabaseAdminClient().from("rute").update({ is_active: input.isActive, updated_at: new Date().toISOString() }).eq("id", input.ruteId).eq("distributor_id", distributorId).select("id, wilayah_id, kode, nama, keterangan, is_active, created_at, updated_at").maybeSingle();
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Status Rute belum dapat diperbarui." });
        if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Rute tidak ditemukan." });
        return toRuteRecord(data);
      }),
    listOutlet: adminTenantProcedure.query(
      z.object({ search: z.string().trim().max(160).optional() }).optional(),
    )(async ({ ctx, input }) => {
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
        const adminClient = getSupabaseAdminClient();
        let query = adminClient.from("outlets").select("id, distributor_id, kode, nama, nama_pemilik, no_hp, alamat, latitude, longitude, foto_depan_url, status, created_at, updated_at, desa_id").eq("distributor_id", distributorId).order("created_at", { ascending: false });
        if (input?.search) query = query.or(`kode.ilike.%${input.search}%,nama.ilike.%${input.search}%`);
        const { data, error } = await query;
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Daftar outlet belum dapat dimuat." });

        const outletIds = (data ?? []).map((outlet) => outlet.id);
        const activeByOutlet = new Map<string, string>();
        const visitDaysByOutlet = new Map<string, DayOfWeek[]>();
        const desaInfoByOutlet = new Map<string, { desaId: string; desaNama: string; kecamatanId: string; kecamatanNama: string; kabupatenKotaId: string; kabupatenKotaNama: string; provinsiId: string; provinsiNama: string }>();
        const ruteNamaById = new Map<string, string>();
        if (outletIds.length > 0) {
          const [actsResult, visitDaysResult, desaResult] = await Promise.all([
            adminClient.from("rute_outlet_assignments").select("outlet_id, rute_id").eq("distributor_id", distributorId).in("outlet_id", outletIds).is("ended_at", null),
            adminClient.from("outlet_visit_schedule").select("outlet_id, day_of_week").eq("distributor_id", distributorId).in("outlet_id", outletIds),
            adminClient.from("outlets").select("id, desa_id").eq("distributor_id", distributorId).in("id", outletIds),
          ]);

          const ruteIds = [...new Set(actsResult.data?.map((a) => a.rute_id).filter(Boolean) ?? [])];
          if (ruteIds.length > 0) {
            const { data: ruteData } = await adminClient.from("rute").select("id, nama").eq("distributor_id", distributorId).in("id", ruteIds);
            for (const r of ruteData ?? []) ruteNamaById.set(r.id, r.nama);
          }
          for (const a of actsResult.data ?? []) activeByOutlet.set(a.outlet_id, a.rute_id);
          for (const v of visitDaysResult.data ?? []) {
            const arr = visitDaysByOutlet.get(v.outlet_id) ?? [];
            arr.push(v.day_of_week);
            visitDaysByOutlet.set(v.outlet_id, arr);
          }
          // Fetch geographical info for outlets with desa_id
          const desaIds = [...new Set(desaResult.data?.map((o) => o.desa_id).filter(Boolean) ?? [])];
          if (desaIds.length > 0) {
            const { data: desaData } = await adminClient.from("desa").select("id, nama, kecamatan_id, kabupaten_kota_id").in("id", desaIds);
            if (desaData) {
              const kecamatanIds = [...new Set(desaData.map((d) => d.kecamatan_id).filter(Boolean))];
              const { data: kecamatanData } = await adminClient.from("kecamatan").select("id, nama, kabupaten_kota_id").in("id", kecamatanIds);
              const kabupatenIds = [...new Set(kecamatanData?.map((k) => k.kabupaten_kota_id).filter(Boolean) ?? [])];
              const { data: kabupatenData } = await adminClient.from("kabupaten_kota").select("id, nama, provinsi_id").in("id", kabupatenIds);
              const provinsiIds = [...new Set(kabupatenData?.map((k) => k.provinsi_id).filter(Boolean) ?? [])];
              const { data: provinsiData } = await adminClient.from("provinsi").select("id, nama").in("id", provinsiIds);

              const desaMap = new Map(desaData?.map((d) => [d.id, d]) ?? []);
              const kecamatanMap = new Map(kecamatanData?.map((k) => [k.id, k]) ?? []);
              const kabupatenMap = new Map(kabupatenData?.map((k) => [k.id, k]) ?? []);
              const provinsiMap = new Map(provinsiData?.map((p) => [p.id, p]) ?? []);

              for (const outlet of desaResult.data ?? []) {
                const desaId = outlet.desa_id;
                if (desaId && desaMap.has(desaId)) {
                  const desa = desaMap.get(desaId)!;
                  const kecamatan = desa.kecamatan_id ? kecamatanMap.get(desa.kecamatan_id) : null;
                  const kabupaten = kecamatan?.kabupaten_kota_id ? kabupatenMap.get(kecamatan.kabupaten_kota_id) : null;
                  const provinsi = kabupaten?.provinsi_id ? provinsiMap.get(kabupaten.provinsi_id) : null;
                  desaInfoByOutlet.set(outlet.id, {
                    desaId: desa.id,
                    desaNama: desa.nama,
                    kecamatanId: kecamatan?.id ?? null,
                    kecamatanNama: kecamatan?.nama ?? null,
                    kabupatenKotaId: kabupaten?.id ?? null,
                    kabupatenKotaNama: kabupaten?.nama ?? null,
                    provinsiId: provinsi?.id ?? null,
                    provinsiNama: provinsi?.nama ?? null,
                  });
                }
              }
            }
          }
        }

        return (data ?? []).map((outlet) => {
          const ruteId = activeByOutlet.get(outlet.id) ?? null;
          const desaInfo = desaInfoByOutlet.get(outlet.id);
          return toOutletRecord(outlet, activeByOutlet.get(outlet.id) ?? null, ruteId ? ruteNamaById.get(ruteId) ?? null : null, visitDaysByOutlet.get(outlet.id) ?? [], desaInfo ?? undefined);
        });
      }),
    createOutlet: adminTenantProcedure.mutation(
      z.object({
        nama: z.string().trim().min(2, "Nama minimal 2 karakter.").max(120, "Nama maksimal 120 karakter."),
        alamat: z.string().trim().max(500, "Alamat maksimal 500 karakter.").nullable().optional(),
        latitude: z.number().min(-90).max(90).nullable().optional(),
        longitude: z.number().min(-180).max(180).nullable().optional(),
        desaId: z.string().uuid().nullable().optional(),
      }),
    )(async ({ ctx, input }) => {
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
        const outlet = await createOutletForTenant({ actorId: ctx.supabaseUser!.id, distributorId, input });
        return outlet;
      }),
    updateOutlet: adminTenantProcedure.mutation(
      z.object({
        outletId: z.string().uuid(),
        nama: z.string().trim().min(2, "Nama minimal 2 karakter.").max(120, "Nama maksimal 120 karakter.").optional(),
        alamat: z.string().trim().max(500, "Alamat maksimal 500 karakter.").nullable().optional(),
        latitude: z.number().min(-90).max(90).nullable().optional(),
        longitude: z.number().min(-180).max(180).nullable().optional(),
        fotoDepanUrl: z.string().trim().max(1000, "Referensi foto maksimal 1000 karakter.").nullable().optional(),
        visitDays: z.array(z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"])).optional(),
        desaId: z.string().uuid().nullable().optional(),
      }),
    )(async ({ ctx, input }) => {
      const distributorId = getDistributorId(ctx.supabaseUser);
      if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
      const hasOutletData = input.nama !== undefined || input.alamat !== undefined || input.latitude !== undefined || input.longitude !== undefined;
      const hasDesaId = input.desaId !== undefined;
      if (!hasOutletData && !hasDesaId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tidak ada data yang diubah." });
      }
      if (input.nama !== undefined || input.alamat !== undefined || input.latitude !== undefined || input.longitude !== undefined) {
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (input.nama !== undefined) patch.nama = input.nama;
        if (input.alamat !== undefined) patch.alamat = input.alamat;
        if (input.latitude !== undefined) patch.latitude = input.latitude;
        if (input.longitude !== undefined) patch.longitude = input.longitude;
        const { data, error } = await getSupabaseAdminClient().from("outlets").update(patch).eq("id", input.outletId).eq("distributor_id", distributorId).select("id, distributor_id, kode, nama, alamat, latitude, longitude, created_at, updated_at").maybeSingle();
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Outlet belum dapat diperbarui." });
        if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Outlet tidak ditemukan." });
      }
      if (input.desaId !== undefined) {
        const adminClient = getSupabaseAdminClient();
        // Validate desa exists and belongs to the same distributor's wilayah
        if (input.desaId !== null) {
          const { data: desaData, error: desaError } = await adminClient.from("desa").select("id, kecamatan_id, kabupaten_kota_id").eq("id", input.desaId).maybeSingle();
          if (desaError || !desaData) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Desa tidak ditemukan." });
          }
          // Verify desa is accessible via wilayah_desa for this distributor
          const { data: wilayahDesaData } = await adminClient.from("wilayah_desa").select("id").eq("distributor_id", distributorId).eq("desa_id", input.desaId).maybeSingle();
          if (!wilayahDesaData) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Desa tidak tersedia untuk distributor ini." });
          }
        }
        const { error } = await adminClient.from("outlets").update({ desa_id: input.desaId, updated_at: new Date().toISOString() }).eq("id", input.outletId).eq("distributor_id", distributorId);
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Gagal memperbarui lokasi administratif outlet." });
      }
      // Fetch outlet to return fresh data including visitDays
      const adminClient = getSupabaseAdminClient();
      const { data: outletData } = await adminClient.from("outlets").select("id, distributor_id, kode, nama, alamat, latitude, longitude, status, created_at, updated_at, desa_id").eq("id", input.outletId).eq("distributor_id", distributorId).maybeSingle();

      // Fetch geographical info for the outlet if it has desa_id
      let desaInfo: { desaId: string; desaNama: string; kecamatanId: string; kecamatanNama: string; kabupatenKotaId: string; kabupatenKotaNama: string; provinsiId: string; provinsiNama: string } | undefined;
      if (outletData?.desa_id) {
        const { data: desaData } = await adminClient.from("desa").select("id, nama, kecamatan_id, kabupaten_kota_id").eq("id", outletData.desa_id).maybeSingle();
        if (desaData) {
          const { data: kecamatanData } = await adminClient.from("kecamatan").select("id, nama, kabupaten_kota_id").eq("id", desaData.kecamatan_id).maybeSingle();
          if (kecamatanData) {
            const { data: kabupatenData } = await adminClient.from("kabupaten_kota").select("id, nama, provinsi_id").eq("id", kecamatanData.kabupaten_kota_id).maybeSingle();
            if (kabupatenData) {
              const { data: provinsiData } = await adminClient.from("provinsi").select("id, nama").eq("id", kabupatenData.provinsi_id).maybeSingle();
              desaInfo = {
                desaId: desaData.id,
                desaNama: desaData.nama,
                kecamatanId: kecamatanData.id ?? null,
                kecamatanNama: kecamatanData.nama ?? null,
                kabupatenKotaId: kabupatenData.id ?? null,
                kabupatenKotaNama: kabupatenData.nama ?? null,
                provinsiId: provinsiData?.id ?? null,
                provinsiNama: provinsiData?.nama ?? null,
              };
            }
          }
        }
      }

      return toOutletRecord(outletData!, null, null, [], desaInfo);
      }),
    setOutletActive: adminTenantProcedure.mutation(
      z.object({ outletId: z.string().uuid(), isActive: z.boolean() }),
    )(async ({ ctx, input }) => {
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
        const { data, error } = await getSupabaseAdminClient().from("outlets").update({ status: input.isActive ? "ACTIVE" : "INACTIVE", updated_at: new Date().toISOString() }).eq("id", input.outletId).eq("distributor_id", distributorId).select("id, distributor_id, kode, nama, alamat, latitude, longitude, foto_depan_url, status, created_at, updated_at, desa_id").maybeSingle();
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Status Outlet belum dapat diperbarui." });
        if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Outlet tidak ditemukan." });
        return toOutletRecord(data, null, null);
      }),
    listSales: adminTenantProcedure.query(
      z.object({ search: z.string().trim().max(160).optional() }).optional(),
    )(async ({ ctx, input }) => {
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
        const salesUsers = (await listTenantUsers(distributorId)).filter((user) => user.role === "sales_motoris");
        const { data, error } = await getSupabaseAdminClient().from("rute_sales_assignments").select("sales_id, rute_id").eq("distributor_id", distributorId).is("ended_at", null);
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Penugasan sales belum dapat dimuat." });
        const activeRuteBySales = new Map((data ?? []).map((a) => [a.sales_id, a.rute_id]));
        const ruteIds = [...new Set((data ?? []).map((a) => a.rute_id))];
        const ruteNamaById = new Map<string, string>();
        if (ruteIds.length > 0) {
          const { data: rutes } = await getSupabaseAdminClient().from("rute").select("id, nama").eq("distributor_id", distributorId).in("id", ruteIds);
          for (const rute of rutes ?? []) ruteNamaById.set(rute.id, rute.nama);
        }
        let sales = salesUsers.map((user) => toSalesRecord(user, ruteNamaById, activeRuteBySales)).sort((a, b) => a.nama.localeCompare(b.nama));
        if (input?.search) {
          const q = input.search.toLowerCase();
          sales = sales.filter((s) => s.nama.toLowerCase().includes(q) || (s.email ?? "").toLowerCase().includes(q));
        }
        return sales;
      }),
    assignOutletToRute: adminTenantProcedure.mutation(
      z.object({ outletId: z.string().uuid(), ruteId: z.string().uuid() }),
    )(async ({ ctx, input }) => {
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
        return assignOutletToRute(distributorId, ctx.supabaseUser!.id, input.outletId, input.ruteId);
      }),
    reassignOutlet: adminTenantProcedure.mutation(
      z.object({ outletId: z.string().uuid(), ruteId: z.string().uuid() }),
    )(async ({ ctx, input }) => {
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
        return assignOutletToRute(distributorId, ctx.supabaseUser!.id, input.outletId, input.ruteId);
      }),
    assignSalesToRute: adminTenantProcedure.mutation(
      z.object({ salesId: z.string().uuid(), ruteId: z.string().uuid() }),
    )(async ({ ctx, input }) => {
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
        return assignSalesToRute(distributorId, ctx.supabaseUser!.id, input.salesId, input.ruteId);
      }),
    reassignSales: adminTenantProcedure.mutation(
      z.object({ salesId: z.string().uuid(), ruteId: z.string().uuid() }),
    )(async ({ ctx, input }) => {
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
        return assignSalesToRute(distributorId, ctx.supabaseUser!.id, input.salesId, input.ruteId);
      }),
    getAssignmentHistory: adminTenantProcedure.query(
      z.object({
        entityType: z.enum(["outlet", "sales"]).optional(),
        entityId: z.string().uuid().optional(),
        ruteId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }).optional(),
    )(async ({ ctx, input }) => {
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });
        const adminClient = getSupabaseAdminClient();
        let query = adminClient.from("assignment_history").select("id, entity_type, entity_id, from_rute_id, to_rute_id, action, changed_by, changed_at").eq("distributor_id", distributorId).order("changed_at", { ascending: false }).limit(input?.limit ?? 50);
        if (input?.entityType) query = query.eq("entity_type", input.entityType);
        if (input?.entityId) query = query.eq("entity_id", input.entityId);
        if (input?.ruteId) query = query.or(`to_rute_id.eq.${input.ruteId},from_rute_id.eq.${input.ruteId}`);
        const { data, error } = await query;
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Riwayat penugasan belum dapat dimuat." });

        const ruteIds = [...new Set((data ?? []).flatMap((row) => [row.from_rute_id, row.to_rute_id]).filter((id): id is string => Boolean(id)))];
        const ruteNamaById = new Map<string, string>();
        if (ruteIds.length > 0) {
          const { data: rutes } = await adminClient.from("rute").select("id, nama").eq("distributor_id", distributorId).in("id", ruteIds);
          for (const rute of rutes ?? []) ruteNamaById.set(rute.id, rute.nama);
        }

        const idsToName: Record<string, string> = {};
        const outletIds = [...new Set((data ?? []).filter((row) => row.entity_type === "outlet").map((row) => row.entity_id))];
        const salesIds = [...new Set((data ?? []).filter((row) => row.entity_type === "sales").map((row) => row.entity_id))];
        if (outletIds.length > 0) {
          const { data: outlets } = await adminClient.from("outlets").select("id, nama, kode").eq("distributor_id", distributorId).in("id", outletIds);
          for (const outlet of outlets ?? []) idsToName[outlet.id] = `${outlet.nama} (${outlet.kode})`;
        }
        const tenantUsers = await listTenantUsers(distributorId);
        for (const user of tenantUsers) idsToName[user.id] = user.nama;
        for (const salesUserId of salesIds) if (!idsToName[salesUserId]) idsToName[salesUserId] = "Sales";

        return (data ?? []).map((row): AssignmentHistoryEntry => ({
          id: row.id,
          entityType: row.entity_type as "outlet" | "sales",
          entityId: row.entity_id,
          entityName: idsToName[row.entity_id] ?? (row.entity_type === "outlet" ? "Outlet" : "Sales"),
          fromRuteId: row.from_rute_id ?? null,
          fromRuteNama: row.from_rute_id ? ruteNamaById.get(row.from_rute_id) ?? "Rute" : null,
          toRuteId: row.to_rute_id ?? null,
          toRuteNama: row.to_rute_id ? ruteNamaById.get(row.to_rute_id) ?? "Rute" : null,
          action: row.action as "assign" | "reassign" | "unassign",
          changedBy: row.changed_by,
          changedByName: idsToName[row.changed_by] ?? "Admin",
          changedAt: row.changed_at,
        }));
      }),
    uploadOutletPhoto: adminTenantProcedure.mutation(
      z.object({
        outletId: z.string().uuid(),
        base64: z.string(),
        contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      })
    )(async ({ ctx, input }) => {
        const distributorId = getDistributorId(ctx.supabaseUser);
        if (!distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja Distributor tidak ditemukan." });

        const adminClient = getSupabaseAdminClient();

        // Verify outlet belongs to distributor
        const { data: outlet, error: outletError } = await adminClient
          .from("outlets")
          .select("id, distributor_id, foto_depan_url")
          .eq("id", input.outletId)
          .eq("distributor_id", distributorId)
          .maybeSingle();
        if (outletError || !outlet) throw new TRPCError({ code: "NOT_FOUND", message: "Outlet tidak ditemukan." });

        // Decode and validate base64
        const base64Payload = input.base64.replace(/^data:[^;]+;base64,/, "");
        const bytes = Buffer.from(base64Payload, "base64");
        if (bytes.length === 0 || bytes.length > 10485760) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ukuran foto maksimal 10 MB." });
        }

        // Validate content type and determine extension
        const extension = input.contentType === "image/png" ? "png" : input.contentType === "image/webp" ? "webp" : "jpg";

        // Build storage path: {distributorId}/{outletId}/{uuid}.{ext}
        const storagePath = `${distributorId}/${input.outletId}/${crypto.randomUUID()}.${extension}`;

        // Upload to Storage
        const { error: uploadError } = await adminClient.storage
          .from("outlet-photos")
          .upload(storagePath, bytes, { contentType: input.contentType, upsert: false });
        if (uploadError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Foto belum dapat diunggah." });

        // Update outlet with new photo path
        const { data: updatedOutlet, error: updateError } = await adminClient
          .from("outlets")
          .update({ foto_depan_url: storagePath, updated_at: new Date().toISOString() })
          .eq("id", input.outletId)
          .eq("distributor_id", distributorId)
          .select("id, distributor_id, kode, nama, alamat, latitude, longitude, foto_depan_url, status, created_at, updated_at, desa_id")
          .maybeSingle();
        if (updateError || !updatedOutlet) {
          // Rollback: remove uploaded file
          await adminClient.storage.from("outlet-photos").remove([storagePath]);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Gagal menyimpan foto outlet." });
        }

        // Cleanup old photo if it exists and is different from new path
        const oldPhotoPath = outlet.foto_depan_url;
        if (oldPhotoPath && oldPhotoPath !== storagePath) {
          // Only remove if it looks like a path in our bucket (has distributor_id/ prefix)
          if (oldPhotoPath.startsWith(`${distributorId}/`)) {
            await adminClient.storage.from("outlet-photos").remove([oldPhotoPath]);
          }
        }

        return { outletId: input.outletId, path: storagePath };
      }),
    listKabupatenKotaCountByProvinsi: publicProcedure
      .input(z.object({ provinsiId: z.string().uuid().optional(), filter: z.enum(["active", "inactive", "all"]).optional() }).optional())
      .query(async ({ input }) => {
        const adminClient = getSupabaseAdminClient();
        const filter = input?.filter ?? "active";
        const countForProvinsi = async (provinsiId: string): Promise<number> => {
          let query = adminClient
            .from("kabupaten_kota")
            .select("id", { count: "exact", head: true })
            .eq("provinsi_id", provinsiId);
          if (filter === "active") query = query.eq("is_active", true);
          else if (filter === "inactive") query = query.eq("is_active", false);
          const { count, error } = await query;
          if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Jumlah Kabupaten/Kota belum dapat dimuat." });
          return count ?? 0;
        };
        if (input?.provinsiId) {
          return [{ provinsiId: input.provinsiId, count: await countForProvinsi(input.provinsiId) }];
        }
        const { data: provinsiRows, error: provinsiError } = await adminClient.from("provinsi").select("id");
        if (provinsiError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Jumlah Kabupaten/Kota belum dapat dimuat." });
        const results: { provinsiId: string; count: number }[] = [];
        for (const row of provinsiRows ?? []) {
          results.push({ provinsiId: row.id, count: await countForProvinsi(row.id) });
        }
        return results;
      }),
    listKecamatanCountByKabupatenKota: publicProcedure
      .input(z.object({ provinsiId: z.string().uuid(), filter: z.enum(["active", "inactive", "all"]).optional() }))
      .query(async ({ input }) => {
        const adminClient = getSupabaseAdminClient();
        const filter = input?.filter ?? "active";
        const { data: kabupatenRows, error: kabupatenError } = await adminClient
          .from("kabupaten_kota")
          .select("id")
          .eq("provinsi_id", input.provinsiId);
        if (kabupatenError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Jumlah Kecamatan belum dapat dimuat." });
        const results: { kabupatenKotaId: string; count: number }[] = [];
        for (const kabupaten of kabupatenRows ?? []) {
          let query = adminClient
            .from("kecamatan")
            .select("id", { count: "exact", head: true })
            .eq("kabupaten_kota_id", kabupaten.id);
          if (filter === "active") query = query.eq("is_active", true);
          else if (filter === "inactive") query = query.eq("is_active", false);
          const { count, error } = await query;
          if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Jumlah Kecamatan belum dapat dimuat." });
          results.push({ kabupatenKotaId: kabupaten.id, count: count ?? 0 });
        }
        return results;
      }),
    listDesaCountByKecamatan: publicProcedure
      .input(z.object({ kabupatenKotaId: z.string().uuid(), filter: z.enum(["active", "inactive", "all"]).optional() }))
      .query(async ({ input }) => {
        const adminClient = getSupabaseAdminClient();
        const filter = input?.filter ?? "active";
        const { data: kecamatanRows, error: kecamatanError } = await adminClient
          .from("kecamatan")
          .select("id")
          .eq("kabupaten_kota_id", input.kabupatenKotaId);
        if (kecamatanError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Jumlah Desa/Kelurahan belum dapat dimuat." });
        const results: { kecamatanId: string; count: number }[] = [];
        for (const kecamatan of kecamatanRows ?? []) {
          let query = adminClient
            .from("desa")
            .select("id", { count: "exact", head: true })
            .eq("kecamatan_id", kecamatan.id);
          if (filter === "active") query = query.eq("is_active", true);
          else if (filter === "inactive") query = query.eq("is_active", false);
          const { count, error } = await query;
          if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Jumlah Desa/Kelurahan belum dapat dimuat." });
          results.push({ kecamatanId: kecamatan.id, count: count ?? 0 });
        }
        return results;
      }),
    listKecamatanCountByProvinsi: publicProcedure
      .input(z.object({ provinsiId: z.string().uuid().optional(), filter: z.enum(["active", "inactive", "all"]).optional() }).optional())
      .query(async ({ input }) => {
        const adminClient = getSupabaseAdminClient();
        const filter = input?.filter ?? "active";
        const countForProvinsi = async (provinsiId: string): Promise<number> => {
          const { data: kabupatenRows, error: kabupatenError } = await adminClient
            .from("kabupaten_kota")
            .select("id")
            .eq("provinsi_id", provinsiId);
          if (kabupatenError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Jumlah Kecamatan belum dapat dimuat." });
          if (!kabupatenRows || kabupatenRows.length === 0) return 0;
          const kabupatenIds = kabupatenRows.map((k) => k.id);
          let query = adminClient
            .from("kecamatan")
            .select("id", { count: "exact", head: true })
            .in("kabupaten_kota_id", kabupatenIds);
          if (filter === "active") query = query.eq("is_active", true);
          else if (filter === "inactive") query = query.eq("is_active", false);
          const { count, error } = await query;
          if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Jumlah Kecamatan belum dapat dimuat." });
          return count ?? 0;
        };
        if (input?.provinsiId) {
          return [{ provinsiId: input.provinsiId, count: await countForProvinsi(input.provinsiId) }];
        }
        const { data: provinsiRows, error: provinsiError } = await adminClient.from("provinsi").select("id");
        if (provinsiError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Jumlah Kecamatan belum dapat dimuat." });
        const results: { provinsiId: string; count: number }[] = [];
        for (const row of provinsiRows ?? []) {
          results.push({ provinsiId: row.id, count: await countForProvinsi(row.id) });
        }
        return results;
      }),
    listDesaCountByKabupatenKota: publicProcedure
      .input(z.object({ provinsiId: z.string().uuid(), filter: z.enum(["active", "inactive", "all"]).optional() }))
      .query(async ({ input }) => {
        const adminClient = getSupabaseAdminClient();
        const filter = input?.filter ?? "active";
        const { data: kabupatenRows, error: kabupatenError } = await adminClient
          .from("kabupaten_kota")
          .select("id")
          .eq("provinsi_id", input.provinsiId);
        if (kabupatenError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Jumlah Desa/Kelurahan belum dapat dimuat." });
        const results: { kabupatenKotaId: string; count: number }[] = [];
        for (const kabupaten of kabupatenRows ?? []) {
          let query = adminClient
            .from("desa")
            .select("id", { count: "exact", head: true })
            .eq("kabupaten_kota_id", kabupaten.id);
          if (filter === "active") query = query.eq("is_active", true);
          else if (filter === "inactive") query = query.eq("is_active", false);
          const { count, error } = await query;
          if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Jumlah Desa/Kelurahan belum dapat dimuat." });
          results.push({ kabupatenKotaId: kabupaten.id, count: count ?? 0 });
        }
        return results;
      }),
    listDesaCountByProvinsi: publicProcedure
      .input(z.object({ provinsiId: z.string().uuid().optional(), filter: z.enum(["active", "inactive", "all"]).optional() }).optional())
      .query(async ({ input }) => {
        const adminClient = getSupabaseAdminClient();
        const filter = input?.filter ?? "active";
        const countForProvinsi = async (provinsiId: string): Promise<number> => {
          const { data: kabupatenRows, error: kabupatenError } = await adminClient
            .from("kabupaten_kota")
            .select("id")
            .eq("provinsi_id", provinsiId);
          if (kabupatenError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Jumlah Desa/Kelurahan belum dapat dimuat." });
          if (!kabupatenRows || kabupatenRows.length === 0) return 0;
          const kabupatenIds = kabupatenRows.map((k) => k.id);
          let query = adminClient
            .from("desa")
            .select("id", { count: "exact", head: true })
            .in("kabupaten_kota_id", kabupatenIds);
          if (filter === "active") query = query.eq("is_active", true);
          else if (filter === "inactive") query = query.eq("is_active", false);
          const { count, error } = await query;
          if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Jumlah Desa/Kelurahan belum dapat dimuat." });
          return count ?? 0;
        };
        if (input?.provinsiId) {
          return [{ provinsiId: input.provinsiId, count: await countForProvinsi(input.provinsiId) }];
        }
        const { data: provinsiRows, error: provinsiError } = await adminClient.from("provinsi").select("id");
        if (provinsiError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Jumlah Desa/Kelurahan belum dapat dimuat." });
        const results: { provinsiId: string; count: number }[] = [];
        for (const row of provinsiRows ?? []) {
          results.push({ provinsiId: row.id, count: await countForProvinsi(row.id) });
        }
        return results;
      }),
    listOutletCountByProvinsi: publicProcedure
      .input(z.object({ provinsiId: z.string().uuid().optional(), filter: z.enum(["active", "inactive", "all"]).optional() }).optional())
      .query(async ({ input }) => {
        const adminClient = getSupabaseAdminClient();
        const filter = input?.filter ?? "active";
        const countForProvinsi = async (provinsiId: string): Promise<number> => {
          const { data: kabupatenRows, error: kabupatenError } = await adminClient
            .from("kabupaten_kota")
            .select("id")
            .eq("provinsi_id", provinsiId);
          if (kabupatenError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Jumlah Outlet belum dapat dimuat." });
          if (!kabupatenRows || kabupatenRows.length === 0) return 0;
          const kabupatenIds = kabupatenRows.map((k) => k.id);
          let desaQuery = adminClient.from("desa").select("id").in("kabupaten_kota_id", kabupatenIds);
          if (filter === "active") desaQuery = desaQuery.eq("is_active", true);
          else if (filter === "inactive") desaQuery = desaQuery.eq("is_active", false);
          const { data: desaRows, error: desaError } = await desaQuery;
          if (desaError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Jumlah Outlet belum dapat dimuat." });
          if (!desaRows || desaRows.length === 0) return 0;
          const desaIds = desaRows.map((d) => d.id);
          let query = adminClient
            .from("outlets")
            .select("id", { count: "exact", head: true })
            .in("desa_id", desaIds)
            .not("desa_id", "is", null);
          const { count, error } = await query;
          if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Jumlah Outlet belum dapat dimuat." });
          return count ?? 0;
        };
        if (input?.provinsiId) {
          return [{ provinsiId: input.provinsiId, count: await countForProvinsi(input.provinsiId) }];
        }
        const { data: provinsiRows, error: provinsiError } = await adminClient.from("provinsi").select("id");
        if (provinsiError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Jumlah Outlet belum dapat dimuat." });
        const results: { provinsiId: string; count: number }[] = [];
        for (const row of provinsiRows ?? []) {
          results.push({ provinsiId: row.id, count: await countForProvinsi(row.id) });
        }
        return results;
      }),
    listOutletCountByKabupatenKota: publicProcedure
      .input(z.object({ provinsiId: z.string().uuid(), filter: z.enum(["active", "inactive", "all"]).optional() }))
      .query(async ({ input }) => {
        const adminClient = getSupabaseAdminClient();
        const filter = input?.filter ?? "active";
        const { data: kabupatenRows, error: kabupatenError } = await adminClient
          .from("kabupaten_kota")
          .select("id")
          .eq("provinsi_id", input.provinsiId);
        if (kabupatenError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Jumlah Outlet belum dapat dimuat." });
        const countForKabupaten = async (kabupatenKotaId: string): Promise<number> => {
          let desaQuery = adminClient.from("desa").select("id").eq("kabupaten_kota_id", kabupatenKotaId);
          if (filter === "active") desaQuery = desaQuery.eq("is_active", true);
          else if (filter === "inactive") desaQuery = desaQuery.eq("is_active", false);
          const { data: desaRows, error: desaError } = await desaQuery;
          if (desaError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Jumlah Outlet belum dapat dimuat." });
          if (!desaRows || desaRows.length === 0) return 0;
          const desaIds = desaRows.map((d) => d.id);
          let query = adminClient
            .from("outlets")
            .select("id", { count: "exact", head: true })
            .in("desa_id", desaIds)
            .not("desa_id", "is", null);
          const { count, error } = await query;
          if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Jumlah Outlet belum dapat dimuat." });
          return count ?? 0;
        };
        const results: { kabupatenKotaId: string; count: number }[] = [];
        for (const kabupaten of kabupatenRows ?? []) {
          results.push({ kabupatenKotaId: kabupaten.id, count: await countForKabupaten(kabupaten.id) });
        }
        return results;
      }),
    listOutletCountByKecamatan: publicProcedure
      .input(z.object({ kabupatenKotaId: z.string().uuid(), filter: z.enum(["active", "inactive", "all"]).optional() }))
      .query(async ({ input }) => {
        const adminClient = getSupabaseAdminClient();
        const filter = input?.filter ?? "active";
        const { data: kecamatanRows, error: kecamatanError } = await adminClient
          .from("kecamatan")
          .select("id")
          .eq("kabupaten_kota_id", input.kabupatenKotaId);
        if (kecamatanError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Jumlah Outlet belum dapat dimuat." });
        const countForKecamatan = async (kecamatanId: string): Promise<number> => {
          let desaQuery = adminClient.from("desa").select("id").eq("kecamatan_id", kecamatanId);
          if (filter === "active") desaQuery = desaQuery.eq("is_active", true);
          else if (filter === "inactive") desaQuery = desaQuery.eq("is_active", false);
          const { data: desaRows, error: desaError } = await desaQuery;
          if (desaError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Jumlah Outlet belum dapat dimuat." });
          if (!desaRows || desaRows.length === 0) return 0;
          const desaIds = desaRows.map((d) => d.id);
          let query = adminClient
            .from("outlets")
            .select("id", { count: "exact", head: true })
            .in("desa_id", desaIds)
            .not("desa_id", "is", null);
          const { count, error } = await query;
          if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Jumlah Outlet belum dapat dimuat." });
          return count ?? 0;
        };
        const results: { kecamatanId: string; count: number }[] = [];
        for (const kecamatan of kecamatanRows ?? []) {
          results.push({ kecamatanId: kecamatan.id, count: await countForKecamatan(kecamatan.id) });
        }
        return results;
      }),
    listOutletCountByDesa: publicProcedure
      .input(z.object({ kecamatanId: z.string().uuid(), filter: z.enum(["active", "inactive", "all"]).optional() }))
      .query(async ({ input }) => {
        const adminClient = getSupabaseAdminClient();
        const filter = input?.filter ?? "active";
        let desaQuery = adminClient.from("desa").select("id").eq("kecamatan_id", input.kecamatanId);
        if (filter === "active") desaQuery = desaQuery.eq("is_active", true);
        else if (filter === "inactive") desaQuery = desaQuery.eq("is_active", false);
        const { data: desaRows, error: desaError } = await desaQuery;
        if (desaError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Jumlah Outlet belum dapat dimuat." });
        const countForDesa = async (desaId: string): Promise<number> => {
          let query = adminClient
            .from("outlets")
            .select("id", { count: "exact", head: true })
            .eq("desa_id", desaId);
          const { count, error } = await query;
          if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Jumlah Outlet belum dapat dimuat." });
          return count ?? 0;
        };
        const results: { desaId: string; count: number }[] = [];
        for (const desa of desaRows ?? []) {
          results.push({ desaId: desa.id, count: await countForDesa(desa.id) });
        }
        return results;
      }),
  }),
  mitraProductionStock: router({
    list: supabaseProtectedProcedure.query(async ({ ctx }) => {
      const role = callerRole(ctx);
      if (role !== "mitra_umkm" && role !== "distributor" && role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Role ini tidak dapat melihat stok hasil produksi." });
      }

      const distributorId = getDistributorId(ctx.supabaseUser);
      if (!distributorId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Ruang kerja stok hasil produksi tidak ditemukan." });
      }

      let query = getSupabaseAdminClient()
        .from("mitra_production_stock")
        .select("id, distributor_id, mitra_user_id, product_id, available_quantity, created_at, updated_at, product:products(id, distributor_id, created_by_mitra_user_id, name, sku, unit, lifecycle_status, created_at, updated_at)")
        .eq("distributor_id", distributorId)
        .order("updated_at", { ascending: false });
      if (role === "mitra_umkm") query = query.eq("mitra_user_id", ctx.supabaseUser!.id);

      const { data, error } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stok hasil produksi belum dapat dimuat." });

      return (data ?? []).map((row) => {
        const product = row.product?.[0] ?? null;
        return {
          id: row.id,
          distributorId: row.distributor_id,
          mitraUserId: row.mitra_user_id,
          productId: row.product_id,
          availableQuantity: row.available_quantity,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          product: product ? {
            id: product.id,
            distributorId: product.distributor_id,
            createdByMitraUserId: product.created_by_mitra_user_id,
            name: product.name,
            sku: product.sku,
            unit: product.unit,
            lifecycleStatus: product.lifecycle_status,
            createdAt: product.created_at,
            updatedAt: product.updated_at,
          } : null,
        };
      });
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
        .select("id, product_id, name, sku, unit, stock_quantity, minimum_stock, updated_at, product:products(id, name, sku, unit, lifecycle_status)")
        .eq("mitra_user_id", ctx.supabaseUser.id)
        .eq("distributor_id", distributorId)
        .order("updated_at", { ascending: false });

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Daftar barang titipan belum dapat dimuat." });
      }

      const items = (data ?? []).map((item) => ({
        id: item.id,
        productId: item.product_id ?? null,
        name: item.name,
        sku: item.sku ?? null,
        unit: item.unit,
        stockQuantity: item.stock_quantity,
        minimumStock: item.minimum_stock,
        status: getStockStatus(item.stock_quantity, item.minimum_stock),
        updatedAt: item.updated_at,
        productName: item.product?.[0]?.name ?? null,
        productSku: item.product?.[0]?.sku ?? null,
        productUnit: item.product?.[0]?.unit ?? null,
      }));

      const stockChangeItems = items.filter((item) => item.productId && item.productName);

      return { items, stockChangeItems, summary: summarizeStock(items) };
    }),
  }),
});

export type AppRouter = typeof appRouter;
