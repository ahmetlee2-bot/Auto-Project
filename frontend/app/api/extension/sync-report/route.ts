import { NextResponse } from "next/server";
import { draftRequestUser } from "../../../../lib/drafts/server";
import { repricerAdmin } from "../../../../lib/repricer/admin";
import { calculateEbayPrice, resolveEbayQuantity } from "../../../../lib/repricer/sync";
import { fetchEbayListing, updateEbayListing } from "../../../../lib/repricer/ebay";

export const runtime = "nodejs";

function joybuyId(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !/(^|\.)joybuy\.de$/i.test(url.hostname)) return "";
    return url.pathname.match(/\/(?:dp\/[^/]+\/|dg\/|landingPage\/dp\/)(\d{6,20})(?:\/|$)/i)?.[1] || "";
  } catch { return ""; }
}

export async function POST(request: Request) {
  const user = await draftRequestUser(request);
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  try {
    const body = await request.json() as { id?: unknown; sourceUrl?: unknown; sourceProductId?: unknown; status?: unknown; priceEur?: unknown; inStock?: unknown; reason?: unknown };
    const id = String(body.id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Geçerli senkronizasyon kaydı kimliği gerekli." }, { status: 400 });
    const sourceUrl = String(body.sourceUrl || "");
    const reportedId = joybuyId(sourceUrl);
    if (!reportedId) return NextResponse.json({ error: "Geçerli Joybuy ürün kaynağı gerekli." }, { status: 400 });
    const admin = repricerAdmin();
    const { data: row, error: readError } = await admin.from("tracked_products")
      .select("id,user_id,supplier,amazon_url,amazon_asin,amazon_price,amazon_stock_status,ebay_item_id,ebay_price,ebay_quantity,target_margin_percent,estimated_shipping,ebay_fee_percent,payment_fee_percent,desired_quantity,minimum_sale_price,manual_sale_price,manual_quantity_override,last_checked_at,active")
      .eq("id", id).eq("user_id", user.id).eq("supplier", "joybuy_de").maybeSingle();
    if (readError) throw readError;
    if (!row) return NextResponse.json({ error: "Joybuy-Überwachungseintrag nicht gefunden." }, { status: 404 });
    if (!row.active) return NextResponse.json({ error: "Joybuy eklenti eşitlemesi bu ürün için duraklatılmış." }, { status: 409 });
    if (joybuyId(String(row.amazon_url || "")) !== reportedId) return NextResponse.json({ error: "Rapor, kayıtlı Joybuy ürün bağlantısıyla eşleşmiyor." }, { status: 409 });

    const checkedAt = new Date().toISOString();
    if (body.status === "verification_pending") {
      const reason = String(body.reason || "Joybuy-Seite konnte nicht sicher geprüft werden.").replace(/[\r\n]+/g, " ").slice(0, 300);
      const { error } = await admin.from("tracked_products").update({ sync_status: "error", last_error: `VERIFICATION_PENDING: ${reason}`, last_checked_at: checkedAt, updated_at: checkedAt }).eq("id", id).eq("user_id", user.id).eq("active", true);
      if (error) throw error;
      return NextResponse.json({ status: "verification_pending", changed: false, checkedAt });
    }
    const price = Number(body.priceEur);
    if (body.status !== "verified" || !Number.isFinite(price) || price <= 0 || price > 1_000_000 || typeof body.inStock !== "boolean" || String(body.sourceProductId || "") !== reportedId) {
      return NextResponse.json({ error: "Preis, Bestand oder Produkt-ID ist nicht verifiziert." }, { status: 400 });
    }

    const live = await fetchEbayListing(user.id, String(row.ebay_item_id), String(row.amazon_asin));
    const sourceChanged = row.amazon_price == null || Math.round((price - Number(row.amazon_price)) * 100) !== 0;
    const inStock = body.inStock;
    const nextPrice = inStock
      ? row.manual_sale_price != null ? Number(row.manual_sale_price) : Math.max(Number(row.minimum_sale_price || 0), calculateEbayPrice(price, Number(row.estimated_shipping), Number(row.target_margin_percent), Number(row.ebay_fee_percent), Number(row.payment_fee_percent)))
      : live.price;
    const quantity = resolveEbayQuantity({ amazonInStock: inStock, desiredQuantity: Number(row.desired_quantity), manualQuantityOverride: row.manual_quantity_override == null ? null : Number(row.manual_quantity_override), storedQuantity: Number(row.ebay_quantity), liveQuantity: live.quantity });
    const nextQuantity = inStock ? quantity.quantity : 0;
    const priceChanged = inStock && Math.round((nextPrice - live.price) * 100) !== 0;
    const stockChanged = nextQuantity !== live.quantity;
    if (priceChanged || stockChanged) await updateEbayListing({ userId: user.id, itemId: String(row.ebay_item_id), sku: live.sku, price: nextPrice, quantity: nextQuantity });
    const { error: saveError } = await admin.from("tracked_products").update({
      amazon_price: price,
      amazon_stock_status: inStock,
      amazon_price_delta: row.amazon_price == null ? null : Math.round((price - Number(row.amazon_price)) * 100) / 100,
      ebay_price: nextPrice,
      ebay_quantity: nextQuantity,
      manual_quantity_override: quantity.manualQuantityOverride,
      sync_status: !inStock || nextQuantity === 0 ? "out_of_stock" : sourceChanged ? "price_changed" : "synced",
      last_checked_at: checkedAt,
      last_error: null,
      updated_at: checkedAt,
    }).eq("id", id).eq("user_id", user.id).eq("active", true);
    if (saveError) throw new Error(`eBay wurde aktualisiert, aber der Sync-Status konnte nicht gespeichert werden: ${saveError.message}`);
    return NextResponse.json({ status: nextQuantity === 0 ? "out_of_stock" : sourceChanged ? "price_changed" : "synced", changed: priceChanged || stockChanged, priceEur: price, inStock, ebayPrice: nextPrice, ebayQuantity: nextQuantity, checkedAt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Joybuy-Sync-Bericht konnte nicht verarbeitet werden." }, { status: 502 });
  }
}
