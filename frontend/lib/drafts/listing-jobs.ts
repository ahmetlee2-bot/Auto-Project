import "server-only";
import { calculateDraftTargetPrice, estimateDraftNetProfit, resolveEffectiveDraftPrice } from "./pricing";
import { repricerAdmin } from "../repricer/admin";
import { completeDraftRequiredAspects, getEbayListingSetup, publishEbayDraftProduct, suggestEbayCategories, type EbayListingSetup } from "../repricer/ebay";
import { syncProductById } from "../repricer/sync";
import { parseDraftImages } from "./server";
import { processMainImage } from "../images/processMainImage";
import { dedupeSimilarProductImages } from "../images/dedupeSimilarProductImages";

type PublishSettings = Pick<EbayListingSetup["defaults"], "merchantLocationKey" | "fulfillmentPolicyId" | "paymentPolicyId" | "returnPolicyId">;
type ListingJob = {
  id: string;
  user_id: string;
  draft_id: string;
  store_id: string | null;
  settings: PublishSettings;
  attempts: number;
  max_attempts: number;
};
type PublishOutcome = { listingId: string; syncWarning?: string; imageWarning?: string };

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /\b(?:429|500|502|503|504)\b|rate.?limit|timed? ?out|timeout|ECONNRESET|ECONNREFUSED|EAI_AGAIN|fetch failed|network error|temporarily unavailable/i.test(message);
}

async function setProgress(job: ListingJob, progress: number, currentStep: string) {
  const admin = repricerAdmin();
  const now = new Date().toISOString();
  const [{ error: jobError }, { error: draftError }] = await Promise.all([
    admin.from("draft_listing_jobs").update({ progress, current_step: currentStep, lease_until: new Date(Date.now() + 10 * 60_000).toISOString(), updated_at: now }).eq("id", job.id).eq("status", "processing"),
    admin.from("draft_products").update({ status: "publishing", updated_at: now }).eq("id", job.draft_id).eq("user_id", job.user_id).in("status", ["draft", "error", "publishing"]),
  ]);
  if (jobError) throw jobError;
  if (draftError) throw draftError;
}

