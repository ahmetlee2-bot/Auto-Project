alter table public.draft_products add column if not exists supplier text not null default 'amazon_de';
alter table public.favorite_products add column if not exists supplier text not null default 'amazon_de';
alter table public.product_pool add column if not exists supplier text not null default 'amazon_de';
alter table public.product_pool add column if not exists source_url text;
alter table public.tracked_products add column if not exists supplier text not null default 'amazon_de';
alter table public.draft_products add constraint draft_products_supplier_valid check (supplier in ('amazon_de','joybuy_de'));
alter table public.favorite_products add constraint favorite_products_supplier_valid check (supplier in ('amazon_de','joybuy_de'));
alter table public.product_pool add constraint product_pool_supplier_valid check (supplier in ('amazon_de','joybuy_de'));
alter table public.tracked_products add constraint tracked_products_supplier_valid check (supplier in ('amazon_de','joybuy_de'));
