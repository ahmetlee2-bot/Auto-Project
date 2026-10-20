alter table public.tracked_products
  add column if not exists minimum_sale_price numeric(12,2) not null default 0 check (minimum_sale_price >= 0),
  add column if not exists manual_quantity_override integer check (manual_quantity_override between 0 and 10000);

create table if not exists public.favorite_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asin text not null check (asin ~ '^[A-Z0-9]{10}$'),
  title text not null,
  image_url text,
  amazon_url text not null,
  amazon_price numeric(12,2) check (amazon_price is null or amazon_price >= 0),
  is_prime boolean not null default false,
  suggested_ebay_price numeric(12,2) check (suggested_ebay_price is null or suggested_ebay_price >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, asin)
);

create index if not exists favorite_products_user_created_idx
  on public.favorite_products(user_id, created_at desc);

alter table public.favorite_products enable row level security;
drop policy if exists "favorite products owner read" on public.favorite_products;
create policy "favorite products owner read" on public.favorite_products
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.favorite_products from anon, authenticated;
grant select on public.favorite_products to authenticated;
grant all on public.favorite_products to service_role;
