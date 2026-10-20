# Draft product sourcing pool

## Dashboard flow

1. Save a product from the Chrome extension to **Produktpool**.
2. Choose **In Entwürfe übernehmen** to move it into **Produktentwürfe**.
3. Review the title, images, category, description, margin, and shipping cost.
4. Publish one or up to two drafts per API request. The dashboard automatically splits larger selections into batches of two so each eBay listing and initial tracking sync can finish within the server request limit.
5. Successful eBay listings are inserted into `tracked_products` and immediately sent through the repricer sync once. The scheduled sync container continues the normal polling cycle.

## Server configuration

The eBay setup selector reads the signed-in seller's locations and policies through their eBay OAuth connection. If the seller account has multiple choices, users select the desired location and fulfillment, payment, and return policies in the dashboard. Selections are stored in that browser's local storage and are verified against the current seller account again on publish.

eBay requires a category for an offer. Set `EBAY_DEFAULT_CATEGORY_ID` for a default or enter a category ID in each draft before publishing. Optional server defaults are `EBAY_MERCHANT_LOCATION_KEY`, `EBAY_FULFILLMENT_POLICY_ID`, `EBAY_PAYMENT_POLICY_ID`, and `EBAY_RETURN_POLICY_ID`.

`OPENAI_API_KEY` enables the server-side title optimizer. It is optional for drafting and publishing and must never be exposed through a `NEXT_PUBLIC_` variable. `OPENAI_MODEL` is optional and defaults to `gpt-6-astra`.

Amazon source prices and stock availability must be available from the configured Amazon data provider for the immediate first repricer sync to succeed. When that check fails, the eBay listing and tracked product remain in place with the sync error visible in the existing product management view.

Before publishing, the user must confirm that they have the necessary rights to use the product images and listing content.
