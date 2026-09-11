-- 20260915000000_close_awaiting_distributor_decision_rows.sql
-- Data-fix: close legacy one-stage intermediate rows.
-- Workflow: Mitra -> Ajukan -> Admin -> Setujui/Tolak -> selesai. Distributor READ-ONLY.
-- 'awaiting_distributor_decision' was the old two-stage intermediate state. In the
-- one-stage flow it is a dead end (admin RPC requires 'pending'; distributor review
-- is FORBIDDEN in the server layer), so those rows are closed to 'rejected' with the
-- original review_note preserved for audit trail.
-- Idempotent + tenant-safe (targets status only). No RPC / workflow changes.

do $$
declare
  v_count int;
begin
  update public.consignment_requests
     set status = 'rejected',
         review_note = 'Ditutup karena alur keputusan final berubah ke one-stage'
                       || case
                            when nullif(trim(review_note), '') is not null
                              then ' Catatan sebelumnya: ' || trim(review_note)
                            else ''
                          end,
         reviewed_at = coalesce(reviewed_at, now()),
         admin_reviewed_at = coalesce(admin_reviewed_at, now()),
         updated_at = now()
   where status = 'awaiting_distributor_decision';

  get diagnostics v_count = row_count;
  raise notice 'consignment one-stage cleanup: % legacy row(s) closed', v_count;
end;
$$;

-- Prevent 'awaiting_distributor_decision' from being created again.
-- Compatible: no current writer can insert this status in the one-stage flow.
alter table public.consignment_requests
  drop constraint if exists consignment_requests_status_check;

alter table public.consignment_requests
  add constraint consignment_requests_status_check
    check (status in ('pending', 'approved', 'rejected'));