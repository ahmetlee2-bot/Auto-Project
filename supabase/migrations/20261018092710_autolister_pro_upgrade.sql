-- AutoLister Pro: multi-store eBay OAuth, curated product pool, scheduled listings,
-- and a policy-compliant training hub. Seller OAuth credentials stay server-only.

create table if not exists public.ebay_stores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_name text not null check (char_length(store_name) between 1 and 120),
  seller_username text,
  marketplace_id text not null check (marketplace_id in ('EBAY_US', 'EBAY_DE', 'EBAY_GB', 'EBAY_AU', 'EBAY_CA', 'EBAY_FR', 'EBAY_IT', 'EBAY_ES')),
  -- AES-256-GCM ciphertext, never a plaintext OAuth token.
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  refresh_token_expires_at timestamptz,
  daily_listing_limit integer not null default 10 check (daily_listing_limit between 1 and 500),
  auto_lister_enabled boolean not null default false,
  auto_pull_from_depot boolean not null default false,
  listing_interval_hours integer not null default 6 check (listing_interval_hours between 1 and 720),
  default_margin_percent numeric(6,2) not null default 15 check (default_margin_percent between 0 and 300),
  merchant_location_key text,
  fulfillment_policy_id text,
  payment_policy_id text,
  return_policy_id text,
  status text not null default 'active' check (status in ('active', 'token_expired', 'paused')),
  last_listed_at timestamptz,
  scheduler_lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ebay_stores_user_seller_marketplace_uidx
  on public.ebay_stores(user_id, lower(seller_username), marketplace_id)
  where seller_username is not null;
create index if not exists ebay_stores_user_created_idx
  on public.ebay_stores(user_id, created_at desc);
create index if not exists ebay_stores_scheduler_idx
  on public.ebay_stores(status, scheduler_lease_until)
  where status = 'active';

create table if not exists public.product_pool (
  id uuid primary key default gen_random_uuid(),
  asin text not null check (asin ~ '^[A-Z0-9]{10}$'),
  source_marketplace text not null check (source_marketplace in ('AMZ_US', 'AMZ_DE')),
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  brand text,
  condition text not null default 'NEW' check (condition in ('NEW', 'LIKE_NEW', 'USED_EXCELLENT', 'USED_VERY_GOOD', 'USED_GOOD', 'USED_ACCEPTABLE', 'FOR_PARTS_OR_NOT_WORKING')),
  category_id text,
  amazon_price numeric(12,2) not null check (amazon_price >= 0),
  suggested_ebay_price numeric(12,2) check (suggested_ebay_price is null or suggested_ebay_price >= 0),
  estimated_profit numeric(12,2) check (estimated_profit is null or estimated_profit >= 0),
  estimated_shipping numeric(10,2) not null default 0 check (estimated_shipping >= 0),
  images jsonb not null default '[]'::jsonb check (jsonb_typeof(images) = 'array'),
  item_specifics jsonb not null default '{}'::jsonb check (jsonb_typeof(item_specifics) = 'object'),
  is_vero_safe boolean not null default false,
  stock_status text not null default 'in_stock' check (stock_status in ('in_stock', 'out_of_stock')),
  is_published boolean not null default false,
  is_demo boolean not null default false,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (asin, source_marketplace)
);

create index if not exists product_pool_visible_idx
  on public.product_pool(source_marketplace, category_id, estimated_profit desc, created_at desc)
  where is_published and is_vero_safe and stock_status = 'in_stock';
create index if not exists product_pool_price_idx on public.product_pool(amazon_price);

create table if not exists public.store_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.ebay_stores(id) on delete cascade,
  pool_product_id uuid references public.product_pool(id) on delete set null,
  asin text not null check (asin ~ '^[A-Z0-9]{10}$'),
  title text not null,
  target_price numeric(12,2) not null check (target_price > 0),
  status text not null default 'queued' check (status in ('queued', 'processing', 'published', 'failed', 'paused')),
  ebay_sku text,
  ebay_offer_id text,
  ebay_item_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, asin)
);
create index if not exists store_listings_user_store_idx
  on public.store_listings(user_id, store_id, created_at desc);
create index if not exists store_listings_store_status_idx
  on public.store_listings(store_id, status, created_at desc);

