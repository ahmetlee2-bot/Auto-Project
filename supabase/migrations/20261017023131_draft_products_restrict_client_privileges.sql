revoke all on public.draft_products from public, anon, authenticated;
grant select on public.draft_products to authenticated;
grant all on public.draft_products to service_role;
