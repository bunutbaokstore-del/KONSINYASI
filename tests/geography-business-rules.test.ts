import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

function read(relative: string): string {
  return readFileSync(resolve(root, relative), "utf8").replace(/\r\n/g, "\n");
}

const routersSrc = read("server/routers.ts");
const geographyMigration = read("supabase/migrations/20260926020001_sysadmin_geography_restore_parent_active_check.sql");
const managementMigration = read("supabase/migrations/20260922132718_sysadmin_master_geography_management.sql");
const createRPCsMigration = read("supabase/migrations/20260926020000_sysadmin_master_geography_rpcs.sql");

function sliceProcedure(src: string, name: string, nextName: string): string {
  const start = src.indexOf(`${name}: sysAdminProcedure`);
  if (start < 0) return "";
  const end = src.indexOf(`${nextName}: sysAdminProcedure`);
  if (end < 0 || end <= start) return src.slice(start);
  return src.slice(start, end);
}

const distBlock = routersSrc.slice(
  routersSrc.indexOf("distribution: router({"),
  routersSrc.indexOf("mitraProductionStock: router({")
);

const geoBlock = routersSrc.slice(
  routersSrc.indexOf("geography: router({"),
  routersSrc.indexOf("registration: router({")
);

const createProvinsi = sliceProcedure(routersSrc, "createProvinsi", "createKabupatenKota");
const createKabupatenKota = sliceProcedure(routersSrc, "createKabupatenKota", "createKecamatan");
const createKecamatan = sliceProcedure(routersSrc, "createKecamatan", "createDesa");
const createDesa = sliceProcedure(routersSrc, "createDesa", "updateProvinsi");
const updateProvinsi = sliceProcedure(routersSrc, "updateProvinsi", "updateKabupatenKota");
const updateKabupatenKota = sliceProcedure(routersSrc, "updateKabupatenKota", "updateKecamatan");
const updateKecamatan = sliceProcedure(routersSrc, "updateKecamatan", "updateDesa");
const updateDesa = sliceProcedure(routersSrc, "updateDesa", "setProvinsiActive");
const deleteProvinsi = sliceProcedure(routersSrc, "deleteProvinsi", "deleteKabupatenKota");
const deleteKabupatenKota = sliceProcedure(routersSrc, "deleteKabupatenKota", "deleteKecamatan");
const deleteKecamatan = sliceProcedure(routersSrc, "deleteKecamatan", "deleteDesa");
const deleteDesa = sliceProcedure(routersSrc, "deleteDesa", "registration");

