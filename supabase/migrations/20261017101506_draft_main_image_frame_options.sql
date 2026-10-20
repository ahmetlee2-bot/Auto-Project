alter table public.draft_products
  add column if not exists apply_custom_frame boolean not null default true,
  add column if not exists cover_image_url text,
  add column if not exists cover_source_url text,
  add column if not exists published_images jsonb not null default '[]'::jsonb
    check (jsonb_typeof(published_images) = 'array');

comment on column public.draft_products.images is 'Original HD source image URLs in display order; never rewritten by cover composition.';
comment on column public.draft_products.published_images is 'Image URLs actually sent to eBay; only index 0 may contain a generated cover.';
