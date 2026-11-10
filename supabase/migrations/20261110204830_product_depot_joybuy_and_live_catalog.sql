-- Enable verified Joybuy catalog entries and retire placeholder-only depot rows.
alter table public.product_pool drop constraint if exists product_pool_asin_check;
alter table public.product_pool add constraint product_pool_asin_check check (
  (supplier = 'amazon_de' and asin ~ '^[A-Z0-9]{10}$')
  or (supplier = 'joybuy_de' and asin ~ '^JB-[0-9]{6,20}$')
);

alter table public.product_pool drop constraint if exists product_pool_source_marketplace_check;
alter table public.product_pool add constraint product_pool_source_marketplace_check check (
  (supplier = 'amazon_de' and source_marketplace in ('AMZ_US', 'AMZ_DE'))
  or (supplier = 'joybuy_de' and source_marketplace = 'JOYBUY_DE')
);

alter table public.store_listings drop constraint if exists store_listings_asin_check;
alter table public.store_listings add constraint store_listings_asin_check check (asin ~ '^([A-Z0-9]{10}|JB-[0-9]{6,20})$');

alter table public.listing_queue drop constraint if exists listing_queue_asin_check;
alter table public.listing_queue add constraint listing_queue_asin_check check (asin ~ '^([A-Z0-9]{10}|JB-[0-9]{6,20})$');

delete from public.product_pool where is_demo = true;
