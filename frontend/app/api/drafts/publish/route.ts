import { NextResponse } from "next/server";
import { draftRequestUser } from "../../../../lib/drafts/server";
import { calculateDraftTargetPrice } from "../../../../lib/drafts/pricing";
import { repricerAdmin } from "../../../../lib/repricer/admin";
import { getEbayListingSetup, publishEbayDraftProduct, type EbayListingSetup } from "../../../../lib/repricer/ebay";
import { syncProductById } from "../../../../lib/repricer/sync";
import { parseDraftImages } from "../../../../lib/drafts/server";
import { processMainImage } from "../../../../lib/images/processMainImage";

export const runtime = "nodejs";
export const maxDuration = 300;

type PublishSettings = Pick<EbayListingSetup["defaults"], "merchantLocationKey" | "fulfillmentPolicyId" | "paymentPolicyId" | "returnPolicyId">;
type Result = { id: string; published: boolean; trackingLinked?: boolean; listingId?: string; error?: string; syncWarning?: string; imageWarning?: string };

function validSettings(settings: PublishSettings, setup: EbayListingSetup) {
  const has = (value: string, options: Array<{ id: string }>, fallback: string) =>
    Boolean(value) && (options.some((option) => option.id === value) || value === fallback);
  return has(settings.merchantLocationKey, setup.merchantLocations, setup.defaults.merchantLocationKey)
    && has(settings.fulfillmentPolicyId, setup.fulfillmentPolicies, setup.defaults.fulfillmentPolicyId)
    && has(settings.paymentPolicyId, setup.paymentPolicies, setup.defaults.paymentPolicyId)
    && has(settings.returnPolicyId, setup.returnPolicies, setup.defaults.returnPolicyId);
}

