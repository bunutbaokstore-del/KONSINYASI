import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

function read(relative: string): string {
  return readFileSync(resolve(root, relative), "utf8").replace(/\r\n/g, "\n");
}

const routersSrc = read("server/routers.ts");
const geographySrc = read("app/admin-sys/geography.tsx");

const distBlock = routersSrc.slice(
  routersSrc.indexOf("distribution: router({"),
  routersSrc.indexOf("mitraProductionStock: router({")
);

function sliceCountProcedure(src: string, name: string, nextName: string): string {
  const start = src.indexOf(`${name}: publicProcedure`);
  if (start < 0) return "";
  const endIndex = src.indexOf(`${nextName}: publicProcedure`);
  const end = endIndex > start ? endIndex : src.indexOf("mitraProductionStock: router({");
  return src.slice(start, end);
}

const outletByProvinsi = sliceCountProcedure(routersSrc, "listOutletCountByProvinsi", "listOutletCountByKabupatenKota");
const outletByKabupaten = sliceCountProcedure(routersSrc, "listOutletCountByKabupatenKota", "listOutletCountByKecamatan");
const outletByKecamatan = sliceCountProcedure(routersSrc, "listOutletCountByKecamatan", "listOutletCountByDesa");
const outletByDesa = sliceCountProcedure(routersSrc, "listOutletCountByDesa", "mitraProductionStock");

const procedureNames = [
  "listOutletCountByProvinsi",
  "listOutletCountByKabupatenKota",
  "listOutletCountByKecamatan",
  "listOutletCountByDesa",
];

describe("Master Geography Outlet Count (READ-ONLY, no schema change)", () => {
  it("adds all 4 outlet count procedures to the distribution router", () => {
    for (const name of procedureNames) {
      expect(distBlock).toContain(`${name}: publicProcedure`);
    }
  });

  it("each outlet count procedure is READ-ONLY (no insert/update/delete/rpc)", () => {
    for (const block of [outletByProvinsi, outletByKabupaten, outletByKecamatan, outletByDesa]) {
      expect(block).not.toMatch(/\.insert\(/);
      expect(block).not.toMatch(/\.update\(/);
      expect(block).not.toMatch(/\.delete\(/);
      expect(block).not.toMatch(/\.rpc\(/);
    }
  });

  it("counts outlets only via public.outlets with count exact + head (no pagination)", () => {
    for (const block of [outletByProvinsi, outletByKabupaten, outletByKecamatan, outletByDesa]) {
      expect(block).toContain('.from("outlets")');
      expect(block).toMatch(/\.select\("id", \{ count: "exact", head: true \}\)\s*\.(in|eq)\("desa_id"/);
      expect(block).not.toMatch(/\.range\(/);
      expect(block).not.toMatch(/limit\(/);
    }
  });

  it("counts only outlets with desa_id IS NOT NULL", () => {
    for (const block of [outletByProvinsi, outletByKabupaten, outletByKecamatan]) {
      expect(block).toMatch(/\.in\("desa_id", desaIds\)/);
      expect(block).toMatch(/\.not\("desa_id", "is", null\)/);
    }
    expect(outletByDesa).toMatch(/\.eq\("desa_id", desaId\)/);
  });

  it("applies the geography filter on desa.is_active, never outlets.status", () => {
    for (const block of [outletByProvinsi, outletByKabupaten, outletByKecamatan, outletByDesa]) {
      expect(block).toMatch(/\.eq\("is_active", true\)/);
      expect(block).toMatch(/\.eq\("is_active", false\)/);
      expect(block).not.toMatch(/\.eq\("status",/);
      expect(block).not.toMatch(/"ACTIVE"|"INACTIVE"/);
    }
  });

  it("defaults the filter to 'active' like the existing geography count procedures", () => {
    for (const block of [outletByProvinsi, outletByKabupaten, outletByKecamatan, outletByDesa]) {
      expect(block).toMatch(/input\?\.filter \?\? "active"/);
    }
  });

  it("listOutletCountByProvinsi supports optional provinsiId + grouped mode over all provinsi", () => {
    expect(outletByProvinsi).toMatch(/provinsiId: z\.string\(\)\.uuid\(\)\.optional\(\)/);
    expect(outletByProvinsi).toMatch(/from\("provinsi"\)\.select\("id"\)/);
    expect(outletByProvinsi).toMatch(/\{ provinsiId: row\.id, count: await countForProvinsi\(row\.id\) \}/);
  });

  it("child procedures require the parent id (provinsi/kabupaten/kecamatan inputs)", () => {
    expect(outletByKabupaten).toMatch(/provinsiId: z\.string\(\)\.uuid\(\)/);
    expect(outletByKecamatan).toMatch(/kabupatenKotaId: z\.string\(\)\.uuid\(\)/);
    expect(outletByDesa).toMatch(/kecamatanId: z\.string\(\)\.uuid\(\)/);
  });

  it("resolves the desa set from the geography parent (no cross-provinsi outlet counting)", () => {
    expect(outletByProvinsi).toMatch(/\.from\("kabupaten_kota"\)\s*\n\s*\.select\("id"\)\s*\n\s*\.eq\("provinsi_id", provinsiId\)/);
    expect(outletByKabupaten).toMatch(/\.from\("kabupaten_kota"\)\s*\n\s*\.select\("id"\)\s*\n\s*\.eq\("provinsi_id", input\.provinsiId\)/);
    expect(outletByKecamatan).toMatch(/\.from\("kecamatan"\)\s*\n\s*\.select\("id"\)\s*\n\s*\.eq\("kabupaten_kota_id", input\.kabupatenKotaId\)/);
    expect(outletByDesa).toMatch(/\.from\("desa"\)\s*\.select\("id"\)\s*\.eq\("kecamatan_id", input\.kecamatanId\)/);
  });

  it("does not touch tenant/rute/wilayah/assignment data in the count path", () => {
    for (const block of [outletByProvinsi, outletByKabupaten, outletByKecamatan, outletByDesa]) {
      expect(block).not.toMatch(/distributor_id/);
      expect(block).not.toMatch(/wilayah_desa|"rute"|"rute_outlet_assignments"/);
    }
  });

  it("surfaces errors instead of masking them and returns count ?? 0", () => {
    for (const block of [outletByProvinsi, outletByKabupaten, outletByKecamatan, outletByDesa]) {
      expect(block).toMatch(/Jumlah Outlet belum dapat dimuat/);
      expect(block).toMatch(/count \?\? 0/);
    }
  });

  it("wires all 4 outlet count queries in the Master Geography UI at their drill-down level", () => {
    expect(geographySrc).toContain("trpc.distribution.listOutletCountByProvinsi.useQuery");
    expect(geographySrc).toContain("trpc.distribution.listOutletCountByKabupatenKota.useQuery");
    expect(geographySrc).toContain("trpc.distribution.listOutletCountByKecamatan.useQuery");
    expect(geographySrc).toContain("trpc.distribution.listOutletCountByDesa.useQuery");
  });

  it("renders an Outlet badge at all four levels without any new icon type", () => {
    expect(geographySrc).toMatch(/\{outletCount\} Outlet/);
    expect(geographySrc).toMatch(/outletCountByKabMap\.get\(item\.id\) \?\? 0\} Outlet/);
    expect(geographySrc).toMatch(/outletCountByKecMap\.get\(item\.id\) \?\? 0\} Outlet/);
    expect(geographySrc).toMatch(/outletCountByDesaMap\.get\(item\.id\) \?\? 0\} Outlet/);
    expect(geographySrc).toMatch(/name="cart"/);
  });
});