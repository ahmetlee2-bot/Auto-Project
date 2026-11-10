alter table public.draft_products
  add column if not exists item_specifics jsonb not null default '{}'::jsonb;

alter table public.draft_products
  drop constraint if exists draft_products_item_specifics_object_check;

alter table public.draft_products
  add constraint draft_products_item_specifics_object_check
  check (jsonb_typeof(item_specifics) = 'object');
