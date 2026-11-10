revoke insert, update, delete on public.order_tracking from anon, authenticated;
revoke all on public.order_tracking from anon;
alter policy order_tracking_owner on public.order_tracking
using ((select auth.uid())=user_id and exists(select 1 from public.ebay_stores s where s.id=store_id and s.user_id=(select auth.uid())))
with check ((select auth.uid())=user_id and exists(select 1 from public.ebay_stores s where s.id=store_id and s.user_id=(select auth.uid())));
