# Product cover framing

The draft editor's **Rahmenvorlage auf das Titelbild anwenden** checkbox defaults to on. The extension offers the same option under settings. Product imports retain the original Amazon HD URLs. At publication, only image 0 is downloaded and composited with local Sharp on a 1500 × 1500 white canvas. Images 1 onward are sent to eBay as their deduplicated original HD URLs, without re-encoding.

## Overlay

The supplied design is installed as a transparent 1500 × 1500 PNG at `frontend/public/assets/frame-overlay.png` and `amazon-ebay-extension/bridge/assets/frame-overlay.png`. The white source background was removed while keeping both badges, their lettering, and their original corner placement. The frontend falls back to a locally generated SVG if its PNG is absent or invalid. The bridge also accepts an absolute override path through `FRAME_OVERLAY_PATH`. The fallback text is configured with `OVERLAY_TOP_LEFT_TEXT` and `OVERLAY_BOTTOM_RIGHT_TEXT`; both default to the AutoLister brand.

## Storage and retry

Both server flows upload the generated cover to the existing public Supabase Storage bucket `product-images` under `covers/cover_<identifier>_<timestamp>.jpg`. This provides a persistent HTTPS URL for eBay, including when the app runs in a container. The draft keeps its source URLs in `images`, and stores the uploaded cover URL and final eBay image order separately in `cover_image_url` and `published_images`. This avoids applying the frame a second time on a retry. If download, compositing, or upload fails, publishing continues with the original HD image 0. The API returns `imageWarning` in that case.

The deployment needs a server-only Supabase service key with upload permission to `product-images`. The bucket must remain public for eBay to retrieve the cover. Never put this key in the Chrome extension. The migration `20261017101506_draft_main_image_frame_options.sql` adds the draft option and cache fields.
