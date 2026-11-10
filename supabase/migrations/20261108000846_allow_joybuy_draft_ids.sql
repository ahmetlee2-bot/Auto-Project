alter table public.draft_products
  drop constraint if exists draft_products_asin_check;

alter table public.draft_products
  add constraint draft_products_asin_check
  check (
    (supplier = 'amazon_de' and asin ~ '^[A-Z0-9]{10}$')
    or (supplier = 'joybuy_de' and asin ~ '^JB-[0-9]{6,20}$')
  );
