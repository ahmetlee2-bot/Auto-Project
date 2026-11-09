-- Stripe credit top-ups are idempotent per Checkout Session. Amazon supplier
-- tracking is stored separately until the user actually submits fulfillment
-- to eBay; this avoids presenting supplier tracking as eBay tracking.

alter table public.credit_transactions
  add column if not exists stripe_checkout_session_id text;

create unique index if not exists credit_transactions_stripe_session_key
  on public.credit_transactions (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create table if not exists public.supplier_order_tracking (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.ebay_stores(id) on delete cascade,
  ebay_order_id text not null,
  supplier text not null check (supplier in ('amazon')),
  supplier_order_id text not null,
  recipient_name text not null,
  source_carrier text,
  source_tracking_number text not null,
  amazon_share_url text,
  estimated_delivery_date date,
  synced_at timestamptz not null default now(),
  unique (user_id, supplier, supplier_order_id)
);

create index if not exists supplier_order_tracking_owner_order_idx
  on public.supplier_order_tracking (user_id, store_id, ebay_order_id);

alter table public.supplier_order_tracking enable row level security;
drop policy if exists supplier_order_tracking_owner_select on public.supplier_order_tracking;
create policy supplier_order_tracking_owner_select on public.supplier_order_tracking
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.supplier_order_tracking from anon, authenticated;
grant select on public.supplier_order_tracking to authenticated;
grant all on public.supplier_order_tracking to service_role;

create or replace function public.add_wallet_credits_from_stripe(
  p_user_id uuid,
  p_credits integer,
  p_session_id text,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction_id uuid;
  v_balance integer;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_user_id is null or p_credits not in (50, 100, 250)
     or p_session_id is null or p_session_id !~ '^cs_[A-Za-z0-9_]+$' then
    raise exception 'INVALID_TOPUP' using errcode = '22023';
  end if;

  insert into public.credit_transactions
    (user_id, amount, type, reference_order_id, description, stripe_checkout_session_id)
  values
    (p_user_id, p_credits, 'TOPUP', p_session_id,
     left(coalesce(p_description, 'Stripe wallet top-up'), 240), p_session_id)
  on conflict (stripe_checkout_session_id) where stripe_checkout_session_id is not null
  do nothing
  returning id into v_transaction_id;

  if v_transaction_id is null then
    select credit_balance into v_balance
    from public.user_wallets where user_id = p_user_id;
    return jsonb_build_object('success', true, 'credited', false, 'credit_balance', coalesce(v_balance, 0));
  end if;

  insert into public.user_wallets (user_id, credit_balance)
  values (p_user_id, p_credits)
  on conflict (user_id) do update
    set credit_balance = public.user_wallets.credit_balance + excluded.credit_balance,
        updated_at = now()
  returning credit_balance into v_balance;

  return jsonb_build_object('success', true, 'credited', true, 'credit_balance', v_balance);
end;
$$;

revoke all on function public.add_wallet_credits_from_stripe(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.add_wallet_credits_from_stripe(uuid, integer, text, text) to service_role;