create table if not exists public.listing_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.ebay_stores(id) on delete cascade,
  store_listing_id uuid references public.store_listings(id) on delete set null,
  pool_product_id uuid references public.product_pool(id) on delete set null,
  asin text not null check (asin ~ '^[A-Z0-9]{10}$'),
  custom_title text check (custom_title is null or char_length(custom_title) between 1 and 80),
  target_price numeric(12,2) not null check (target_price > 0),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  scheduled_for timestamptz not null default now(),
  ebay_item_id text,
  error_message text,
  processing_attempts integer not null default 0 check (processing_attempts >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists listing_queue_due_idx
  on public.listing_queue(scheduled_for, store_id)
  where status = 'pending';
create index if not exists listing_queue_user_idx
  on public.listing_queue(user_id, created_at desc);
create unique index if not exists listing_queue_open_store_asin_uidx
  on public.listing_queue(store_id, asin)
  where status in ('pending', 'processing');

create table if not exists public.academy_courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '',
  sort_order integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.academy_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.academy_courses(id) on delete cascade,
  module_title text not null check (char_length(module_title) between 1 and 160),
  lesson_title text not null check (char_length(lesson_title) between 1 and 200),
  description text not null default '',
  video_url text,
  thumbnail_url text,
  duration_minutes integer not null default 0 check (duration_minutes >= 0),
  sort_order integer not null default 0,
  resources_json jsonb not null default '[]'::jsonb check (jsonb_typeof(resources_json) = 'array'),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, lesson_title)
);
create index if not exists academy_lessons_course_order_idx
  on public.academy_lessons(course_id, sort_order, created_at);

create table if not exists public.user_lesson_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.academy_lessons(id) on delete cascade,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
create index if not exists user_lesson_progress_user_idx
  on public.user_lesson_progress(user_id, completed, updated_at desc);

insert into public.academy_courses (slug, title, description, sort_order, is_published)
values
  ('store-connection', 'eBay mağaza bağlantısı', 'Resmi eBay OAuth bağlantısını kurun ve mağaza gereksinimlerini tamamlayın.', 10, true),
  ('product-depot', 'Ürün deposu ve listeleme kuyruğu', 'Ürün verilerini gözden geçirin ve mağaza başına planlı listeleme akışını yönetin.', 20, true),
  ('orders-and-tracking', 'Siparişler ve gönderi takibi', 'Gönderi kalemlerini ve gerçek taşıyıcı takip bilgisini eBay ile eşleştirin.', 30, true)
on conflict (slug) do nothing;

insert into public.academy_courses (slug, title, description, sort_order, is_published)
values (
  'autolister-core-curriculum',
  'AutoLister operasyon rehberi',
  'Mağaza bağlantısı, güvenli zamanlama, ürün uygunluğu ve sipariş yönetimi için başlangıç eğitimi.',
  40,
  true
)
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  is_published = true,
  updated_at = now();

insert into public.academy_lessons
  (course_id, module_title, lesson_title, description, duration_minutes, sort_order, resources_json, is_published)
select c.id, lesson.module_title, lesson.lesson_title, lesson.description, lesson.duration_minutes, lesson.sort_order, lesson.resources_json::jsonb, true
from (values
  ('store-connection', 'Mağaza bağlantısı', 'Bir eBay mağazasını güvenli bağlama', 'Dashboard mağaza seçicisinden pazaryerini seçin ve eBay’in resmi OAuth ekranında yetki verin. Bağlantıdan sonra mağazanın gönderim konumu ile ödeme, kargo ve iade politikalarını eBay hesabınızdaki gerçek değerlerle tamamlayın.', 5, 10, '[]'),
  ('product-depot', 'Ürün incelemesi', 'Depodan ürünü kuyruğa alma', 'Başlık, kaynak fiyatı, kategori, görseller ve kullanım haklarını yayından önce gözden geçirin. Ürünü seçilen mağazaya kuyruğa eklediğinizde mağazanın günlük limiti ve listeleme aralığı uygulanır.', 6, 10, '[]'),
  ('orders-and-tracking', 'Sipariş operasyonu', 'Gönderi ve taşıyıcı takibini kaydetme', 'Siparişi gerçekten gönderdikten sonra pakete ait taşıyıcı kodunu ve taşıyıcının verdiği takip numarasını eBay’e ekleyin. Sipariş kalemlerini ve taşıyıcı bilgisini göndermeden önce kontrol edin.', 5, 10, '[]')
) as lesson(course_slug, module_title, lesson_title, description, duration_minutes, sort_order, resources_json)
join public.academy_courses c on c.slug = lesson.course_slug
on conflict (course_id, lesson_title) do nothing;

