# Amazon/eBay repricer

`supabase/migrations/20261011213518_tracked_products_repricer.sql` creates the tenant-scoped table, RLS read policy, atomic sync claim function, and imports existing active products. The migration was applied to the Alltaghaus project. Existing rows start as unchecked; neither Amazon availability nor eBay stock is invented. A second migration pauses imported listings until the seller reviews their target margins; new enrollments begin active.

## Runtime configuration

Set these values in the server's root `.env` before restarting Compose:

- `SUPABASE_SERVICE_ROLE_KEY`: server-only key for the existing Supabase project.
- `EBAY_BRIDGE_SHARED_SECRET`: existing random server secret, also supplied as `CRON_SECRET` to the internal scheduler and duplicate-monitor guard.
- `EBAY_LEGACY_OWNER_USER_ID`: UUID of the current single seller account, matching the API service setting. This permits the repricer to use the existing bridge OAuth connection for that seller only.
- `RAINFOREST_API_KEY`: recommended for reliable Amazon.de product data. Without it, the server reads Amazon's structured product data directly. An ambiguous price or stock result leaves the eBay listing unchanged and records an error.
- `EBAY_APP_ID` and `EBAY_CERT_ID`: needed only for per-user OAuth rows stored in `public.ebay_connections`.

The scheduler calls `GET /api/cron/sync-products` with `Authorization: Bearer $CRON_SECRET` every 30 minutes. The endpoint is unavailable without a secret. Its queue processes active rows in order of oldest check and stops before the five-minute request limit; the next run continues with the oldest remaining rows. The `claim_tracked_product` database function prevents simultaneous manual and scheduled updates to the same row.

The dashboard's **Aktive eBay-Angebote** tab reads `tracked_products`, supports manual synchronization, margin changes, pause/resume, deletion, and enrollment of an owned listing. The latter checks seller ownership against the authenticated backend before writing.

Out-of-stock updates set eBay quantity to zero. Some legacy Trading listings reject zero stock if the seller has not enabled eBay's out-of-stock control; the row then shows an error instead of claiming synchronization. Inventory-model listings use `bulk_update_price_quantity` with both inventory and offer quantity.

Compose disables the old bridge monitor when this repricer is installed, so pausing or deleting tracking cannot accidentally reactivate the old price algorithm. Its optional coexistence guard permanently marks transferred listings and skips all tracked IDs, including paused rows; an unavailable managed-ID endpoint aborts that legacy monitor run.

## Deployment

The image update timer does not copy Compose configuration. Install the new `compose.yml` and `deploy/autolister-update.sh` on the server before enabling `repricer-cron`. On the current Hetzner host, the deployment user is `autolister-deploy`; use its existing SSH key. `deploy/install-repricer.sh` backs up the current server configuration, validates required environment settings, adds the Next.js product API route to host Nginx, and starts the services. The script expects the repository's Compose and updater files at `/tmp/autolister-repricer-compose.yml` and `/tmp/autolister-repricer-update.sh`.

The public `/api/tracked-products` route requires a verified Supabase user; internal cron routes are blocked by host Nginx and additionally require a server secret. The cron container reaches Next.js over Docker networking.

Amazon can return an anti-bot page from datacenter IPs. Such a response is an error, never an out-of-stock signal. Configure a real Rainforest key before relying on scheduled source checks. A 30-minute schedule is polling; it cannot detect a source change instantaneously between runs.

## API references

- [eBay bulk price and quantity updates](https://developer.ebay.com/api-docs/sell/static/inventory/bulk-updates.html)
- [eBay Trading ReviseInventoryStatus](https://developer.ebay.com/Devzone/XML/docs/Reference/eBay/ReviseInventoryStatus.html)
- [Rainforest product fields](https://docs.trajectdata.com/rainforestapi/product-data-api/reference/csv-fields)
