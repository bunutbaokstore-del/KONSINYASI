import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260905165106_create_mitra_production_stock_rpc.sql"),
  "utf8",
);

describe("Production Event to Production Stock RPC contract", () => {
  it("uses a production-specific movement reference with one movement per event", () => {
    expect(migration).toContain("create table if not exists public.mitra_production_stock_movements");
    expect(migration).toContain("production_event_id uuid not null references public.mitra_production_events(id)");
    expect(migration).toContain("movement_type text not null check (movement_type = 'production_completed')");
    expect(migration).toContain("quantity integer not null check (quantity > 0)");
    expect(migration).toContain("unique (production_event_id, movement_type)");
    expect(migration).not.toContain("public.stock_movements");
  });

  it("locks the event and balance, then increments and records the reference", () => {
    expect(migration).toContain("create or replace function public.complete_mitra_production_event");
    expect(migration).toContain("for update;");
    expect(migration).toContain("on conflict (distributor_id, mitra_user_id, product_id) do nothing");
    expect(migration).toContain("set available_quantity = v_stock.available_quantity + v_event.actual_quantity");
    expect(migration).toContain("insert into public.mitra_production_stock_movements");
  });

  it("returns an idempotent result when the movement already exists", () => {
    expect(migration).toContain("v_idempotent := true");
    expect(migration).toContain("return query select v_event.id, v_event.status, v_event.actual_quantity, coalesce(v_stock.available_quantity, 0), v_movement.id, true");
    expect(migration).toContain("grant execute on function public.complete_mitra_production_event");
  });

  it("keeps tenant and Product Master validation inside the server-side function", () => {
    expect(migration).toContain("v_mitra_user_id uuid := auth.uid()");
    expect(migration).toContain("v_role <> 'mitra_umkm'");
    expect(migration).toContain("lifecycle_status = 'active'");
    expect(migration).toContain("product_id = v_event.product_id");
    expect(migration).toContain("mitra_user_id = v_event.mitra_user_id");
    expect(migration).toContain("distributor_id = v_event.distributor_id");
  });
});
