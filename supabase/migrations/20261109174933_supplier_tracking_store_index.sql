-- The preceding composite index is optimized for owner-scoped reads. This
-- additional leading store_id index covers the store foreign key itself.
create index if not exists supplier_order_tracking_store_id_idx
  on public.supplier_order_tracking (store_id);
