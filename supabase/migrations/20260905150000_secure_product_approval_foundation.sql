-- Product approval foundation: Distributor-only review and tenant-scoped Admin notices.
-- This migration is additive/non-destructive and preserves existing notification types.

alter table public.notifications
  drop constraint if exists notifications_notification_type_check;

alter table public.notifications
  add constraint notifications_notification_type_check
    check (notification_type = any (array[
      'request_pending'::text,
      'request_approved'::text,
      'request_rejected'::text,
      'stock_updated'::text
    ]));

drop policy if exists "Admin can review workspace consignment requests"
  on public.consignment_requests;

drop policy if exists "Distributor can review workspace consignment requests"
  on public.consignment_requests;

create policy "Distributor can review workspace consignment requests"
  on public.consignment_requests for update to authenticated
  using (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'distributor'
    and auth.uid() = distributor_id
  )
  with check (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'distributor'
    and auth.uid() = distributor_id
    and status in ('approved', 'rejected')
    and reviewed_by = auth.uid()
  );

drop policy if exists "Admin can notify workspace distributor"
  on public.notifications;

create policy "Admin can notify workspace distributor"
  on public.notifications for insert to authenticated
  with check (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
    and auth.jwt() -> 'app_metadata' ->> 'distributor_id' = distributor_id::text
    and recipient_user_id = distributor_id
    and request_id is not null
    and notification_type = 'request_pending'
    and exists (
      select 1
        from public.consignment_requests request
       where request.id = notifications.request_id
         and request.distributor_id = notifications.distributor_id
         and request.status = 'pending'
    )
  );
