create type public.tracked_product_sync_status as enum ('synced', 'price_changed', 'out_of_stock', 'error');

create table public.tracked_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  image_url text,
  amazon_asin text not null check (amazon_asin ~ '^[A-Z0-9]{10}$'),
  amazon_url text not null,
  amazon_price numeric(12,2) check (amazon_price >= 0),
  amazon_stock_status boolean,
  ebay_item_id text not null,
  ebay_url text not null,
  ebay_price numeric(12,2) check (ebay_price >= 0),
  ebay_quantity integer not null default 0 check (ebay_quantity >= 0),
  target_margin_percent numeric(6,2) not null default 20 check (target_margin_percent between 0 and 300),
  estimated_shipping numeric(10,2) not null default 0 check (estimated_shipping >= 0),
  ebay_fee_percent numeric(5,2) not null default 13 check (ebay_fee_percent between 0 and 90),
  payment_fee_percent numeric(5,2) not null default 2 check (payment_fee_percent between 0 and 90),
  desired_quantity integer not null default 1 check (desired_quantity between 1 and 100),
  amazon_price_delta numeric(12,2),
  last_checked_at timestamptz,
  sync_status public.tracked_product_sync_status not null default 'error',
  last_error text,
  active boolean not null default true,
  sync_lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, ebay_item_id),
  check (ebay_fee_percent + payment_fee_percent < 100)
);

create index tracked_products_user_active_idx on public.tracked_products(user_id, active, created_at desc);
create index tracked_products_due_idx on public.tracked_products(last_checked_at nulls first) where active;
create index tracked_products_lease_idx on public.tracked_products(sync_lease_until) where active;

alter table public.tracked_products enable row level security;
create policy "tracked products owner read" on public.tracked_products
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.tracked_products from anon, authenticated;
grant select on public.tracked_products to authenticated;
grant all on public.tracked_products to service_role;

create or replace function public.claim_tracked_product(p_id uuid, p_user_id uuid default null)
returns setof public.tracked_products
language sql security definer set search_path = ''
as $$
  update public.tracked_products
  set sync_lease_until = now() + interval '4 minutes', updated_at = now()
  where id = p_id
    and active
    and (p_user_id is null or user_id = p_user_id)
    and (sync_lease_until is null or sync_lease_until < now())
  returning *;
$$;
revoke all on function public.claim_tracked_product(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_tracked_product(uuid, uuid) to service_role;

insert into public.tracked_products
  (user_id, title, image_url, amazon_asin, amazon_url, ebay_item_id, ebay_url,
   ebay_price, ebay_quantity, last_error)
select p.user_id, coalesce(nullif(p.title, ''), p.asin), p.images->>0,
  upper(p.asin), 'https://www.amazon.de/dp/' || upper(p.asin),
  p.item_id, 'https://www.ebay.de/itm/' || p.item_id,
  p.price, greatest(p.stock, 0), 'Noch nicht geprüft: Amazon-Datenanbieter und eBay-Verbindung erforderlich.'
from public.products p
where p.status in ('ACTIVE', 'PUBLISHED')
  and upper(p.asin) ~ '^[A-Z0-9]{10}$'
  and p.item_id ~ '^[0-9]{9,15}$'
on conflict (user_id, ebay_item_id) do nothing;
