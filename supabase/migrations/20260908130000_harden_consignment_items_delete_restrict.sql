-- PHASE 5 OPEN-1
-- Preserve stock_movements audit trail and consignment_requests when a
-- consignment_item is deleted.
-- Forward-only migration: do not modify the original migration.

-- Keep the stock movement audit trail on item deletion (mirror WS-002).
alter table public.stock_movements
  drop constraint stock_movements_item_id_fkey,
  add constraint stock_movements_item_id_fkey
     foreign key (item_id) references public.consignment_items(id)
     on delete restrict;

-- Keep submitted/pending consignment requests on item deletion.
alter table public.consignment_requests
  drop constraint consignment_requests_item_id_fkey,
  add constraint consignment_requests_item_id_fkey
     foreign key (item_id) references public.consignment_items(id)
     on delete restrict;

-- mitra_shipments.consignment_item_id already uses ON DELETE RESTRICT and is
-- intentionally left unchanged.