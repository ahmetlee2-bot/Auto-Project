alter table public.products alter column user_id set not null;
drop index if exists public.products_asin_unique;
create unique index if not exists products_user_asin_unique on public.products(user_id,asin);
create table if not exists public.ebay_connections(user_id uuid primary key references public.users(id) on delete cascade, access_token text, refresh_token text, updated_at timestamptz not null default now());
alter table public.ebay_connections enable row level security;
revoke all on public.ebay_connections from public,anon,authenticated;
grant select,insert,update,delete on public.ebay_connections to service_role;