export async function POST(request: Request) {
  const user = await draftRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { ids?: unknown; id?: unknown; imageRightsConfirmed?: unknown; settings?: Partial<PublishSettings> };
    if (body.imageRightsConfirmed !== true) return NextResponse.json({ error: "Bitte bestätige vor der Veröffentlichung die Rechte zur Nutzung der Produktbilder." }, { status: 400 });
    const ids = [...new Set(Array.isArray(body.ids) ? body.ids.map(String) : body.id ? [String(body.id)] : [])];
    if (!ids.length || ids.length > 2 || ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
      return NextResponse.json({ error: "Bitte wähle 1 bis 2 gültige Entwürfe aus. Größere Auswahl wird in mehreren sicheren Batches verarbeitet." }, { status: 400 });
    }
    const settings: PublishSettings = {
      merchantLocationKey: String(body.settings?.merchantLocationKey || ""),
      fulfillmentPolicyId: String(body.settings?.fulfillmentPolicyId || ""),
      paymentPolicyId: String(body.settings?.paymentPolicyId || ""),
      returnPolicyId: String(body.settings?.returnPolicyId || ""),
    };
    const setup = await getEbayListingSetup(user.id);
    if (!validSettings(settings, setup)) {
      return NextResponse.json({ error: "Die eBay-Verkaufsrichtlinien oder der Standort fehlen bzw. gehören nicht zu diesem Verkäuferkonto. Bitte lade die eBay-Einstellungen neu und wähle sie erneut aus." }, { status: 400 });
    }
    const admin = repricerAdmin();
    const results: Result[] = [];

    for (const id of ids) {
      const { data: draft, error: readError } = await admin.from("draft_products").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
      if (readError) {
        results.push({ id, published: false, error: readError.message });
        continue;
      }
      if (!draft) {
        results.push({ id, published: false, error: "Entwurf nicht gefunden." });
        continue;
      }
      const { data: claimed, error: claimError } = await admin.from("draft_products").update({ status: "publishing", last_error: null, updated_at: new Date().toISOString() })
        .eq("id", id).eq("user_id", user.id).in("status", ["draft", "error"]).select("id").maybeSingle();
      if (claimError || !claimed) {
        results.push({ id, published: false, error: claimError?.message || "Dieser Entwurf wird bereits bearbeitet oder wurde veröffentlicht." });
        continue;
      }
      try {
        const sourceImages = parseDraftImages(draft.images);
        const price = calculateDraftTargetPrice({ source_price: draft.source_price, shipping_cost: draft.shipping_cost, profit_margin_percent: draft.profit_margin_percent });
        if (!draft.source_price || !price) throw new Error("Für eine Veröffentlichung werden ein gültiger Amazon-Preis und eine berechenbare eBay-Zielsumme benötigt.");
        if (!String(draft.title || "").trim() || String(draft.title).length > 80) throw new Error("Der Titel muss zwischen 1 und 80 Zeichen lang sein.");
        if (!String(draft.selected_category_id || setup.defaults.categoryId || "").trim()) throw new Error("Bitte trage im Entwurf eine eBay-Kategorie-ID ein oder konfiguriere EBAY_DEFAULT_CATEGORY_ID serverseitig.");
        if (!sourceImages.length) throw new Error("Vor der Veröffentlichung muss mindestens ein Produktbild vorhanden sein.");
        const shouldFrame = draft.apply_custom_frame !== false;
        const cachedCover = shouldFrame && draft.cover_source_url === sourceImages[0] ? String(draft.cover_image_url || "") : "";
        const coverUrl = shouldFrame ? cachedCover || await processMainImage(sourceImages[0], draft.id) : sourceImages[0];
        const images = [...new Set([coverUrl, ...sourceImages.slice(1)])].slice(0, 12);
        const imageWarning = shouldFrame && coverUrl === sourceImages[0]
          ? "Das Cover konnte nicht gerahmt werden; das unveränderte Originalbild wurde veröffentlicht."
          : undefined;
        const { error: imageSaveError } = await admin.from("draft_products").update({
          cover_image_url: coverUrl !== sourceImages[0] ? coverUrl : null,
          cover_source_url: coverUrl !== sourceImages[0] ? sourceImages[0] : null,
          published_images: images,
          updated_at: new Date().toISOString(),
        }).eq("id", id).eq("user_id", user.id).eq("status", "publishing");
        if (imageSaveError) throw new Error(`Die Bildauswahl konnte nicht gespeichert werden: ${imageSaveError.message}`);
        const listing = await publishEbayDraftProduct({
          userId: user.id,
          id: draft.id,
          title: draft.title,
          descriptionHtml: draft.description_html || "",
          images,
          categoryId: draft.selected_category_id,
          price,
          settings,
        });

        const { data: tracked, error: trackError } = await admin.from("tracked_products").upsert({
          user_id: user.id,
          title: draft.title,
          image_url: images[0] || null,
          amazon_asin: draft.asin,
          amazon_url: draft.source_url,
          amazon_price: draft.source_price,
          amazon_stock_status: null,
          ebay_item_id: listing.itemId,
          ebay_url: `https://www.ebay.de/itm/${listing.itemId}`,
          ebay_price: listing.price,
          ebay_quantity: listing.quantity,
          target_margin_percent: draft.profit_margin_percent,
          estimated_shipping: draft.shipping_cost,
          desired_quantity: 1,
          active: true,
          last_error: "Erste Amazon-Prüfung wird gestartet.",
        }, { onConflict: "user_id,ebay_item_id" }).select("id").single();
        if (trackError || !tracked) {
          const message = `eBay-Angebot ${listing.itemId} wurde veröffentlicht, aber die Überwachung konnte nicht verknüpft werden: ${trackError?.message || "unbekannter Datenbankfehler"}`;
          await admin.from("draft_products").update({ status: "error", ebay_sku: listing.sku, ebay_offer_id: listing.offerId, ebay_item_id: listing.itemId, last_error: message, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
          results.push({ id, published: false, listingId: listing.itemId, error: message, ...(imageWarning ? { imageWarning } : {}) });
          continue;
        }
        const { error: markError } = await admin.from("draft_products").update({ status: "published", ebay_sku: listing.sku, ebay_offer_id: listing.offerId, ebay_item_id: listing.itemId, last_error: null, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
        if (markError) {
          const statusWarning = `Überwachung ist aktiv; der Veröffentlichungsstatus konnte nicht gespeichert werden: ${markError.message}`;
          await admin.from("draft_products").update({ status: "error", ebay_sku: listing.sku, ebay_offer_id: listing.offerId, ebay_item_id: listing.itemId, last_error: statusWarning.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
          results.push({ id, published: true, trackingLinked: true, listingId: listing.itemId, syncWarning: statusWarning, ...(imageWarning ? { imageWarning } : {}) });
          continue;
        }
        let syncWarning: string | undefined;
        try { await syncProductById(tracked.id, user.id); }
        catch (cause) { syncWarning = cause instanceof Error ? cause.message : "Die erste Amazon-Prüfung ist fehlgeschlagen."; }
        results.push({ id, published: true, trackingLinked: true, listingId: listing.itemId, ...(syncWarning ? { syncWarning } : {}), ...(imageWarning ? { imageWarning } : {}) });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "eBay-Veröffentlichung fehlgeschlagen.";
        await admin.from("draft_products").update({ status: "error", last_error: message.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
        results.push({ id, published: false, error: message });
      }
    }
    return NextResponse.json({ results, published: results.filter((result) => result.published).length }, { status: 200 });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "eBay-Veröffentlichung konnte nicht gestartet werden." }, { status: 502 });
  }
}
