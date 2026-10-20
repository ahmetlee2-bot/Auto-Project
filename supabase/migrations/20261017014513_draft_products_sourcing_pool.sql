do $$ begin
  create type public.draft_product_status as enum ('draft', 'publishing', 'published', 'error');
exception when duplicate_object then null;
end $$;

create table if not exists public.draft_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asin text not null check (asin ~ '^[A-Z0-9]{10}$'),
  source_url text not null,
  source_price numeric(12,2) check (source_price is null or source_price >= 0),
  target_price numeric(12,2) check (target_price is null or target_price >= 0),
  profit_margin_percent numeric(6,2) not null default 20 check (profit_margin_percent between 0 and 300),
  shipping_cost numeric(10,2) not null default 0 check (shipping_cost >= 0),
  title text not null check (char_length(title) between 1 and 80),
  description_html text not null default '',
  images jsonb not null default '[]'::jsonb check (jsonb_typeof(images) = 'array'),
  selected_category_id text,
  status public.draft_product_status not null default 'draft',
  ebay_sku text,
  ebay_offer_id text,
  ebay_item_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.favorite_products
  add column if not exists images jsonb not null default '[]'::jsonb;
update public.favorite_products
set images = jsonb_build_array(image_url)
where images = '[]'::jsonb and image_url is not null;

create index if not exists draft_products_user_status_created_idx
  on public.draft_products (user_id, status, created_at desc);
create index if not exists draft_products_user_asin_idx
  on public.draft_products (user_id, asin);
create unique index if not exists draft_products_single_open_asin_idx
  on public.draft_products (user_id, asin)
  where status in ('draft', 'publishing', 'error');

alter table public.draft_products enable row level security;
drop policy if exists "draft products owner read" on public.draft_products;
create policy "draft products owner read" on public.draft_products
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "draft products owner insert" on public.draft_products;
create policy "draft products owner insert" on public.draft_products
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "draft products owner update" on public.draft_products;
create policy "draft products owner update" on public.draft_products
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "draft products owner delete" on public.draft_products;
create policy "draft products owner delete" on public.draft_products
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.draft_products from public, anon;
grant select, insert, update, delete on public.draft_products to authenticated;
grant all on public.draft_products to service_role;
