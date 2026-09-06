import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260905171834_create_distributor_stock_and_receiving_rpc.sql"), "utf8");
const routers = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
const productionScreen = readFileSync(resolve(process.cwd(), "app/(tabs)/production.tsx"), "utf8");
const receivingComponent = readFileSync(resolve(process.cwd(), "components/distributor-shipment-receiving.tsx"), "utf8");

describe("Phase 3D Distributor Stock and atomic receiving contract", () => {
  it("defines one Distributor Stock balance per Distributor and Product", () => {
    expect(migration).toContain("create table if not exists public.distributor_stock");
    expect(migration).toContain("distributor_id uuid not null references auth.users(id)");
    expect(migration).toContain("product_id uuid not null references public.products(id)");
    expect(migration).toContain("available_quantity integer not null default 0");
    expect(migration).toContain("available_quantity >= 0");
    expect(migration).toContain("unique (distributor_id, product_id)");
    expect(migration).not.toContain("insert into public.distributor_stock (distributor_id, product_id, available_quantity) values");
  });

  it("keeps stock and receiving ledgers server-authoritative", () => {
    expect(migration).toContain("alter table public.distributor_stock enable row level security");
    expect(migration).toContain("alter table public.mitra_shipment_receiving_movements enable row level security");
    expect(migration).toContain("Distributor can read own stock");
    expect(migration).toContain("Admin can read workspace stock");
    expect(migration).toContain("Distributor can read own receiving movements");
    expect(migration).toContain("Admin can read workspace receiving movements");
    expect(migration).not.toContain("for insert to authenticated");
    expect(migration).not.toContain("for update to authenticated");
    expect(migration).not.toContain("for delete to authenticated");
  });

  it("defines a separate receiving ledger with exactly-once reference", () => {
    expect(migration).toContain("create table if not exists public.mitra_shipment_receiving_movements");
    expect(migration).toContain("shipment_id uuid not null references public.mitra_shipments(id)");
    expect(migration).toContain("movement_type text not null check (movement_type = 'shipment_received')");
    expect(migration).toContain("quantity integer not null check (quantity > 0)");
    expect(migration).toContain("unique (shipment_id, movement_type)");
    expect(migration).not.toContain("public.stock_movements");
    expect(migration).not.toContain("public.mitra_shipment_stock_movements");
    expect(migration).not.toContain("public.mitra_production_stock_movements");
  });

  it("defines Distributor-only atomic receive RPC without production deduction", () => {
    expect(migration).toContain("create or replace function public.receive_mitra_shipment(p_shipment_id uuid)");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog, public");
    expect(migration).toContain("v_role <> 'distributor'");
    expect(migration).toContain("distributor_id = v_distributor_id");
    expect(migration).toContain("status = 'shipped'");
    expect(migration).toContain("for update;");
    expect(migration).toContain("available_quantity = available_quantity + v_shipment.quantity");
    expect(migration).toContain("status = 'received'");
    expect(migration).toContain("received_by = v_distributor_id");
    expect(migration).toContain("'shipment_received'");
    expect(migration).not.toContain("mitra_production_stock");
    expect(migration).not.toContain("shipment_shipped");
  });

  it("exposes Distributor-only tRPC receive and minimal UI action", () => {
    expect(routers).toContain("distributorReceiving: router({");
    expect(routers).toContain("receive: supabaseProtectedProcedure");
    expect(routers).toContain("requireDistributorReceivingContext(ctx)");
    expect(routers).toContain('rpc("receive_mitra_shipment"');
    expect(routers).toContain('shipmentId: z.string().uuid()');
    expect(routers).not.toContain("quantity: z.number().int().positive()" + " // receiving");
    expect(productionScreen).toContain("DistributorShipmentReceiving");
    expect(productionScreen).toContain("isDistributor");
    expect(receivingComponent).toContain("trpc.distributorReceiving.receive.useMutation");
    expect(receivingComponent).toContain("shipment.status === \"shipped\"");
  });
});
