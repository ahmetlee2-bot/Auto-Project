-- Keep eBay OAuth tokens inaccessible to authenticated users, while making the
-- deny-all RLS behavior explicit. service_role continues to access the table.
drop policy if exists "ebay stores are server-only" on public.ebay_stores;
create policy "ebay stores are server-only"
  on public.ebay_stores
  for all
  to authenticated
  using (false)
  with check (false);

-- Cover foreign keys used by deletions, joins, and progress lookups.
create index if not exists store_listings_pool_product_idx
  on public.store_listings(pool_product_id)
  where pool_product_id is not null;

create index if not exists listing_queue_pool_product_idx
  on public.listing_queue(pool_product_id)
  where pool_product_id is not null;

create index if not exists listing_queue_store_listing_idx
  on public.listing_queue(store_listing_id)
  where store_listing_id is not null;

create index if not exists user_lesson_progress_lesson_idx
  on public.user_lesson_progress(lesson_id);
