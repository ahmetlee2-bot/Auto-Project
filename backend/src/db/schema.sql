create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  is_verified boolean not null default false,
  otp_code text,
  otp_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, is_verified)
  values (new.id, new.email, coalesce(new.email_confirmed_at is not null, false))
  on conflict (id) do update set email = excluded.email, is_verified = case when excluded.is_verified then true else public.users.is_verified end;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.sync_user_verification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is not null then update public.users set is_verified = true where id = new.id; end if;
  return new;
end;
$$;
revoke all on function public.sync_user_verification() from public;
drop trigger if exists on_auth_user_verified on auth.users;
create trigger on_auth_user_verified after update of email_confirmed_at on auth.users for each row execute procedure public.sync_user_verification();

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  asin text not null,
  title text,
  images jsonb not null default '[]'::jsonb,
  item_id text,
  price numeric(12,2) not null check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  status text not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.legacy_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  item_id text not null,
  asin text not null,
  created_at timestamptz not null default now(),
  unique (user_id, item_id)
);

alter table public.users enable row level security;
alter table public.products enable row level security;
alter table public.legacy_listings enable row level security;

create policy "users own profile" on public.users for select to authenticated using ((select auth.uid()) = id);
create policy "products own rows" on public.products for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "legacy listings own rows" on public.legacy_listings for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Idempotency and fields added for the Node listing API.
alter table public.products add column if not exists title text;
alter table public.products add column if not exists images jsonb not null default '[]'::jsonb;
alter table public.products alter column user_id set not null;
drop index if exists public.products_asin_unique;
create unique index if not exists products_user_asin_unique on public.products (user_id, asin);
create index if not exists users_email_lookup_idx on public.users (lower(email));

-- Server-only seller credentials; never grant clients access to these secrets.
create table if not exists public.ebay_connections (
  user_id uuid primary key references public.users(id) on delete cascade,
  access_token text,
  refresh_token text,
  updated_at timestamptz not null default now()
);
alter table public.ebay_connections enable row level security;
revoke all on public.ebay_connections from public, anon, authenticated;
grant select, insert, update, delete on public.ebay_connections to service_role;