describe("Master Geography Business Rules (Phase 1C.9A)", () => {
  describe("Parent Active Validation - Create RPCs (Migration 20260926020001)", () => {
    it("create_kabupaten_kota rejects inactive provinsi (22003)", () => {
      expect(geographyMigration).toMatch(/if not v_provinsi\.is_active then/);
      expect(geographyMigration).toMatch(/errcode = '22003'/);
      expect(geographyMigration).toMatch(/Tidak dapat membuat Kabupaten\/Kota di Provinsi yang tidak aktif/);
    });

    it("create_kecamatan rejects inactive kabupaten/kota (22003)", () => {
      expect(geographyMigration).toMatch(/if not v_kab\.is_active then/);
      expect(geographyMigration).toMatch(/errcode = '22003'/);
      expect(geographyMigration).toMatch(/Tidak dapat membuat Kecamatan di Kabupaten\/Kota yang tidak aktif/);
    });

    it("create_desa rejects inactive kabupaten/kota (22003)", () => {
      expect(geographyMigration).toMatch(/if not v_kab\.is_active then/);
      expect(geographyMigration).toMatch(/Tidak dapat membuat Desa di Kabupaten\/Kota yang tidak aktif/);
    });

    it("create_desa rejects inactive kecamatan (22003)", () => {
      expect(geographyMigration).toMatch(/if not v_kec\.is_active then/);
      expect(geographyMigration).toMatch(/errcode = '22003'/);
      expect(geographyMigration).toMatch(/Tidak dapat membuat Desa di Kecamatan yang tidak aktif/);
    });

    it("create_desa rejects kecamatan not belonging to selected kabupaten/kota (22003)", () => {
      expect(geographyMigration).toMatch(/v_kec\.kabupaten_kota_id <> p_kabupaten_kota_id/);
      expect(geographyMigration).toMatch(/errcode = '22003'/);
      expect(geographyMigration).toMatch(/Kecamatan tidak berada di Kabupaten\/Kota ini/);
    });
  });

  describe("Delete Safety - Geography RPCs (Migration 20260922132718)", () => {
    it("delete_provinsi blocks if kabupaten/kota exists (22003)", () => {
      expect(managementMigration).toMatch(/v_child_count > 0/);
      expect(managementMigration).toMatch(/errcode = '22003'/);
      expect(managementMigration).toMatch(/Provinsi tidak dapat dihapus karena masih memiliki Kabupaten\/Kota/);
    });

    it("delete_kabupaten_kota blocks if kecamatan exists (22003)", () => {
      expect(managementMigration).toMatch(/v_kec_count > 0/);
      expect(managementMigration).toMatch(/errcode = '22003'/);
      expect(managementMigration).toMatch(/Kabupaten\/Kota tidak dapat dihapus karena masih memiliki Kecamatan/);
    });

    it("delete_kabupaten_kota blocks if desa exists (22003)", () => {
      expect(managementMigration).toMatch(/v_desa_count > 0/);
      expect(managementMigration).toMatch(/Kabupaten\/Kota tidak dapat dihapus karena masih memiliki Desa/);
    });

    it("delete_kecamatan blocks if desa exists (22003)", () => {
      expect(managementMigration).toMatch(/v_desa_count > 0/);
      expect(managementMigration).toMatch(/Kecamatan tidak dapat dihapus karena masih memiliki Desa/);
    });

    it("delete_desa blocks if wilayah_desa assignment exists (22003)", () => {
      expect(managementMigration).toMatch(/v_wilayah_desa_count > 0/);
      expect(managementMigration).toMatch(/from public\.wilayah_desa/);
      expect(managementMigration).toMatch(/where desa_id = p_id/);
      expect(managementMigration).toMatch(/Desa\/Kelurahan tidak dapat dihapus karena masih digunakan pada Wilayah/);
    });

    it("delete_desa allows delete if no wilayah_desa (outlets survive via ON DELETE SET NULL)", () => {
      expect(managementMigration).toMatch(/outlets\.desa_id is ON DELETE SET NULL/);
      expect(managementMigration).toMatch(/outlets survive/);
    });
  });

  describe("Edit Parent Safety - Update RPCs (Migration 20260922132718)", () => {
    it("update_provinsi does not accept parent modification (no parent)", () => {
      const updateProvinsi = sliceProcedure(routersSrc, "updateProvinsi", "updateKabupatenKota");
      expect(updateProvinsi).not.toMatch(/provinsiId|provinsi_id/);
    });

    it("update_kabupaten_kota does not accept provinsi_id", () => {
      expect(updateKabupatenKota).not.toMatch(/provinsiId|provinsi_id/);
      expect(updateKabupatenKota).toMatch(/p_nama/);
      expect(updateKabupatenKota).toMatch(/p_tipe/);
    });

    it("update_kecamatan does not accept kabupaten_kota_id", () => {
      expect(updateKecamatan).not.toMatch(/kabupatenKotaId|kabupaten_kota_id/);
      expect(updateKecamatan).toMatch(/p_nama/);
    });

    it("update_desa does not accept kabupaten_kota_id or kecamatan_id", () => {
      expect(updateDesa).not.toMatch(/kabupatenKotaId|kabupaten_kota_id/);
      expect(updateDesa).not.toMatch(/kecamatanId|kecamatan_id/);
      expect(updateDesa).toMatch(/p_nama/);
      expect(updateDesa).toMatch(/p_kode_pos/);
    });
  });

  describe("Active/Inactive Filter - List Queries", () => {
    it("listProvinsi supports filter parameter (active/inactive/all)", () => {
      expect(distBlock).toContain("listProvinsi");
      expect(distBlock).toMatch(/filter.*active.*inactive.*all/);
    });

    it("listKabupatenKota supports filter parameter", () => {
      expect(distBlock).toContain("listKabupatenKota");
      expect(distBlock).toMatch(/filter.*active.*inactive.*all/);
    });

    it("listKecamatan supports filter parameter", () => {
      expect(distBlock).toContain("listKecamatan");
      expect(distBlock).toMatch(/filter.*active.*inactive.*all/);
    });

    it("listDesa supports filter parameter", () => {
      expect(distBlock).toContain("listDesa");
      expect(distBlock).toMatch(/filter.*active.*inactive.*all/);
    });

    it("default filter is active", () => {
      expect(distBlock).toMatch(/filter.*\?\?\s*"active"/);
    });

    it("active filter applies is_active = true", () => {
      expect(distBlock).toMatch(/\.eq\("is_active", true\)/);
    });

    it("inactive filter applies is_active = false", () => {
      expect(distBlock).toMatch(/\.eq\("is_active", false\)/);
    });

    it("list queries return isActive field for all levels", () => {
      expect(distBlock).toMatch(/isActive.*is_active/);
    });
  });

  describe("Delete RPC Coverage - Geography tRPC", () => {
    it("deleteProvinsi exists with sysAdminProcedure", () => {
      expect(deleteProvinsi).toContain("deleteProvinsi");
      expect(deleteProvinsi).toContain("sysAdminProcedure");
      expect(deleteProvinsi).toContain("delete_provinsi");
      expect(deleteProvinsi).toMatch(/p_actor_id: ctx\.supabaseUser\.id/);
    });

    it("deleteKabupatenKota exists with sysAdminProcedure", () => {
      expect(deleteKabupatenKota).toContain("deleteKabupatenKota");
      expect(deleteKabupatenKota).toContain("sysAdminProcedure");
      expect(deleteKabupatenKota).toContain("delete_kabupaten_kota");
    });

    it("deleteKecamatan exists with sysAdminProcedure", () => {
      expect(deleteKecamatan).toContain("deleteKecamatan");
      expect(deleteKecamatan).toContain("sysAdminProcedure");
      expect(deleteKecamatan).toContain("delete_kecamatan");
    });

    it("deleteDesa exists with sysAdminProcedure", () => {
      expect(deleteDesa).toContain("deleteDesa");
      expect(deleteDesa).toContain("sysAdminProcedure");
      expect(deleteDesa).toContain("delete_desa");
    });

    it("all delete procedures use sysAdminProcedure", () => {
      const geoBlock2 = routersSrc.slice(
        routersSrc.indexOf("geography: router({"),
        routersSrc.indexOf("registration: router({")
      );
      expect(geoBlock2).toMatch(/deleteProvinsi: sysAdminProcedure/);
      expect(geoBlock2).toMatch(/deleteKabupatenKota: sysAdminProcedure/);
      expect(geoBlock2).toMatch(/deleteKecamatan: sysAdminProcedure/);
      expect(geoBlock2).toMatch(/deleteDesa: sysAdminProcedure/);
    });

    it("delete procedures map 22003 to BAD_REQUEST", () => {
      expect(deleteProvinsi).toMatch(/error\.code === "22003"/);
      expect(deleteKabupatenKota).toMatch(/error\.code === "22003"/);
      expect(deleteKecamatan).toMatch(/error\.code === "22003"/);
      expect(deleteDesa).toMatch(/error\.code === "22003"/);
    });
  });

  describe("Outlet Survives Desa Deletion", () => {
    it("outlets.desa_id FK is ON DELETE SET NULL", () => {
      const desaIdMigration = read("supabase/migrations/20260924000000_add_desa_id_to_outlets.sql");
      expect(desaIdMigration).toMatch(/on delete set null/);
    });

    it("delete_desa RPC does not manually null outlet.desa_id", () => {
      const deleteDesaStart = managementMigration.indexOf("create or replace function public.delete_desa");
      const deleteDesaMigration = managementMigration.slice(deleteDesaStart);
      // The RPC relies on ON DELETE SET NULL FK constraint, not manual nulling
      // Check that there's no UPDATE statement that manually sets outlet.desa_id to null
      expect(deleteDesaMigration).not.toMatch(/update.*outlet.*desa_id.*null/i);
      expect(deleteDesaMigration).not.toMatch(/outlet\.desa_id\s*=\s*null/i);
      // The comment documents the FK behavior
      expect(deleteDesaMigration).toMatch(/outlets\.desa_id is ON DELETE SET NULL/);
    });
  });
});