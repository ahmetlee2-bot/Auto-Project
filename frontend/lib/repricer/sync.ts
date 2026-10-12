import "server-only";
import { repricerAdmin } from "./admin";
import { fetchAmazonSnapshot } from "./amazon";
import { fetchEbayListing, updateEbayListing } from "./ebay";
import type { TrackedProduct } from "./types";

export function calculateEbayPrice(amazonPrice: number, shipping: number, marginPercent: number, ebayFeePercent: number, paymentFeePercent: number): number {
  const cost = Number(amazonPrice) + Number(shipping);
  const denominator = 1 - (Number(ebayFeePercent) + Number(paymentFeePercent)) / 100;
  if (![amazonPrice, shipping, marginPercent, ebayFeePercent, paymentFeePercent].every((value) => Number.isFinite(Number(value))) ||
      amazonPrice <= 0 || shipping < 0 || marginPercent < 0 || ebayFeePercent < 0 || paymentFeePercent < 0 || denominator <= 0) {
    throw new Error("Preisparameter sind ungültig.");
  }
  const cents = Math.ceil((cost * (1 + marginPercent / 100) / denominator) * 100 - 1e-8);
  if (!Number.isFinite(cents) || cents > 9_999_999_999) throw new Error("Berechneter eBay-Preis ist zu hoch.");
  return cents / 100;
}

export async function syncProductById(id: string, userId?: string): Promise<{ product?: TrackedProduct; skipped?: boolean }> {
  const admin = repricerAdmin();
  const { data: claimed, error: claimError } = await admin.rpc("claim_tracked_product", { p_id: id, p_user_id: userId || null });
  if (claimError) throw new Error(`Synchronisierung konnte nicht gestartet werden: ${claimError.message}`);
  const row = (claimed as TrackedProduct[] | null)?.[0];
  if (!row) return { skipped: true };
  const lease = (claimed as Array<TrackedProduct & { sync_lease_until: string }>)[0].sync_lease_until;
  const checkedAt = new Date().toISOString();
  try {
    const live = await fetchEbayListing(row.user_id, row.ebay_item_id, row.amazon_asin);
    const snapshot = await fetchAmazonSnapshot(row.amazon_asin);
    const nextPrice = snapshot.inStock
      ? calculateEbayPrice(snapshot.price!, row.estimated_shipping, row.target_margin_percent, row.ebay_fee_percent, row.payment_fee_percent)
      : live.price;
    const nextQuantity = snapshot.inStock ? row.desired_quantity : 0;
    const priceChanged = snapshot.price !== null && row.amazon_price !== null && Math.round((snapshot.price - row.amazon_price) * 100) !== 0;
    const ebayPriceChanged = snapshot.inStock && Math.round(((nextPrice || 0) - live.price) * 100) !== 0;
    if (nextQuantity !== live.quantity || ebayPriceChanged) {
      await updateEbayListing({ userId: row.user_id, itemId: row.ebay_item_id, sku: live.sku, price: nextPrice!, quantity: nextQuantity });
    }
    const { data, error } = await admin.from("tracked_products").update({
      amazon_price: snapshot.price ?? row.amazon_price,
      amazon_stock_status: snapshot.inStock,
      amazon_price_delta: snapshot.price !== null && row.amazon_price !== null ? Math.round((snapshot.price - row.amazon_price) * 100) / 100 : null,
      title: snapshot.title || row.title,
      image_url: snapshot.imageUrl || row.image_url,
      ebay_price: nextPrice,
      ebay_quantity: nextQuantity,
      sync_status: snapshot.inStock ? priceChanged ? "price_changed" : "synced" : "out_of_stock",
      last_checked_at: checkedAt,
      last_error: null,
      sync_lease_until: null,
      updated_at: new Date().toISOString(),
    }).eq("id", id).eq("sync_lease_until", lease).select("*").single();
    if (error) throw new Error(`Synchronisierung wurde bei eBay ausgeführt, aber nicht gespeichert: ${error.message}`);
    return { product: data as TrackedProduct };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unbekannter Synchronisierungsfehler";
    const { error } = await admin.from("tracked_products").update({ sync_status: "error", last_error: message.slice(0, 500), last_checked_at: checkedAt, sync_lease_until: null, updated_at: new Date().toISOString() }).eq("id", id).eq("sync_lease_until", lease);
    if (error) throw new Error(`${message} (Status konnte nicht gespeichert werden: ${error.message})`);
    throw new Error(message);
  }
}

export async function syncDueProducts() {
  const cutoff = new Date().toISOString();
  const deadline = Date.now() + 270_000;
  const admin = repricerAdmin();
  const result = { checked: 0, errors: 0, skipped: 0 };
  // Each successful or failed attempt moves last_checked_at past cutoff. Remaining rows form the queue.
  for (let batch = 0; batch < 100; batch += 1) {
    const { data, error } = await admin.from("tracked_products").select("id").eq("active", true)
      .or(`last_checked_at.is.null,last_checked_at.lt.${cutoff}`)
      .or(`sync_lease_until.is.null,sync_lease_until.lt.${new Date().toISOString()}`)
      .order("last_checked_at", { ascending: true, nullsFirst: true }).limit(25);
    if (error) throw new Error(`Produktwarteschlange konnte nicht gelesen werden: ${error.message}`);
    if (!data?.length) break;
    let progress = false;
    for (const item of data) {
      // Reserve enough time for one complete Amazon/eBay attempt and its timeouts.
      if (Date.now() + 180_000 >= deadline) return result;
      try {
        const outcome = await syncProductById(item.id);
        if (outcome.skipped) result.skipped += 1;
        else { result.checked += 1; progress = true; }
      } catch { result.errors += 1; progress = true; }
    }
    if (!progress) break;
  }
  return result;
}
