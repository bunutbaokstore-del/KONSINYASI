import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const migrationsDir = resolve(process.cwd(), "supabase/migrations");

function listMigrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

const SEC_01_SUFFIX = "harden_consignment_requests_update_admin_only.sql";

const createPolicyRe =
  /create\s+policy\s+"([^"]+)"\s+on\s+public\.consignment_requests\s+for\s+(select|insert|update|all)/gi;
const dropPolicyRe = /drop\s+policy\s+(?:if\s+exists\s+)?"([^"]+)"\s+on\s+public\.consignment_requests/gi;

function replayPolicyLifecycle() {
  const updateByName = new Map<string, string>();
  const selectByName = new Map<string, string>();
  const insertByName = new Map<string, string>();

  for (const file of listMigrationFiles()) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");

    const events: { index: number; kind: "create" | "drop"; name: string; command?: string; body?: string }[] = [];

    createPolicyRe.lastIndex = 0;
    let create: RegExpExecArray | null;
    while ((create = createPolicyRe.exec(sql))) {
      const [, name, command] = create;
      const start = create.index + create[0].length;
      const end = sql.indexOf(";", start);
      events.push({
        index: create.index,
        kind: "create",
        name,
        command,
        body: sql.slice(start, end === -1 ? sql.length : end),
      });
    }

    dropPolicyRe.lastIndex = 0;
    let drop: RegExpExecArray | null;
    while ((drop = dropPolicyRe.exec(sql))) {
      events.push({ index: drop.index, kind: "drop", name: drop[1] });
    }

    events.sort((a, b) => a.index - b.index);

    for (const event of events) {
      if (event.kind === "drop") {
        updateByName.delete(event.name);
        selectByName.delete(event.name);
        insertByName.delete(event.name);
        continue;
      }
      if (!event.command || event.body === undefined) continue;
      if (event.command === "all") {
        updateByName.set(event.name, event.body);
        selectByName.set(event.name, event.body);
        insertByName.set(event.name, event.body);
      } else if (event.command === "update") {
        updateByName.set(event.name, event.body);
      } else if (event.command === "select") {
        selectByName.set(event.name, event.body);
      } else {
        insertByName.set(event.name, event.body);
      }
    }
  }

  return { updateByName, selectByName, insertByName };
}

describe("SEC-01 consignment_requests UPDATE RLS hardening", () => {
  it("final UPDATE policies grant only Admin, tenant-scoped (TEST 1,2,3,6,8)", () => {
    const { updateByName } = replayPolicyLifecycle();

    expect([...updateByName.keys()].sort()).toEqual(["Admin can update tenant consignment requests"]);

    const body = updateByName.get("Admin can update tenant consignment requests") ?? "";
    expect(body).toMatch(/'admin'/);
    expect(body).toMatch(/distributor_id/);
    expect(body).not.toMatch(/mitra_umkm/);
    expect(body).not.toMatch(/\b(distributor|mitra_umkm)\b/);
    expect(body).toContain("with check (");
  });

  it("WITH CHECK prevents moving a request to another tenant (TEST 5)", () => {
    const { updateByName } = replayPolicyLifecycle();
    const body = updateByName.get("Admin can update tenant consignment requests") ?? "";
    const withCheck = body.split("with check (")[1] ?? "";
    expect(withCheck).toMatch(/'admin'/);
    expect(withCheck).toMatch(/distributor_id::text/);
  });

  it("keeps the Admin RPC as the official decision path without RLS interference (TEST 4)", () => {
    const files = listMigrationFiles();
    const rpcFile = files.find((file) => file.includes("admin_review_consignment_one_stage"));
    expect(rpcFile).toBeTruthy();
    const sql = readFileSync(join(migrationsDir, rpcFile!), "utf8");
    expect(sql).toContain("security definer");
    expect(sql).toContain("revoke all on function public.admin_review_consignment_request");
    expect(sql).toContain("grant execute on function public.admin_review_consignment_request");
  });

  it("preserves Distributor SELECT within tenant boundary (TEST 7)", () => {
    const { selectByName } = replayPolicyLifecycle();
    const adminPolicy = selectByName.get("Admin can read workspace consignment requests") ?? "";
    expect(adminPolicy).toMatch(/'distributor'/);
    expect(adminPolicy).toMatch(/auth\.uid\(\) = distributor_id/);
    expect(selectByName.has("Supplier can read own scoped requests")).toBe(true);
  });

  it("SEC-01 migration exists and sorts after all existing migrations (forward-only)", () => {
    const files = listMigrationFiles();
    const sec01 = files.find((file) => file.endsWith(SEC_01_SUFFIX));
    expect(sec01).toBeTruthy();
    expect(files[files.length - 1]).toBe(sec01);

    const sql = readFileSync(join(migrationsDir, sec01!), "utf8");
    expect(sql).toContain("drop policy if exists \"Manager can review tenant consignment requests\"");
    expect(sql).toContain("drop policy if exists \"Distributor can review workspace consignment requests\"");
    expect(sql).toContain("drop policy if exists \"Admin can review workspace consignment requests\"");
    expect(sql).toContain("create policy \"Admin can update tenant consignment requests\"");
    expect(sql).toContain("for update");
    expect(sql).toContain("to authenticated");
    expect(sql).toContain("revoke update on public.consignment_requests from anon");
  });
});