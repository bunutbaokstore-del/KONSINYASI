-- PHASE 4.2E
-- Harden Mitra mutation boundary for public.consignment_items.
-- Forward-only migration: do not modify previous migrations.

drop policy if exists "Mitra can insert own consignment items"
  on public.consignment_items;

drop policy if exists "Mitra can update own consignment items"
  on public.consignment_items;

drop policy if exists "Mitra can delete own consignment items"
  on public.consignment_items;
