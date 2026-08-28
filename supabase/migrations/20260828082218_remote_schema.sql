ALTER TABLE "public"."notifications"
  DROP CONSTRAINT "notifications_notification_type_check";

ALTER TABLE "public"."notifications"
  ADD CONSTRAINT "notifications_notification_type_check"
    CHECK ((notification_type = ANY (ARRAY['request_pending'::text, 'request_approved'::text, 'request_rejected'::text, 'stock_updated'::text])));

