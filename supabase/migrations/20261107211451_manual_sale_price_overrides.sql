alter table public.draft_products
  add column if not exists manual_sale_price numeric(12, 2);

alter table public.tracked_products
  add column if not exists manual_sale_price numeric(12, 2);

alter table public.draft_products
  add constraint draft_products_manual_sale_price_valid
  check (manual_sale_price is null or manual_sale_price between 0.01 and 1000000);

alter table public.tracked_products
  add constraint tracked_products_manual_sale_price_valid
  check (manual_sale_price is null or manual_sale_price between 0.01 and 1000000);