insert into public.academy_lessons
  (course_id, module_title, lesson_title, description, duration_minutes, sort_order, resources_json, is_published)
select c.id, lesson.module_title, lesson.lesson_title, lesson.description, lesson.duration_minutes, lesson.sort_order, '[]'::jsonb, true
from (values
  ('Çoklu Mağaza', 'Çoklu Mağaza Mimarisi & Güvenli Tarayıcı Kurulum Rehberi', 'Resmî eBay OAuth ile mağaza bağlama, mağaza bazında yapılandırma ve hesap erişimini güvenli tutma. Ayrı tarayıcı profilleri yalnızca hesapların meşru biçimde ayrılması ve yetkisiz erişimin önlenmesi içindir; platform kısıtlamalarını aşmak için kullanılmaz.', 9, 10),
  ('Bulut Otomasyonu', 'AutoLister Bulut Motoru & Otomatik Zamanlayıcı Ayarları', 'Listeleme aralıklarını ve mağaza başına günlük limitleri belirleme, sıradaki işleri gözden geçirme ve zamanlanmış görevlerin durumunu izleme.', 8, 20),
  ('Ürün Uygunluğu', 'Hazır Ürün Havuzundan Ürün Seçimi ve VERO Kontrolü', 'Ürün verisini, görsel kullanım hakkını, kategori ve marka kısıtlarını yayından önce doğrulama. Hiçbir ürün otomatik olarak VERO güvenli kabul edilmez.', 10, 30),
  ('Sipariş ve Gönderi', 'Sipariş Yönetimi, Aquiline / BCE Takibi ve Mağaza Sağlığı', 'Gönderi oluşturulduktan sonra gerçek taşıyıcı tarafından verilen takip numarasını kullanma. 3PL dönüşümü yapılandırılmış sağlayıcı üzerinden yapılır; eBay taşıyıcı kodu gerçek taşıyıcıya göre seçilir.', 9, 40)
) as lesson(module_title, lesson_title, description, duration_minutes, sort_order)
join public.academy_courses c on c.slug = 'autolister-core-curriculum'
on conflict (course_id, lesson_title) do update set
  module_title = excluded.module_title,
  description = excluded.description,
  duration_minutes = excluded.duration_minutes,
  sort_order = excluded.sort_order,
  resources_json = excluded.resources_json,
  is_published = true,
  updated_at = now();

