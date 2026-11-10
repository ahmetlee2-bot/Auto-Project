alter table public.favorite_products add column if not exists description_html text not null default '', add column if not exists profit_margin_percent numeric not null default 20 check (profit_margin_percent between 0 and 300), add column if not exists quantity integer not null default 1 check (quantity between 1 and 999);
alter table public.draft_products add column if not exists quantity integer not null default 1 check (quantity between 1 and 999);
create table public.order_tracking (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, store_id uuid not null references public.ebay_stores(id) on delete cascade, order_id text not null, source_tracking_id text, tracking_number text not null, carrier_code text not null, provider text, status text not null default 'pending' check(status in ('pending','submitted','delivered','error')), last_error text, updated_at timestamptz not null default now(), unique(user_id,store_id,order_id));
create index order_tracking_store_idx on public.order_tracking(store_id);
alter table public.order_tracking enable row level security;
create policy order_tracking_owner on public.order_tracking to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update,delete on public.order_tracking to authenticated;
grant all on public.order_tracking to service_role;
