-- Tracking wallet and conversion cache. All wallet writes happen in the
-- SECURITY DEFINER RPC below; clients can only read their own rows.
create table if not exists public.user_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  credit_balance integer not null default 0 check (credit_balance >= 0),
  is_unlimited boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,
  type text not null check (type in ('TOPUP', 'TRACKING_CONVERSION', 'REFUND', 'ADMIN_GRANT')),
  reference_order_id text,
  description text,
  created_at timestamptz not null default now()
);
create index if not exists credit_transactions_user_created_idx
  on public.credit_transactions (user_id, created_at desc);

create table if not exists public.tracking_conversions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ebay_order_id text not null,
  source_tracking_number text not null,
  amazon_share_url text,
  converted_carrier text not null,
  converted_tracking_number text not null,
  recipient_zip text not null,
  status text not null default 'CONVERTED' check (status in ('CONVERTED', 'SENT_TO_EBAY', 'FAILED')),
  created_at timestamptz not null default now(),
  constraint tracking_conversions_user_order_source_key
    unique (user_id, ebay_order_id, source_tracking_number)
);
create index if not exists tracking_conversions_user_created_idx
  on public.tracking_conversions (user_id, created_at desc);

alter table public.user_wallets enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.tracking_conversions enable row level security;

drop policy if exists user_wallets_owner_select on public.user_wallets;
create policy user_wallets_owner_select on public.user_wallets
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists credit_transactions_owner_select on public.credit_transactions;
create policy credit_transactions_owner_select on public.credit_transactions
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists tracking_conversions_owner_select on public.tracking_conversions;
create policy tracking_conversions_owner_select on public.tracking_conversions
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.user_wallets, public.credit_transactions, public.tracking_conversions from anon, authenticated;
grant select on public.user_wallets, public.credit_transactions, public.tracking_conversions to authenticated;
grant all on public.user_wallets, public.credit_transactions, public.tracking_conversions to service_role;

-- New accounts receive an empty wallet. Existing accounts are initialized by
-- the authenticated wallet endpoint using a service-only insert-if-absent.
create or replace function public.create_user_wallet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_wallets (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.create_user_wallet() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_wallet on auth.users;
create trigger on_auth_user_created_wallet
  after insert on auth.users
  for each row execute function public.create_user_wallet();

-- The three required parameters preserve the requested RPC contract. The
-- additional defaulted values let the debit and idempotency record commit in
-- the same transaction, so concurrent conversions cannot charge twice.
create or replace function public.deduct_tracking_credit(
  p_user_id uuid,
  p_ebay_order_id text,
  p_source_tracking text,
  p_converted_carrier text default null,
  p_converted_tracking_number text default null,
  p_recipient_zip text default null,
  p_amazon_share_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.user_wallets%rowtype;
  v_conversion public.tracking_conversions%rowtype;
  v_amount integer;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_ebay_order_id is null or btrim(p_ebay_order_id) = ''
     or p_source_tracking is null or btrim(p_source_tracking) = '' then
    raise exception 'INVALID_CONVERSION_KEY' using errcode = '22023';
  end if;

  select * into v_conversion
  from public.tracking_conversions
  where user_id = p_user_id
    and ebay_order_id = btrim(p_ebay_order_id)
    and source_tracking_number = btrim(p_source_tracking)
    and status in ('CONVERTED', 'SENT_TO_EBAY');
  if found then
    select * into v_wallet from public.user_wallets where user_id = p_user_id;
    return jsonb_build_object('success', true, 'charged', false,
      'credit_balance', coalesce(v_wallet.credit_balance, 0),
      'is_unlimited', coalesce(v_wallet.is_unlimited, false),
      'conversion', to_jsonb(v_conversion));
  end if;

  if coalesce(btrim(p_converted_carrier), '') = ''
     or coalesce(btrim(p_converted_tracking_number), '') = ''
     or coalesce(btrim(p_recipient_zip), '') = '' then
    raise exception 'CONVERSION_DETAILS_REQUIRED' using errcode = '22023';
  end if;
  if btrim(p_converted_tracking_number) !~ '^[A-Za-z0-9]{6,60}$' then
    raise exception 'INVALID_CONVERTED_TRACKING_NUMBER' using errcode = '22023';
  end if;

  select * into v_wallet
  from public.user_wallets
  where user_id = p_user_id
  for update;
  if not found then
    raise exception 'WALLET_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Recheck after acquiring the per-user lock; another order request may have
  -- completed the same conversion while this request was waiting.
  select * into v_conversion
  from public.tracking_conversions
  where user_id = p_user_id
    and ebay_order_id = btrim(p_ebay_order_id)
    and source_tracking_number = btrim(p_source_tracking)
    and status in ('CONVERTED', 'SENT_TO_EBAY');
  if found then
    return jsonb_build_object('success', true, 'charged', false,
      'credit_balance', v_wallet.credit_balance,
      'is_unlimited', v_wallet.is_unlimited,
      'conversion', to_jsonb(v_conversion));
  end if;

  if v_wallet.is_unlimited then
    v_amount := 0;
  else
    if v_wallet.credit_balance < 1 then
      raise exception 'INSUFFICIENT_CREDITS' using errcode = 'P0001';
    end if;
    v_amount := -1;
    update public.user_wallets
    set credit_balance = credit_balance - 1, updated_at = now()
    where user_id = p_user_id
    returning * into v_wallet;
  end if;

  insert into public.credit_transactions
    (user_id, amount, type, reference_order_id, description)
  values
    (p_user_id, v_amount, 'TRACKING_CONVERSION', btrim(p_ebay_order_id),
     'source_tracking=' || btrim(p_source_tracking));

  insert into public.tracking_conversions
    (user_id, ebay_order_id, source_tracking_number, amazon_share_url,
     converted_carrier, converted_tracking_number, recipient_zip, status)
  values
    (p_user_id, btrim(p_ebay_order_id), btrim(p_source_tracking),
     nullif(btrim(p_amazon_share_url), ''), btrim(p_converted_carrier),
     btrim(p_converted_tracking_number), btrim(p_recipient_zip), 'CONVERTED')
  on conflict (user_id, ebay_order_id, source_tracking_number) do update
    set amazon_share_url = excluded.amazon_share_url,
        converted_carrier = excluded.converted_carrier,
        converted_tracking_number = excluded.converted_tracking_number,
        recipient_zip = excluded.recipient_zip,
        status = 'CONVERTED',
        created_at = now()
  returning * into v_conversion;

  return jsonb_build_object('success', true, 'charged', v_amount <> 0,
    'credit_balance', v_wallet.credit_balance,
    'is_unlimited', v_wallet.is_unlimited,
    'conversion', to_jsonb(v_conversion));
end;
$$;

revoke all on function public.deduct_tracking_credit(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.deduct_tracking_credit(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.deduct_tracking_credit(uuid, text, text, text, text, text, text) to service_role;
