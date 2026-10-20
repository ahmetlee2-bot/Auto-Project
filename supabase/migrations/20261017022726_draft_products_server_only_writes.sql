revoke insert, update, delete on public.draft_products from authenticated;
grant select on public.draft_products to authenticated;
grant all on public.draft_products to service_role;