-- Clearly marked preview records make the Depot UI usable before an operator
-- imports genuine catalog data. They are hidden from public queries and cannot
-- be approved, queued, or published.
with demo_products(asin, source_marketplace, title, amazon_price, estimated_shipping, category_hint) as (
  values
    ('DEMO000001', 'AMZ_DE', 'DEMO · OBD2 Bluetooth Diagnoseadapter', 18.90::numeric, 3.90::numeric, 'Automotive Elektronik'),
    ('DEMO000002', 'AMZ_US', 'DEMO · OBD2 Wireless Diagnoseadapter', 21.50::numeric, 4.50::numeric, 'Automotive Electronics'),
    ('DEMO000003', 'AMZ_DE', 'DEMO · Digitales Reifendruckmessgerät', 12.80::numeric, 2.90::numeric, 'Autozubehör'),
    ('DEMO000004', 'AMZ_US', 'DEMO · Digital Tire Pressure Gauge', 14.25::numeric, 3.50::numeric, 'Automotive Accessories'),
    ('DEMO000005', 'AMZ_DE', 'DEMO · Magnetische Handyhalterung', 16.40::numeric, 3.20::numeric, 'Autozubehör'),
    ('DEMO000006', 'AMZ_US', 'DEMO · Magnetic Car Phone Mount', 17.95::numeric, 3.75::numeric, 'Automotive Accessories'),
    ('DEMO000007', 'AMZ_DE', 'DEMO · Sicherungsprüfer für Fahrzeuge', 11.90::numeric, 2.80::numeric, 'Automotive Elektronik'),
    ('DEMO000008', 'AMZ_US', 'DEMO · Automotive Fuse Tester Kit', 13.60::numeric, 3.10::numeric, 'Automotive Electronics'),
    ('DEMO000009', 'AMZ_DE', 'DEMO · Espressostampfer aus Edelstahl', 19.50::numeric, 3.60::numeric, 'Kaffee und Espresso'),
    ('DEMO000010', 'AMZ_US', 'DEMO · Stainless Espresso Tamper', 22.75::numeric, 4.25::numeric, 'Coffee and Espresso'),
    ('DEMO000011', 'AMZ_DE', 'DEMO · Digitale Kaffeewaage mit Timer', 24.90::numeric, 4.20::numeric, 'Kaffee und Espresso'),
    ('DEMO000012', 'AMZ_US', 'DEMO · Coffee Scale with Timer', 26.80::numeric, 4.80::numeric, 'Coffee and Espresso'),
    ('DEMO000013', 'AMZ_DE', 'DEMO · Abschlagbox für Espressosatz', 17.20::numeric, 3.50::numeric, 'Kaffee und Espresso'),
    ('DEMO000014', 'AMZ_US', 'DEMO · Espresso Knock Box', 18.60::numeric, 3.95::numeric, 'Coffee and Espresso'),
    ('DEMO000015', 'AMZ_DE', 'DEMO · Edelstahl-Milchkännchen 350 ml', 10.90::numeric, 2.70::numeric, 'Küche'),
    ('DEMO000016', 'AMZ_US', 'DEMO · Stainless Milk Frothing Pitcher', 12.40::numeric, 3.00::numeric, 'Home and Kitchen'),
    ('DEMO000017', 'AMZ_DE', 'DEMO · Verstellbarer Schubladenteiler', 15.80::numeric, 3.40::numeric, 'Ordnung und Aufbewahrung'),
    ('DEMO000018', 'AMZ_US', 'DEMO · Adjustable Drawer Organizer Set', 18.30::numeric, 4.00::numeric, 'Storage and Organization'),
    ('DEMO000019', 'AMZ_DE', 'DEMO · Kabelmanagement-Set für den Schreibtisch', 9.95::numeric, 2.50::numeric, 'Büro'),
    ('DEMO000020', 'AMZ_US', 'DEMO · Desk Cable Management Kit', 11.80::numeric, 2.90::numeric, 'Office Products'),
    ('DEMO000021', 'AMZ_DE', 'DEMO · Modulares 3D-Schreibtisch-Organizer-Set', 14.70::numeric, 3.30::numeric, 'Büro und Schreibtisch'),
    ('DEMO000022', 'AMZ_US', 'DEMO · Modular 3D Desk Organizer Set', 16.90::numeric, 3.75::numeric, 'Office and Desk'),
    ('DEMO000023', 'AMZ_DE', 'DEMO · Vertikaler Kopfhörerständer', 13.50::numeric, 3.10::numeric, 'Büro und Schreibtisch'),
    ('DEMO000024', 'AMZ_US', 'DEMO · Vertical Headphone Stand', 15.60::numeric, 3.45::numeric, 'Office and Desk'),
    ('DEMO000025', 'AMZ_DE', 'DEMO · Tablet- und Buchständer, faltbar', 20.40::numeric, 3.80::numeric, 'Home und Büro')
), computed as (
  select *, ceil(((amazon_price + estimated_shipping) * 1.20 / 0.85 - 0.00000001) * 100) / 100 as suggested_price
  from demo_products
)
insert into public.product_pool
  (asin, source_marketplace, title, description, brand, condition, category_id, amazon_price,
   suggested_ebay_price, estimated_profit, estimated_shipping, images, item_specifics,
   is_vero_safe, stock_status, is_published, is_demo)
select
  asin,
  source_marketplace,
  title,
  'DEMO-Datensatz ohne Live-Preis, Bestand, Bild- oder Rechteprüfung. Importiere echte Produktdaten und prüfe Kategorie, Nutzungsrechte und VERO-Risiko vor jeder Freigabe.',
  null,
  'NEW',
  null,
  amazon_price,
  suggested_price,
  greatest(0, round(suggested_price * 0.85 - amazon_price - estimated_shipping, 2)),
  estimated_shipping,
  jsonb_build_array('/assets/demo-product.svg'),
  jsonb_build_object('Demo-Kategorie', category_hint, 'Datentyp', 'Vorschau'),
  false,
  'out_of_stock',
  false,
  true
