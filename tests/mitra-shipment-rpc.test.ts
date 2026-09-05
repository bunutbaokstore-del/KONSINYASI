import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260905170446_create_mitra_shipments_and_ship_rpc.sql"), "utf8");
const routers = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");

describe("Phase 3B persistent Shipment contract", () => {
  it("defines the persistent shipment model without legacy supply request ownership", () => {
    expect(migration).toContain("create table if not exists public.mitra_shipments");
    expect(migration).toContain("product_id uuid not null references public.products(id)");
    expect(migration).toContain("consignment_item_id uuid not null references public.consignment_items(id)");
    expect(migration).toContain("status text not null default 'planned'");
    expect(migration).toContain("status in ('planned', 'shipped', 'received')");
    expect(migration).not.toContain("supply_request_id");
    expect(migration).not.toContain("Date.now");
    expect(migration).not.toContain("Math.random");
  });

  it("defines shipment movement idempotency and tenant-scoped RLS", () => {
    expect(migration).toContain("create table if not exists public.mitra_shipment_stock_movements");
    expect(migration).toContain("movement_type = 'shipment_shipped'");
    expect(migration).toContain("unique (shipment_id, movement_type)");
    expect(migration).toContain("alter table public.mitra_shipments enable row level security");
    expect(migration).toContain("alter table public.mitra_shipment_stock_movements enable row level security");
    expect(migration).not.toContain('USING (true)');
    expect(migration).not.toContain("public.stock_movements");
  });

  it("defines a security-definer atomic ship RPC with row locks and no receiving", () => {
    expect(migration).toContain("create or replace function public.ship_mitra_shipment(p_shipment_id uuid)");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog, public");
    expect(migration).toContain("from public.mitra_shipments");
    expect(migration).toContain("for update;");
    expect(migration).toContain("from public.mitra_production_stock");
    expect(migration).toContain("available_quantity = available_quantity - v_shipment.quantity");
    expect(migration).toContain("'shipment_shipped'");
    expect(migration).toContain("status = 'shipped'");
    expect(migration).not.toContain("distributor_stock");
    expect(migration).not.toContain("received_at =");
  });

  it("exposes tenant-scoped create, list, and ship procedures", () => {
    expect(routers).toContain("mitraShipments: router({");
    expect(routers).toContain("list: supabaseProtectedProcedure.query");
    expect(routers).toContain("create: supabaseProtectedProcedure");
    expect(routers).toContain("ship: supabaseProtectedProcedure");
    expect(routers).toContain('productId: z.string().uuid()');
    expect(routers).toContain('consignmentItemId: z.string().uuid()');
    expect(routers).toContain('rpc("ship_mitra_shipment"');
    expect(routers).toContain("getDistributorId(ctx.supabaseUser)");
    expect(routers).not.toContain("supplyRequestId: z.string().uuid()");
  });
});
