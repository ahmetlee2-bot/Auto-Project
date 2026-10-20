# AutoLister Pro upgrade setup

This upgrade adds multi-store eBay OAuth, an admin-curated product depot, a paced listing queue, order fulfillment actions, and a private Academy media area.

## Database

Apply `supabase/migrations/20261018002428_autolister_pro_upgrade.sql` to the Supabase project before enabling the new Dashboard routes. The migration creates the tables, indexes, RLS policies, private `academy-media` bucket, and starter Academy lessons. It is an idempotent initial migration; do not apply it manually to a different schema that already created any of these tables.

## Server configuration

Set these values only in server-side environment variables. Never expose service keys or eBay secrets through `NEXT_PUBLIC_*` variables.

- `SUPABASE_SERVICE_ROLE_KEY`: server-side Supabase key used by the protected routes.
- `AUTOLISTER_ADMIN_USER_IDS`: comma-separated Supabase Auth user UUIDs allowed to import pool products and manage Academy lessons.
- `EBAY_APP_ID` and `EBAY_CERT_ID` (or the equivalent `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET`): eBay application credentials.
- `EBAY_MULTI_STORE_RU_NAME`: the exact RuName registered in the eBay Developer Portal. Configure its callback URL as `https://autolister-app.de/api/ebay/stores/callback` and enable the OAuth scopes used by the application.
- `EBAY_TOKEN_ENCRYPTION_KEY`: 32 random bytes encoded as Base64 or 64 hexadecimal characters. This encrypts OAuth access and refresh tokens at rest.
- `EBAY_OAUTH_STATE_SECRET`: a long random secret used to sign the OAuth state cookie.
- `EBAY_ENV`: `production` for live eBay accounts or `sandbox` for test accounts.
- `EBAY_MERCHANT_LOCATION_KEY`, `EBAY_FULFILLMENT_POLICY_ID`, `EBAY_PAYMENT_POLICY_ID`, and `EBAY_RETURN_POLICY_ID`: optional defaults. Each shop can also store its own values in Dashboard settings.
- `RAINFOREST_API_KEY`: optional. Required only for enriching ASIN-only product imports. Complete product JSON imports do not use Rainforest.
- `CRON_SECRET`: the queue worker checks this secret. In the current Compose file it is wired to `EBAY_BRIDGE_SHARED_SECRET` for the internal cron container.

Use unique random secrets in production and keep backups of the token encryption key. Rotating it without re-encrypting stored eBay tokens will require shops to reconnect.

## Running the listing flow

1. Sign in with an account whose UUID is in `AUTOLISTER_ADMIN_USER_IDS` to review and import products.
2. Connect each seller account with the Dashboard store switcher. The OAuth callback stores encrypted tokens and selects the newly connected shop.
3. Set the shop's actual eBay merchant location and fulfillment, payment, and return policy IDs in Queue settings.
4. Import an ASIN list (requires Rainforest) or complete product JSON. ASIN imports stay unpublished until an administrator supplies the eBay category and confirms the product-rights/VERO review.
5. Queue approved products. The worker publishes through eBay Inventory API no more often than the configured interval and daily limit. It runs every five minutes in Compose.

Prices are calculated per selected shop from the Amazon source price, estimated shipping, the shop's margin, and a configured 15% fee estimate. The current depot supports Amazon DE→EUR eBay marketplaces and Amazon US→USD eBay US. Cross-currency listings are skipped until an exchange-rate source is configured; the system does not guess a conversion rate.

## Academy and orders

Academy videos can be uploaded to the private Supabase bucket with short-lived upload and playback URLs. The maximum upload size is 500 MB. Learners can only play videos attached to published lessons.

Orders are read through eBay Fulfillment API. The tracking form sends the carrier code and actual carrier tracking number entered by the seller; it does not create or transform tracking identifiers.

## Build

From `frontend/`, run `npm run build` after configuring environment variables. This validates the Next.js production build and TypeScript types.