from computed
on conflict (asin, source_marketplace) do nothing;

create or replace function public.autolister_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.autolister_touch_updated_at() from public, anon, authenticated;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'ebay_stores', 'product_pool', 'store_listings', 'listing_queue',
    'academy_courses', 'academy_lessons', 'user_lesson_progress'
  ] loop
    execute format('drop trigger if exists autolister_touch_updated_at on public.%I', target_table);
    execute format(
      'create trigger autolister_touch_updated_at before update on public.%I for each row execute function public.autolister_touch_updated_at()',
      target_table
    );
  end loop;
end;
$$;

alter table public.ebay_stores enable row level security;
alter table public.product_pool enable row level security;
alter table public.store_listings enable row level security;
alter table public.listing_queue enable row level security;
alter table public.academy_courses enable row level security;
alter table public.academy_lessons enable row level security;
alter table public.user_lesson_progress enable row level security;

-- All store/token and write operations go through authenticated server routes.
revoke all on public.ebay_stores from public, anon, authenticated;
grant all on public.ebay_stores to service_role;
revoke all on public.product_pool from public, anon, authenticated;
grant select on public.product_pool to authenticated;
grant all on public.product_pool to service_role;
revoke all on public.store_listings from public, anon, authenticated;
grant select on public.store_listings to authenticated;
grant all on public.store_listings to service_role;
revoke all on public.listing_queue from public, anon, authenticated;
grant select on public.listing_queue to authenticated;
grant all on public.listing_queue to service_role;
revoke all on public.academy_courses from public, anon, authenticated;
grant select on public.academy_courses to authenticated;
grant all on public.academy_courses to service_role;
revoke all on public.academy_lessons from public, anon, authenticated;
grant select on public.academy_lessons to authenticated;
grant all on public.academy_lessons to service_role;
revoke all on public.user_lesson_progress from public, anon, authenticated;
grant select, insert, update, delete on public.user_lesson_progress to authenticated;
grant all on public.user_lesson_progress to service_role;

drop policy if exists "pool products visible to signed-in users" on public.product_pool;
create policy "pool products visible to signed-in users"
  on public.product_pool for select to authenticated
  using (is_published and is_vero_safe and stock_status = 'in_stock' and not is_demo);

drop policy if exists "store listings owner read" on public.store_listings;
create policy "store listings owner read" on public.store_listings
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "queue owner read" on public.listing_queue;
create policy "queue owner read" on public.listing_queue
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "published courses visible to signed-in users" on public.academy_courses;
create policy "published courses visible to signed-in users"
  on public.academy_courses for select to authenticated using (is_published);
drop policy if exists "published lessons visible to signed-in users" on public.academy_lessons;
create policy "published lessons visible to signed-in users"
  on public.academy_lessons for select to authenticated
  using (is_published and exists (
    select 1 from public.academy_courses c
    where c.id = academy_lessons.course_id and c.is_published
  ));

drop policy if exists "lesson progress owner read" on public.user_lesson_progress;
create policy "lesson progress owner read" on public.user_lesson_progress
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "lesson progress owner insert" on public.user_lesson_progress;
create policy "lesson progress owner insert" on public.user_lesson_progress
  for insert to authenticated with check ((select auth.uid()) = user_id and exists (
    select 1 from public.academy_lessons l
    join public.academy_courses c on c.id = l.course_id
    where l.id = user_lesson_progress.lesson_id and l.is_published and c.is_published
  ));
drop policy if exists "lesson progress owner update" on public.user_lesson_progress;
create policy "lesson progress owner update" on public.user_lesson_progress
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.academy_lessons l
    join public.academy_courses c on c.id = l.course_id
    where l.id = user_lesson_progress.lesson_id and l.is_published and c.is_published
  ));
drop policy if exists "lesson progress owner delete" on public.user_lesson_progress;
create policy "lesson progress owner delete" on public.user_lesson_progress
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Private video files are served through short-lived signed URLs after route auth.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('academy-media', 'academy-media', false, 524288000, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
