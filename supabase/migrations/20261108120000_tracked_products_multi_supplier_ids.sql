-- Preserve Amazon ASIN validation while accepting Joybuy's verified supplier ID.
alter table public.tracked_products
  drop constraint if exists tracked_products_amazon_asin_check;

alter table public.tracked_products
  drop constraint if exists tracked_products_supplier_product_id_check;

alter table public.tracked_products
  add constraint tracked_products_supplier_product_id_check
  check (
    (supplier = 'amazon_de' and amazon_asin ~ '^[A-Z0-9]{10}$')
    or (supplier = 'joybuy_de' and amazon_asin ~ '^JB-[0-9]{6,20}$')
  );
