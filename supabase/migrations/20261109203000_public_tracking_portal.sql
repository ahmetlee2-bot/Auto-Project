-- Public tracking uses a high-entropy opaque portal reference, never a carrier barcode.
alter table public.supplier_order_tracking
  add column if not exists delivery_status text not null default 'ORDER_RECEIVED',
  add column if not exists status_history jsonb not null default '[]'::jsonb,
  add column if not exists recipient_city text,
  add column if not exists recipient_zip text,
  add column if not exists estimated_delivery text,
  add column if not exists buyer_notified_at timestamptz,
  add column if not exists last_synced_at timestamptz not null default now(),
  add column if not exists public_tracking_number text not null
    default ('AL' || upper(replace(gen_random_uuid()::text, '-', '')) || 'DE');

alter table public.supplier_order_tracking
  add constraint supplier_order_tracking_delivery_status_check
    check (delivery_status in ('ORDER_RECEIVED', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION')),
  add constraint supplier_order_tracking_status_history_array_check
    check (jsonb_typeof(status_history) = 'array'),
  add constraint supplier_order_tracking_public_tracking_number_check
    check (public_tracking_number ~ '^AL[A-F0-9]{32}DE$');

create unique index if not exists supplier_order_tracking_public_tracking_number_uidx
  on public.supplier_order_tracking (public_tracking_number);
create index if not exists supplier_order_tracking_user_status_sync_idx
  on public.supplier_order_tracking (user_id, delivery_status, last_synced_at desc);

create or replace function public.get_public_tracking_info(p_tracking_number text)
returns table (
  converted_tracking_number text,
  converted_carrier text,
  delivery_status text,
  status_history jsonb,
  recipient_zip text,
  recipient_city text,
  estimated_delivery text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.public_tracking_number,
    'Interne Statusseite (kein Paketdienst)'::text,
    s.delivery_status,
    s.status_history,
    s.recipient_zip,
    s.recipient_city,
    coalesce(s.estimated_delivery, s.estimated_delivery_date::text),
    s.last_synced_at
  from public.supplier_order_tracking as s
  where p_tracking_number ~ '^AL[A-F0-9]{32}DE$'
    and s.public_tracking_number = upper(p_tracking_number)
  limit 1;
$$;

revoke all on function public.get_public_tracking_info(text) from public, authenticated;
grant execute on function public.get_public_tracking_info(text) to anon;
