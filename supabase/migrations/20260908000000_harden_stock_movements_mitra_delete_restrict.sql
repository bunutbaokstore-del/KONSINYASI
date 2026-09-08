-- PHASE 5 WS-002
-- Preserve the stock movement audit trail when a Mitra UMKM user is deleted.
-- Forward-only: the stock_movements.mitra_user_id FK is changed from
-- ON DELETE CASCADE to ON DELETE RESTRICT so that a user with stock history
-- can no longer be hard-deleted without losing the canonical audit trail.
alter table public.stock_movements
  drop constraint if exists stock_movements_mitra_user_id_fkey,
  add constraint stock_movements_mitra_user_id_fkey
    foreign key (mitra_user_id)
    references auth.users(id)
    on delete restrict;