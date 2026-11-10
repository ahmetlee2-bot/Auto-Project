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

export function isJoybuyTrackedProduct(product: { supplier?: string | null; amazon_asin?: string | null }): boolean {
  return product.supplier === "joybuy_de" || product.supplier === "joybuy" || /^JB-/i.test(String(product.amazon_asin || ""));
}

export function verificationPendingState(source: "Amazon" | "Joybuy" = "Amazon") {
  return {
    // Keep the existing database enum value; the UI renders this explicit
    // marker as "verification pending" without requiring a schema migration.
    sync_status: "error" as const,
    last_error: `VERIFICATION_PENDING: ${source} Preis und Bestand konnten gerade nicht verifiziert werden; die zuletzt gespeicherten Werte bleiben erhalten.`,
  };
}

export function resolveEbayQuantity(input: {
  amazonInStock: boolean;
  desiredQuantity: number;
  manualQuantityOverride: number | null;
  storedQuantity: number;
  liveQuantity: number;
}): { quantity: number; manualQuantityOverride: number | null } {
  const externallyChanged = input.manualQuantityOverride === null && input.liveQuantity !== input.storedQuantity;
  const manualQuantityOverride = externallyChanged ? input.liveQuantity : input.manualQuantityOverride;
  const quantity = manualQuantityOverride ?? (input.amazonInStock ? input.desiredQuantity : 0);
  return { quantity, manualQuantityOverride };
}

export async function syncProductById(id: string, userId?: string): Promise<{ product?: TrackedProduct; skipped?: boolean }> {
  const admin = repricerAdmin();
  const { data: claimed, error: claimError } = await admin.rpc("claim_tracked_product", { p_id: id, p_user_id: userId || null });
  if (claimError) throw new Error(`Synchronisierung konnte nicht gestartet werden: ${claimError.message}`);
  const row = (claimed as TrackedProduct[] | null)?.[0];
  if (!row) return { skipped: true };
  const lease = (claimed as Array<TrackedProduct & { sync_lease_until: string }>)[0].sync_lease_until;
  const checkedAt = new Date().toISOString();
  if (isJoybuyTrackedProduct(row)) {
    const { error } = await admin.from("tracked_products").update({ sync_lease_until: null, updated_at: new Date().toISOString() }).eq("id", id).eq("sync_lease_until", lease);
    if (error) throw new Error(`Joybuy-Synchronisierung muss über die angemeldete Browser-Erweiterung erfolgen: ${error.message}`);
    return { skipped: true };
  }
  let sourceVerificationFailed = false;
  try {
    const live = await fetchEbayListing(row.user_id, row.ebay_item_id, row.amazon_asin);
    let snapshot: Awaited<ReturnType<typeof fetchAmazonSnapshot>>;
    try { snapshot = await fetchAmazonSnapshot(row.amazon_asin); }
    catch (cause) { sourceVerificationFailed = true; throw cause; }
    const nextPrice = snapshot.inStock
      ? row.manual_sale_price != null ? Number(row.manual_sale_price) : Math.max(row.minimum_sale_price || 0, calculateEbayPrice(snapshot.price!, row.estimated_shipping, row.target_margin_percent, row.ebay_fee_percent, row.payment_fee_percent))
      : live.price;
    const quantity = resolveEbayQuantity({ amazonInStock: snapshot.inStock, desiredQuantity: row.desired_quantity,
      manualQuantityOverride: row.manual_quantity_override, storedQuantity: row.ebay_quantity, liveQuantity: live.quantity });
    const nextQuantity = quantity.quantity;
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
      image_url: row.image_url?.includes("/storage/v1/object/public/product-images/covers/") ? row.image_url : snapshot.imageUrl || row.image_url,
      ebay_price: nextPrice,
      ebay_quantity: nextQuantity,
      manual_quantity_override: quantity.manualQuantityOverride,
      sync_status: nextQuantity === 0 ? "out_of_stock" : snapshot.inStock ? priceChanged ? "price_changed" : "synced" : "out_of_stock",
      last_checked_at: checkedAt,
      last_error: null,
      sync_lease_until: null,
      updated_at: new Date().toISOString(),
    }).eq("id", id).eq("sync_lease_until", lease).select("*").single();
    if (error) throw new Error(`Synchronisierung wurde bei eBay ausgeführt, aber nicht gespeichert: ${error.message}`);
    return { product: data as TrackedProduct };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unbekannter Synchronisierungsfehler";
    const pending = sourceVerificationFailed ? verificationPendingState("Amazon") : null;
    const { error } = await admin.from("tracked_products").update({ sync_status: pending?.sync_status || "error", last_error: pending?.last_error || message.slice(0, 500), last_checked_at: checkedAt, sync_lease_until: null, updated_at: new Date().toISOString() }).eq("id", id).eq("sync_lease_until", lease);
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
    const { data, error } = await admin.from("tracked_products").select("id,supplier,amazon_asin").eq("active", true).neq("supplier", "joybuy_de").not("amazon_asin", "like", "JB-%")
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
