CREATE OR REPLACE FUNCTION public.prevent_consignment_request_scope_change()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.distributor_id IS DISTINCT FROM OLD.distributor_id
     OR NEW.mitra_user_id IS DISTINCT FROM OLD.mitra_user_id
     OR NEW.request_type IS DISTINCT FROM OLD.request_type
     OR (
       OLD.item_id IS NOT NULL
       AND NEW.item_id IS DISTINCT FROM OLD.item_id
     ) THEN
    RAISE EXCEPTION 'consignment request ownership fields are immutable';
  END IF;

  RETURN NEW;
END;
$function$;