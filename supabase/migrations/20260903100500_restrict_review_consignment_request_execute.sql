revoke execute on function public.review_consignment_request(uuid, uuid, uuid, text, text) from anon;
revoke execute on function public.review_consignment_request(uuid, uuid, uuid, text, text) from authenticated;
grant execute on function public.review_consignment_request(uuid, uuid, uuid, text, text) to service_role;