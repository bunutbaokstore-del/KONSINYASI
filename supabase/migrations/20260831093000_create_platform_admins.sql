-- AUTH-2.5: platform-level sys_admin identity membership.
-- This table is intentionally independent from tenant/distributor membership.
-- Initial membership provisioning must be performed by an approved server-only process.

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'disabled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

drop policy if exists "Sys admins can read own platform membership"
  on public.platform_admins;

create policy "Sys admins can read own platform membership"
  on public.platform_admins
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'sys_admin'
  );

create index if not exists platform_admins_status_idx
  on public.platform_admins (status);

comment on table public.platform_admins is
  'Platform-level sys_admin membership; not a tenant membership and never a source of distributor_id.';

comment on column public.platform_admins.user_id is
  'Trusted auth.users identity of the platform administrator.';

comment on column public.platform_admins.status is
  'Only active membership may pass the sysAdminProcedure platform guard.';