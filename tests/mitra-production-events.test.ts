import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260905164153_create_mitra_production_events.sql"),
  "utf8",
);

describe("Persistent Mitra Production Event foundation", () => {
  it("defines the locked event identity, lifecycle, and quantity rules", () => {
    expect(migration).toContain("create table if not exists public.mitra_production_events");
    expect(migration).toContain("id uuid primary key default gen_random_uuid()");
    expect(migration).toContain("status text not null default 'planned'");
    expect(migration).toContain("status in ('planned', 'completed')");
    expect(migration).toContain("target_quantity integer not null default 0 check (target_quantity >= 0)");
    expect(migration).toContain("actual_quantity integer check (actual_quantity >= 0)");
    expect(migration).toContain("damaged_quantity integer not null default 0 check (damaged_quantity >= 0)");
    expect(migration).toContain("completed_at timestamptz");
    expect(migration).toContain("status = 'completed' and actual_quantity is not null and actual_quantity > 0 and completed_at is not null");
  });

  it("protects completed events and keeps stock increment outside Phase 2A.2", () => {
    expect(migration).toContain("prevent_completed_mitra_production_event_mutation");
    expect(migration).toContain("Completed production events are immutable.");
    expect(migration).not.toContain("available_quantity");
    expect(migration).not.toContain("mitra_production_stock set");
    expect(migration).not.toContain("stock_movements");
  });

  it("declares tenant-scoped read policies without client write policies", () => {
    expect(migration).toContain("Mitra can read own production events");
    expect(migration).toContain("Distributor can read workspace production events");
    expect(migration).toContain("Admin can read workspace production events");
    expect(migration).toContain("No client INSERT/UPDATE/DELETE policies");
    expect(migration).toContain("auth.uid() = mitra_user_id");
    expect(migration).toContain("auth.uid() = distributor_id");
  });
});
