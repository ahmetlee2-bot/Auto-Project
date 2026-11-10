alter table public.ebay_stores
  add column if not exists sku_prefix text;

alter table public.ebay_stores
  drop constraint if exists ebay_stores_sku_prefix_check;

alter table public.ebay_stores
  add constraint ebay_stores_sku_prefix_check
  check (sku_prefix is null or sku_prefix ~ '^[A-Za-z0-9]{2,6}$');
