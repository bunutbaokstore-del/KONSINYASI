import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const routersFile = resolve(process.cwd(), "server/routers.ts");

function readRouters(): string {
  return readFileSync(routersFile, "utf8");
}

function distributionBlock(): string[] {
  const src = readRouters();
  const start = src.indexOf("distribution: router({");
  const end = src.indexOf("mitraProductionStock: router({");
  return src.slice(start, end).split("\n");
}

const procedures = [
  "listWilayah",
  "getWilayah",
  "createWilayah",
  "updateWilayah",
  "setWilayahActive",
  "listRute",
  "createRute",
  "getRute",
  "updateRute",
  "setRuteActive",
  "listOutlet",
  "createOutlet",
  "updateOutlet",
  "setOutletActive",
  "listSales",
  "assignOutletToRute",
  "reassignOutlet",
  "assignSalesToRute",
  "reassignSales",
  "getAssignmentHistory",
];

describe("Distribution router authorization invariants (TEST A1-A4)", () => {
  it("TEST A1 exposes the distribution router before mitraProductionStock/mitraDashboard (block boundary = {name:})", () => {
    const src = readRouters();
    expect(src.indexOf("distribution: router({")).toBeGreaterThan(-1);
    expect(src.indexOf("distribution: router({")).toBeLessThan(src.indexOf("mitraProductionStock: router({"));
    expect(src.indexOf("mitraProductionStock: router({")).toBeLessThan(src.indexOf("mitraDashboard: router({"));
  });

  it("TEST A2 guards every distribution procedure with the admin tenant procedure (tenant-scoped admin-only)", () => {
    const block = distributionBlock().join("\n");
    for (const name of procedures) {
      expect(block).toMatch(new RegExp(name + ": adminTenantProcedure\\.(query|mutation)"));
    }
  });

  it("TEST A3 asserts the tenant scope was not widened: no bare publicProcedure / authedProcedure inside the distribution router", () => {
    const moved = distributionBlock()
      .join("\n")
      .replace(/adminTenantProcedure\.(query|mutation)/g, "");
    expect(moved).not.toMatch(/publicProcedure\.(query|mutation)/);
    expect(moved).not.toMatch(/authedProcedure\.(query|mutation)/);
  });

  it("TEST A4 verifies the adminTenantProcedure guard lives behind the authz core (FORBIDDEN for non-admin, requires a distributor workspace)", () => {
    const core = readFileSync(resolve(process.cwd(), "server/_core/trpc.ts"), "utf8");
    expect(core).toMatch(/adminTenantProcedure\s*=\s*adminTenantMiddleware/);
    expect(core).toMatch(/adminTenantMiddleware/);
  });
});