async function publishOne(job: ListingJob): Promise<PublishOutcome> {
  const admin = repricerAdmin();
  const setup = await getEbayListingSetup(job.user_id, job.store_id || undefined);
  const settings: PublishSettings = {
    merchantLocationKey: String(job.settings?.merchantLocationKey || ""),
    fulfillmentPolicyId: String(job.settings?.fulfillmentPolicyId || ""),
    paymentPolicyId: String(job.settings?.paymentPolicyId || ""),
    returnPolicyId: String(job.settings?.returnPolicyId || ""),
  };
  const { data: draft, error: readError } = await admin.from("draft_products").select("*").eq("id", job.draft_id).eq("user_id", job.user_id).maybeSingle();
  if (readError) throw readError;
  if (!draft) throw new Error("Taslak bulunamadı; kaydedilmiş ürün bilgileri korunuyor.");

  // A prior attempt may have created the eBay listing before monitoring was
  // linked. Reconcile it first so a retry never intentionally creates a copy.
  if (draft.ebay_item_id) {
    const itemId = String(draft.ebay_item_id);
    const reconciledPrice = resolveEffectiveDraftPrice(draft) ?? draft.target_price;
    const manualProfit = draft.manual_sale_price != null ? estimateDraftNetProfit(draft, draft.manual_sale_price) : null;
    const safeManual = manualProfit !== null && manualProfit < 0 && Number(draft.profit_margin_percent ?? 20) > 0 ? null : draft.manual_sale_price;
    const { error: trackError } = await admin.from("tracked_products").upsert({
      user_id: job.user_id,
      title: draft.title,
      image_url: parseDraftImages(draft.published_images || draft.images)[0] || null,
      amazon_asin: draft.asin,
      amazon_url: draft.source_url,
      supplier: draft.supplier || "amazon_de",
      amazon_price: draft.source_price,
      amazon_stock_status: null,
      ebay_item_id: itemId,
      ebay_url: `https://www.ebay.de/itm/${itemId}`,
      ebay_price: reconciledPrice,
      manual_sale_price: safeManual,
      ebay_quantity: draft.quantity || 1,
      target_margin_percent: draft.profit_margin_percent,
      estimated_shipping: draft.shipping_cost,
      desired_quantity: draft.quantity || 1,
      active: true,
      last_error: draft.supplier === "joybuy_de" ? "VERIFICATION_PENDING: Erste Preis- und Bestandsprüfung wartet auf die angemeldete Browser-Erweiterung." : null,
    }, { onConflict: "user_id,ebay_item_id" });
    if (trackError) throw new Error(`eBay-Angebot ist bereits live (${itemId}), aber die Bestandsüberwachung konnte nicht verknüpft werden: ${trackError.message}`);
    const { error: markError } = await admin.from("draft_products").update({ status: "published", last_error: null, updated_at: new Date().toISOString() }).eq("id", job.draft_id).eq("user_id", job.user_id);
    if (markError) throw markError;
    return { listingId: itemId, ...(draft.supplier === "joybuy_de" ? { syncWarning: "Die erste Joybuy-Prüfung wartet auf die angemeldete Erweiterung." } : {}) };
  }

  await setProgress(job, 20, "Ürün verileri ve kategori hazırlanıyor…");
  const sourceImages = await dedupeSimilarProductImages(parseDraftImages(draft.images));
  const calculatedPrice = calculateDraftTargetPrice({ source_price: draft.source_price, shipping_cost: draft.shipping_cost, profit_margin_percent: draft.profit_margin_percent });
  const price = resolveEffectiveDraftPrice(draft) ?? calculatedPrice;
  const manualProfit = draft.manual_sale_price != null ? estimateDraftNetProfit(draft, draft.manual_sale_price) : null;
  const safeManual = manualProfit !== null && manualProfit < 0 && Number(draft.profit_margin_percent ?? 20) > 0 ? null : draft.manual_sale_price;
  if ((!draft.source_price && draft.manual_sale_price == null) || price == null || !Number.isFinite(price) || price <= 0) throw new Error("Geçerli bir eBay satış fiyatı girin veya kaynak fiyatını yenileyin.");
  if (!String(draft.title || "").trim() || String(draft.title).length > 80) throw new Error("İlan başlığı 1 ile 80 karakter arasında olmalıdır.");
  let categoryId = String(draft.selected_category_id || setup.defaults.categoryId || "").trim();
  let categoryName = "";
  if (!categoryId) {
    const categories = await suggestEbayCategories(job.user_id, String(draft.title), setup.storeId || undefined);
    categoryId = categories[0]?.id || "";
    categoryName = categories[0]?.name || "";
    if (!categoryId) throw new Error("eBay bu ürün için kategori önermedi. Taslağı düzenleyip kategori seçin.");
  }
  const currentSpecifics = draft.item_specifics && typeof draft.item_specifics === "object" && !Array.isArray(draft.item_specifics)
    ? draft.item_specifics as Record<string, string[]> : {};
  const completedSpecifics = await completeDraftRequiredAspects(
    job.user_id, setup.storeId || undefined, categoryId, String(draft.title), String(draft.description_html || ""), currentSpecifics, categoryName,
  );
  const { error: aspectSaveError } = await admin.from("draft_products").update({
    selected_category_id: categoryId, item_specifics: completedSpecifics, updated_at: new Date().toISOString(),
  }).eq("id", job.draft_id).eq("user_id", job.user_id).eq("status", "publishing");
  if (aspectSaveError) throw new Error(`Kategori ve zorunlu ürün özellikleri kaydedilemedi: ${aspectSaveError.message}`);
  if (!sourceImages.length) throw new Error("Yayın öncesinde en az bir ürün görseli ekleyin.");

  await setProgress(job, 50, "Görseller ve ürün özellikleri hazırlanıyor…");
  const shouldFrame = draft.apply_custom_frame !== false;
  const cachedCover = shouldFrame && draft.cover_source_url === sourceImages[0] ? String(draft.cover_image_url || "") : "";
  let coverUrl = sourceImages[0];
  if (shouldFrame) {
    try { coverUrl = cachedCover || await processMainImage(sourceImages[0], draft.id); }
    catch { coverUrl = sourceImages[0]; }
  }
  const images = [...new Set([coverUrl, ...sourceImages.slice(1)])].slice(0, 12);
  const imageWarning = shouldFrame && coverUrl === sourceImages[0]
    ? "Kapak görseli çerçevelenemedi; özgün görselle devam edildi."
    : undefined;
  const { error: imageSaveError } = await admin.from("draft_products").update({
    cover_image_url: coverUrl !== sourceImages[0] ? coverUrl : null,
    cover_source_url: coverUrl !== sourceImages[0] ? sourceImages[0] : null,
    published_images: images,
    updated_at: new Date().toISOString(),
  }).eq("id", job.draft_id).eq("user_id", job.user_id).eq("status", "publishing");
  if (imageSaveError) throw new Error(`Görsel seçimi taslağa kaydedilemedi: ${imageSaveError.message}`);

  await setProgress(job, 85, "İlan eBay’de yayınlanıyor…");
  const listing = await publishEbayDraftProduct({
    userId: job.user_id,
    storeId: setup.storeId || undefined,
    id: draft.id,
    title: draft.title,
    descriptionHtml: draft.description_html || "",
    images,
    categoryId,
    price,
    quantity: draft.quantity || 1,
    itemSpecifics: completedSpecifics,
    settings,
  });
  const { data: tracked, error: trackError } = await admin.from("tracked_products").upsert({
    user_id: job.user_id,
    title: draft.title,
    image_url: images[0] || null,
    amazon_asin: draft.asin,
    amazon_url: draft.source_url,
    supplier: draft.supplier || "amazon_de",
    amazon_price: draft.source_price,
    amazon_stock_status: null,
    ebay_item_id: listing.itemId,
    ebay_url: `https://www.ebay.de/itm/${listing.itemId}`,
    ebay_price: listing.price,
    manual_sale_price: safeManual,
    ebay_quantity: listing.quantity,
    target_margin_percent: draft.profit_margin_percent,
    estimated_shipping: draft.shipping_cost,
    desired_quantity: draft.quantity || 1,
    active: true,
    last_error: draft.supplier === "joybuy_de" ? "VERIFICATION_PENDING: Erste Preis- und Bestandsprüfung wartet auf die angemeldete Browser-Erweiterung." : null,
  }, { onConflict: "user_id,ebay_item_id" }).select("id").single();
  if (trackError || !tracked) {
    const message = `eBay-Angebot ${listing.itemId} wurde veröffentlicht, aber die Überwachung konnte nicht verknüpft werden: ${trackError?.message || "unbekannter Datenbankfehler"}`;
    const { error } = await admin.from("draft_products").update({ status: "error", ebay_sku: listing.sku, ebay_offer_id: listing.offerId, ebay_item_id: listing.itemId, last_error: message, updated_at: new Date().toISOString() }).eq("id", job.draft_id).eq("user_id", job.user_id);
    if (error) throw error;
    return { listingId: listing.itemId, syncWarning: message, ...(imageWarning ? { imageWarning } : {}) };
  }
  const { error: markError } = await admin.from("draft_products").update({ status: "published", ebay_sku: listing.sku, ebay_offer_id: listing.offerId, ebay_item_id: listing.itemId, last_error: null, updated_at: new Date().toISOString() }).eq("id", job.draft_id).eq("user_id", job.user_id);
  if (markError) {
    const statusWarning = `Überwachung aktiv; Veröffentlichungsstatus konnte nicht gespeichert werden: ${markError.message}`;
    await admin.from("draft_products").update({ status: "error", ebay_sku: listing.sku, ebay_offer_id: listing.offerId, ebay_item_id: listing.itemId, last_error: statusWarning.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", job.draft_id).eq("user_id", job.user_id);
    return { listingId: listing.itemId, syncWarning: statusWarning, ...(imageWarning ? { imageWarning } : {}) };
  }
  let syncWarning: string | undefined;
  if (draft.supplier !== "joybuy_de") {
    try { await syncProductById(tracked.id, job.user_id); }
    catch (cause) { syncWarning = cause instanceof Error ? cause.message : "İlk tedarikçi kontrolü başarısız oldu."; }
  }
  return {
    listingId: listing.itemId,
    ...(draft.supplier === "joybuy_de" ? { syncWarning: "Joybuy ilk kontrolü giriş yapılmış eklentiyi bekliyor." } : syncWarning ? { syncWarning } : {}),
    ...(imageWarning ? { imageWarning } : {}),
  };
}

let localDrain: Promise<{ processed: number }> | null = null;

export function drainDraftListingQueue(maxJobs = 100): Promise<{ processed: number }> {
  if (localDrain) return Promise.resolve({ processed: 0 });
  localDrain = (async () => {
    const admin = repricerAdmin();
    let processed = 0;
    while (processed < maxJobs) {
      const { data, error } = await admin.rpc("claim_next_draft_listing_job");
      if (error) throw error;
      const job = (Array.isArray(data) ? data[0] : data) as ListingJob | null;
      if (!job) break;
      processed += 1;
      try {
        const outcome = await publishOne(job);
        const now = new Date().toISOString();
        const warning = [outcome.syncWarning, outcome.imageWarning].filter(Boolean).join(" · ") || null;
        const { error: completeError } = await admin.from("draft_listing_jobs").update({
          status: "completed", progress: 100, current_step: "Başarıyla listelendi", last_error: warning,
          lease_until: null, completed_at: now, updated_at: now,
        }).eq("id", job.id).eq("status", "processing");
        if (completeError) throw completeError;
      } catch (cause) {
        const message = (cause instanceof Error ? cause.message : "Yayınlama sırasında beklenmeyen bir hata oluştu.").slice(0, 1000);
        const isRetry = retryable(cause) && job.attempts < job.max_attempts;
        if (isRetry) {
          const waitMs = Math.min(2_000 * (2 ** Math.max(0, job.attempts - 1)), 8_000);
          const now = new Date().toISOString();
          await admin.from("draft_listing_jobs").update({
            status: "processing", progress: 20, current_step: `Geçici bağlantı hatası; ${Math.ceil(waitMs / 1000)} saniye sonra yeniden denenecek.`,
            last_error: null, lease_until: new Date(Date.now() + 10 * 60_000).toISOString(), available_at: new Date(Date.now() + waitMs).toISOString(), updated_at: now,
          }).eq("id", job.id).eq("status", "processing");
          await admin.from("draft_products").update({ status: "publishing", last_error: null, updated_at: now }).eq("id", job.draft_id).eq("user_id", job.user_id);
          await delay(waitMs);
          await admin.from("draft_listing_jobs").update({ status: "queued", current_step: "Sırada bekliyor", lease_until: null, available_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id).eq("status", "processing");
          continue;
        }
        const now = new Date().toISOString();
        await admin.from("draft_listing_jobs").update({
          status: "failed", current_step: "Hata oluştu", last_error: message, lease_until: null, completed_at: now, updated_at: now,
        }).eq("id", job.id).eq("status", "processing");
        await admin.from("draft_products").update({ status: "error", last_error: message, updated_at: now }).eq("id", job.draft_id).eq("user_id", job.user_id);
      }
    }
    return { processed };
  })().finally(() => { localDrain = null; });
  return localDrain;
}
