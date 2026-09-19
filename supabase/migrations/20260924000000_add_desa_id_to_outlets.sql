-- ============================================================================
-- ADD DESA_ID TO OUTLETS
-- Adds administrative location (desa_id) to outlets
-- Forward-only, idempotent, backward compatible (nullable FK)
-- ============================================================================

-- ============================================================================
-- 1. ADD COLUMN: desa_id to outlets
-- ============================================================================
alter table public.outlets
  add column if not exists desa_id uuid;

-- Idempotent FK creation (PostgreSQL does not support ADD CONSTRAINT IF NOT EXISTS)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'outlets_desa_id_fkey'
      and conrelid = 'public.outlets'::regclass
  ) then
    alter table public.outlets
      add constraint outlets_desa_id_fkey
      foreign key (desa_id) references public.desa(id) on delete set null;
  end if;
end $$;

-- Index for join performance
create index if not exists outlets_desa_id_idx
  on public.outlets (desa_id);