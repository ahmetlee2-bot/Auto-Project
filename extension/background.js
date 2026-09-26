if (typeof importScripts === "function") importScripts("cloudClient.js");
if (typeof importScripts === "function") importScripts("config.js", "priceCalculator.js", "imageProcessor.js", "offscreen.js", "listing_builder.js", "amazon_parser.js", "bridgeClient.js");

const priceTools = globalThis.AlltaghausPrice || {
  calculateSalePrice(source, marginPercent) {
    const margin = Number(marginPercent) / 100;
    if (!Number.isFinite(source) || !Number.isFinite(margin) || margin < 0 || margin >= 0.9) return null;
    return (Math.ceil(source / (1 - margin)) - 0.01).toFixed(2);
  },
};

const MONITOR_ALARM = "amazon-product-monitor";
const IMAGE_PIPELINE_VERSION = 4;
const SETTINGS_VERSION = 7;
const DEFAULT_SETTINGS = {
  apiBaseUrl: globalThis.AlltaghausConfig.API_BASE_URL,
  draftMode: false,
  autoPublish: true,
  monitorIntervalMinutes: 30,
  marketplaceId: "EBAY_DE",
  currency: "EUR",
  categoryId: "",
  merchantLocationKey: "",
  fulfillmentPolicyId: "",
  paymentPolicyId: "",
  returnPolicyId: "",
  lowStockThreshold: 3,
  customImageOverlay: false,
};
let monitorInFlight = false;
const MAX_GALLERY_PAYLOAD_BYTES = 18_000_000;

function generateEbaySku() {
  return `DE-INV-${String(Date.now()).slice(-10)}${Math.floor(Math.random() * 900 + 100)}`;
}

function sanitizePublicText(value) {
  return String(value || "")
    .replace(/\bAMZ(?:[-_\s]*[A-Z0-9]{0,12})?\b/gi, " ")
    .replace(/\bB0[A-Z0-9]{8}\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function mandatoryListingDescription(product) {
  const candidate = product.ebayDescription || product.descriptionHtml || "";
  if (globalThis.AlltaghausListingBuilder?.hasStandardListingDescription(candidate)) {
    return sanitizePublicText(candidate);
  }
  const description = product.description || candidate || "Bitte beachten Sie die Produktdetails und Herstellerangaben.";
  const html = globalThis.AlltaghausListingBuilder?.buildListingDescription({ description, legalNotice: product.legalNotice || "" })
    || `<div><h2>Produktbeschreibung</h2><p>${String(description).replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[character]))}</p><h3>Ihre Vorteile bei uns</h3><p>Blitzversand aus Deutschland</p></div>`;
  return sanitizePublicText(html);
}

function pipelineMessage(error) {
  return globalThis.AlltaghausBridge?.displayError(error) || (error instanceof Error ? error.message : String(error));
}

async function recordPipelineEvent(event) {
  const { pipelineEvents = [] } = await chrome.storage.local.get(["pipelineEvents"]);
  pipelineEvents.unshift({ at: new Date().toISOString(), ...event });
  await chrome.storage.local.set({
    pipelineEvents: pipelineEvents.slice(0, 50),
    latestPipelineStatus: pipelineEvents[0],
  });
}

function normalizeApiBaseUrl() { return "https://api.autolister-app.de/api/v1"; }

function canonicalAmazonProduct(value) {
  try {
    const url = new URL(String(value || ""));
    if (!/(^|\.)amazon\.de$/i.test(url.hostname)) throw new Error();
    const asin = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i)?.[1]?.toUpperCase();
    if (!asin) throw new Error();
    return { asin, amazonUrl: `https://www.amazon.de/dp/${asin}` };
  } catch { throw new Error("Bitte eine gültige Amazon.de Produkt-URL mit ASIN eingeben."); }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    console.error("FETCH ERROR:", { url, error });
    const reason = error?.name === "AbortError" ? "Zaman aşımı" : (error?.message || "Bağlantı kurulamadı");
    throw new Error(`Bağlantı hatası (${reason}): ${url}`);
  } finally {
    clearTimeout(timeout);
  }
}

function highResolutionImageUrl(value) {
  return globalThis.AlltaghausAmazonParser.normalizeImageUrl(value);
}

async function processImageToCleanBase64(imageUrl, { applyOverlay = false } = {}) {
  const sourceUrl = highResolutionImageUrl(imageUrl);
  if (!/^https:\/\//i.test(sourceUrl)) throw new Error("Görsel HTTPS URLsi olmalı.");
  let bitmap;
  try {
    const attempts = [];
    for (const candidate of globalThis.AlltaghausAmazonParser.imageCandidates(imageUrl)) {
      try {
        const response = await fetchWithTimeout(candidate, { cache: "no-store" }, 12_000);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const decoded = await createImageBitmap(await response.blob());
        attempts.push(`${decoded.width}x${decoded.height}`);
        if (!bitmap || Math.max(decoded.width, decoded.height) > Math.max(bitmap.width, bitmap.height)) {
          bitmap?.close(); bitmap = decoded;
        } else decoded.close();
        if (Math.max(bitmap.width, bitmap.height) >= 1500) break;
      } catch (error) { attempts.push(error.message); }
    }
    if (!bitmap?.width || !bitmap?.height || Math.max(bitmap.width, bitmap.height) < 500) {
      throw new Error(`Ürünün yüksek çözünürlüklü görseli alınamadı (${attempts.join('; ')}). Kaynak: ${sourceUrl}`);
    }
    // Preserve the complete source image. A square, white canvas prevents visual
    // distortion while satisfying the minimum eBay image size requirement.
    const longestSide = Math.max(bitmap.width, bitmap.height);
    const targetLongestSide = Math.max(500, Math.min(1600, longestSide));
    const scale = targetLongestSide / longestSide;
    const drawWidth = Math.max(1, Math.round(bitmap.width * scale));
    const drawHeight = Math.max(1, Math.round(bitmap.height * scale));
    const targetWidth = targetLongestSide;
    const targetHeight = targetLongestSide;
    const canvas = new OffscreenCanvas(targetWidth, targetHeight);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Offscreen Canvas 2D bağlamı oluşturulamadı.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, targetWidth, targetHeight);
    context.drawImage(bitmap, Math.round((targetWidth - drawWidth) / 2), Math.round((targetHeight - drawHeight) / 2), drawWidth, drawHeight);
    const pixels = context.getImageData(0, 0, targetWidth, targetHeight).data;
    let hasContent = false;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] < 250 || pixels[i + 1] < 250 || pixels[i + 2] < 250) { hasContent = true; break; }
    }
    if (!hasContent) throw new Error("Bos/beyaz gorsel galeriye eklenmedi.");
    // Hash before drawing badges, so a duplicate without badges is also removed.
    const digest = await crypto.subtle.digest("SHA-256", pixels);
    const pixelHash = `${targetWidth}:` + [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    if (applyOverlay) {
      if (!globalThis.AlltaghausOverlay) throw new Error("Rozet motoru yuklenemedi.");
      await globalThis.AlltaghausOverlay.drawCustomOverlay(context, targetWidth, targetHeight);
    }
    const cleanBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.98 });
    const dataUrl = globalThis.AlltaghausImage?.blobToDataUrl
      ? await globalThis.AlltaghausImage.blobToDataUrl(cleanBlob)
      : `data:image/jpeg;base64,${btoa(String.fromCharCode(...new Uint8Array(await cleanBlob.arrayBuffer())))}`;
    if (!cleanBlob.size) throw new Error("Canvas bos dosya uretti.");
    return { dataUrl, mimeType: "image/jpeg", cropRatio: 0, width: targetWidth, height: targetHeight, pixelHash, pipelineVersion: IMAGE_PIPELINE_VERSION, overlayApplied: applyOverlay };
  } catch (error) {
    console.error("CANVAS IMAGE ERROR:", { sourceUrl, applyOverlay, stage: "CANVAS_DECODE_RENDER", message: error.message });
    throw error;
  } finally {
    bitmap?.close();
  }
}

async function processGalleryImages(urls) {
  const uniqueUrls = [...new Set((Array.isArray(urls) ? urls : [])
    .map(highResolutionImageUrl)
    .filter((url) => /^https:\/\//i.test(String(url))))].slice(0, 12);
  if (!uniqueUrls.length) throw new Error("İşlenecek galeri görseli bulunamadı.");
  // Process the primary image first: its failure must never silently promote a detail image.
  const successful = [{ url: uniqueUrls[0], asset: await processImageToCleanBase64(uniqueUrls[0], { applyOverlay: true }) }];
  const seen = new Set([successful[0].asset.pixelHash]);
  const failures = [];
  for (const url of uniqueUrls.slice(1)) {
    try {
      const asset = await processImageToCleanBase64(url);
      if (!seen.has(asset.pixelHash)) { successful.push({ url, asset }); seen.add(asset.pixelHash); }
    } catch (error) { failures.push({ url, message: error.message }); console.error("GALLERY IMAGE ERROR:", url, error); }
  }
  if (!successful.length) throw new Error("Kaynak görseller çözülemedi; lütfen ürün sayfasını yenileyip tekrar deneyin.");
  const payloadBytes = successful.reduce((total, item) => total + Math.ceil(item.asset.dataUrl.length * 0.75), 0);
  if (payloadBytes > MAX_GALLERY_PAYLOAD_BYTES) throw new Error("İşlenmiş görsel paketi çok büyük; ürün galerisi güvenli payload sınırını aşıyor.");
  return {
    images: successful.map((item) => item.asset),
    sourceUrls: successful.map((item) => item.url),
    skipped: uniqueUrls.length - successful.length,
    failures,
  };
}

async function buildProcessedGallery(product, settings) {
  const sourceUrls = [...new Set([
    ...(product.images || []), ...(product.descriptionImages || []),
  ].map(highResolutionImageUrl).filter(Boolean))].slice(0, 12);
  const assets = product.processedImageData || [];
  const references = (product.processedSourceUrls || []).map(highResolutionImageUrl);
  const cacheValid = assets.length === sourceUrls.length && references.length === assets.length
    && assets.every((asset, index) => asset.pipelineVersion === IMAGE_PIPELINE_VERSION && asset.pixelHash
      && asset.overlayApplied === (index === 0) && asset.width >= 500 && asset.height >= 500
      && references[index] === sourceUrls[index]);
  const gallery = cacheValid
    ? { images: assets, sourceUrls: references, skipped: 0 }
    : await processGalleryImages(sourceUrls);
  gallery.images = globalThis.AlltaghausListingBuilder.cleanGallery(gallery.images);
  await recordPipelineEvent({
    stage: "GALLERY_PROCESSED", sourceCount: sourceUrls.length,
    processedCount: gallery.images.length, skipped: sourceUrls.length - gallery.images.length,
    failures: gallery.failures || [],
  });
  return { ...gallery, sourceCount: sourceUrls.length, retriedCount: cacheValid ? 0 : gallery.images.length };
}

async function ensureSettings() {
  const current = await chrome.storage.local.get(["settings"]);
  const settings = { ...DEFAULT_SETTINGS, ...(current.settings ?? {}) };
  settings.apiBaseUrl = normalizeApiBaseUrl(settings.apiBaseUrl);
  if (Number(settings.settingsVersion || 0) < SETTINGS_VERSION) {
    settings.draftMode = false;
    settings.autoPublish = true;
    settings.settingsVersion = SETTINGS_VERSION;
  }
  await chrome.storage.local.set({ settings });
  return settings;
}

async function ensureAlarm() {
  await chrome.alarms.clear(MONITOR_ALARM);
}

async function purgeLegacyLocalDrafts() {
  const { localDrafts = [], trackedProducts = {} } = await chrome.storage.local.get(["localDrafts", "trackedProducts"]);
  const retainedDrafts = localDrafts.filter((draft) => !/^AMZ-/i.test(String(draft.sku || "")));
  const retainedTracked = Object.fromEntries(Object.entries(trackedProducts)
    .filter(([, product]) => !/^AMZ-/i.test(String(product.sku || ""))));
  if (retainedDrafts.length !== localDrafts.length || Object.keys(retainedTracked).length !== Object.keys(trackedProducts).length) {
    await chrome.storage.local.set({ localDrafts: retainedDrafts, trackedProducts: retainedTracked });
  }
}

chrome.runtime.onInstalled.addListener(() => { void ensureAlarm(); void purgeLegacyLocalDrafts(); });
chrome.runtime.onStartup.addListener(() => { void ensureAlarm(); void purgeLegacyLocalDrafts(); });
void ensureAlarm();

function decodeHtml(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function parseStockState(value) {
  if (/OutOfStock|SoldOut|Discontinued|currently unavailable|derzeit nicht verfügbar|indisponible|non disponibile|no disponible/i.test(value)) {
    return false;
  }
  if (/InStock/i.test(value)) return true;
  return null;
}

function parseStockQuantity(value) {
  const match = String(value || "").match(/(?:nur noch|only)\s+(\d+)\s+(?:stück|items?|auf lager|in stock)/i);
  return match ? Number(match[1]) : null;
}

function parsePrice(value) {
  const normalized = String(value || "")
    .replace(/[^\d,.]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const price = Number.parseFloat(normalized);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function parseJsonLdSnapshot(html) {
  const scripts = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scripts) {
    try {
      const parsed = JSON.parse(match[1]);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      const product = candidates.find((entry) => entry?.["@type"] === "Product");
      if (!product) continue;
      const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers;
      return {
        priceText: offers?.price ? `${offers.price} ${offers.priceCurrency ?? ""}`.trim() : "",
        inStock: parseStockState(offers?.availability ?? ""),
      };
    } catch {
      // Continue to the HTML fallbacks.
    }
  }
  return null;
}

function parseHtmlSnapshot(html) {
  const jsonLd = parseJsonLdSnapshot(html);
  const priceMatch = html.match(/class=["'][^"']*a-offscreen[^"']*["'][^>]*>([^<]+)</i);
  const availabilityMatch = html.match(/id=["']availability["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
  const availability = availabilityMatch ? stripTags(availabilityMatch[1]) : "";
  const hasPurchaseButton = /id=["'](?:add-to-cart-button|buy-now-button)["']/i.test(html);
  const parsedStock = parseStockState(availability);
  const stockQuantity = parseStockQuantity(availability);
  return {
    priceText: jsonLd?.priceText || (priceMatch ? stripTags(priceMatch[1]).slice(0, 80) : ""),
    inStock: jsonLd?.inStock ?? parsedStock ?? (hasPurchaseButton ? true : null),
    stockQuantity,
    lowStock: Number.isInteger(stockQuantity) && stockQuantity <= 3,
  };
}

async function fetchSnapshot(product) {
  const response = await fetch(product.sourceUrl, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Amazon kontrolü HTTP ${response.status} döndürdü.`);
  const html = await response.text();
  if (/captcha|robot check/i.test(html)) throw new Error("Amazon robot doğrulaması istedi.");
  return {
    ...parseHtmlSnapshot(html),
    checkedAt: new Date().toISOString(),
  };
}

async function trackProduct(product) {
  const { trackedProducts = {} } = await chrome.storage.local.get(["trackedProducts"]);
  trackedProducts[product.asin] = {
    asin: product.asin,
    title: product.title,
    sourceUrl: product.sourceUrl,
    amazonUrl: product.amazonUrl || product.sourceUrl,
    lastSnapshot: {
      priceText: product.priceText,
      inStock: product.inStock,
      stockQuantity: product.stockQuantity ?? null,
      lowStock: Boolean(product.lowStock),
      checkedAt: product.extractedAt,
    },
  };
  await chrome.storage.local.set({ trackedProducts });
  await ensureAlarm();
  return trackedProducts[product.asin];
}

async function monitorProducts() {
  return { checked: 0, changed: 0, skipped: true, reason: "Legacy monitoring requires account-scoped migration." };
}

async function legacyMonitorProductsDisabled() {
  if (monitorInFlight) return { checked: 0, changed: 0, skipped: true };
  monitorInFlight = true;
  try {
  const { trackedProducts = {}, monitorChanges = [] } = await chrome.storage.local.get([
    "trackedProducts",
    "monitorChanges",
  ]);
  let changed = 0;
  const settings = await ensureSettings();

  let checked = 0;
  for (const product of Object.values(trackedProducts).slice(0, 100)) {
    try {
      const next = await fetchSnapshot(product);
      checked += 1;
      const previous = product.lastSnapshot ?? {};
      const current = {
        priceText: next.priceText || previous.priceText || "",
        inStock: next.inStock ?? previous.inStock ?? null,
        stockQuantity: next.stockQuantity ?? previous.stockQuantity ?? null,
        lowStock: Boolean(next.lowStock),
        checkedAt: next.checkedAt,
      };
      const priceChanged = Boolean(next.priceText) && next.priceText !== previous.priceText;
      const stockChanged = next.inStock !== null && next.inStock !== previous.inStock;
      const stockShieldChanged = current.lowStock && !previous.lowStock;
      if (priceChanged || stockChanged || stockShieldChanged) {
        monitorChanges.unshift({
          asin: product.asin,
          title: product.title,
          sourceUrl: product.sourceUrl,
          previous,
          current,
          detectedAt: new Date().toISOString(),
        });
        changed += 1;
      }
      if ((priceChanged || stockChanged || stockShieldChanged) && !settings.draftMode && (product.remoteDraftId || product.listingId)) {
        const sourcePrice = parsePrice(current.priceText);
        const syncedPrice = product.manualSalePrice || (sourcePrice && Number.isFinite(product.targetMarginPercent)
          ? priceTools.calculateSalePrice(sourcePrice, product.targetMarginPercent, ".99")
          : sourcePrice && product.marginMultiplier
            ? (sourcePrice * product.marginMultiplier).toFixed(2)
            : product.ebayPrice);
        const threshold = Math.max(0, Number(settings.lowStockThreshold) || 3);
        const lowStock = current.lowStock || (Number.isInteger(current.stockQuantity) && current.stockQuantity <= threshold);
        const syncedQuantity = current.inStock === false || lowStock
          ? 0
          : (Number.isInteger(Number(product.ebayQuantity)) ? Number(product.ebayQuantity) : 1);
        if (syncedPrice) {
          const endpoint = product.remoteDraftId ? "/ebay/drafts/sync" : "/ebay/active-listings/update";
          const payload = product.remoteDraftId
            ? { draftId: product.remoteDraftId, sku: product.sku, price: syncedPrice, quantity: syncedQuantity }
            : { listingId: product.listingId, sku: product.sku || "", offerId: product.offerId || "", price: syncedPrice, quantity: syncedQuantity };
          const response = await fetch(`${settings.apiBaseUrl.replace(/\/$/, "")}${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.message || `eBay senkronizasyonu HTTP ${response.status} döndürdü.`);
          product.lastEbaySyncAt = new Date().toISOString();
          product.lastEbaySync = { price: syncedPrice, quantity: syncedQuantity, offerId: body.offerId || null };
        }
      }
      product.lastSnapshot = current;
      product.lastCheckedAt = current.checkedAt;
      delete product.lastError;
    } catch (error) {
      product.lastError = error instanceof Error ? error.message : String(error);
      product.lastCheckedAt = new Date().toISOString();
    }
  }

  await chrome.storage.local.set({
    trackedProducts,
    monitorChanges: monitorChanges.slice(0, 200),
  });
  await chrome.action.setBadgeText({ text: changed ? String(changed) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#C75000" });
  return { checked, changed, skipped: false };
  } finally {
    monitorInFlight = false;
  }
}

async function createDraft(product) {
  const settings = await ensureSettings();
  const listing = {
    ...product,
    marketplaceId: settings.marketplaceId,
    currency: settings.currency,
    categoryId: settings.categoryId,
    merchantLocationKey: settings.merchantLocationKey,
    listingPolicies: {
      fulfillmentPolicyId: settings.fulfillmentPolicyId,
      paymentPolicyId: settings.paymentPolicyId,
      returnPolicyId: settings.returnPolicyId,
    },
    autoPublish: settings.autoPublish === true,
  };
  await recordPipelineEvent({ stage: 'SERVER_UPLOAD', message: 'Ürün URL’si ve seçenekler sunucuya aktarılıyor; ürün ve görseller sunucuda işleniyor.' });
  return globalThis.AutoListerCloud.createEbayDraft(listing);
}

async function dashboardState() {
  const state = await chrome.storage.local.get(["trackedProducts", "monitorChanges", "localDrafts", "legacyMappings"]);
  return {
    settings: await ensureSettings(),
    trackedProducts: Object.values(state.trackedProducts ?? {}),
    monitorChanges: state.monitorChanges ?? [],
    localDrafts: state.localDrafts ?? [],
    legacyMappings: state.legacyMappings ?? {},
  };
}

async function syncLegacyMappingWithBackend(mapping, method = "POST") {
  if (method !== "POST") throw new Error("Cloud mapping removal is not available.");
  return { synced: true, result: await globalThis.AutoListerCloud.request("/automation/mapping", mapping) };
}

async function extractProductFromTab(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "EXTRACT_AMAZON_PRODUCT" });
  } catch (firstError) {
    const noReceiver = /Receiving end does not exist|Could not establish connection/i.test(String(firstError?.message || firstError));
    if (!noReceiver) throw firstError;
    // Chrome does not re-run content scripts in already-open tabs after an
    // extension reload. Inject the declared dependency chain once, then retry.
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["seoProcessor.js", "identifierProcessor.js", "descriptionProcessor.js", "listing_builder.js", "amazon_parser.js", "content.js"],
      });
    } catch (injectionError) {
      console.error("CONTENT SCRIPT INJECTION ERROR:", { tabId, injectionError });
      throw new Error("Amazon ürün köprüsü yeniden bağlanamadı. Sekmeyi yenileyip tekrar deneyin.");
    }
    return chrome.tabs.sendMessage(tabId, { type: "EXTRACT_AMAZON_PRODUCT" });
  }
}

async function rebuildDraftFromOpenAmazonTab(sourceId) {
  const asin = String(sourceId || "").toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) throw new Error("Taslağın Amazon ürün kodu geçersiz.");
  const tabs = await chrome.tabs.query({ url: ["https://*.amazon.de/*"] });
  const tab = tabs.find((entry) => new RegExp(`/dp/${asin}(?:[/?]|$)`, "i").test(entry.url || ""));
  if (!tab?.id) throw new Error("Görsel yenileme için ilgili Amazon ürün sekmesini açık tutun.");
  const response = await extractProductFromTab(tab.id);
  if (!response?.ok || !response.product) throw new Error(response?.error || "Amazon ürün verisi yeniden okunamadı.");
  const result = await createDraft(response.product, { autoPublish: false });
  return { ...result, rebuilt: true, sourceId: asin };
}

async function refreshPublishedDraftFromOpenAmazonTab(draftId, sourceId) {
  const asin = String(sourceId || "").toUpperCase();
  if (!draftId || !/^[A-Z0-9]{10}$/.test(asin)) throw new Error("Canlı ilan yenileme bilgisi geçersiz.");
  const tabs = await chrome.tabs.query({ url: ["https://*.amazon.de/*"] });
  const tab = tabs.find((entry) => new RegExp(`/dp/${asin}(?:[/?]|$)`, "i").test(entry.url || ""));
  if (!tab?.id) throw new Error("Canlı ilanı yenilemek için ilgili Amazon ürün sekmesini açık tutun.");
  const response = await extractProductFromTab(tab.id);
  if (!response?.ok || !response.product) throw new Error(response?.error || "Amazon ürün verisi yeniden okunamadı.");
  const settings = await ensureSettings();
  const gallery = await buildProcessedGallery(response.product, settings);
  const refreshResponse = await fetchWithTimeout(`${settings.apiBaseUrl.replace(/\/$/, "")}/ebay/drafts/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      draftId,
      processedImageData: gallery.images.map(({ dataUrl, mimeType, cropRatio, width, height }) => ({ dataUrl, mimeType, cropRatio, width, height })),
      description: response.product.descriptionHtml || response.product.description || "",
      itemSpecifics: response.product.itemSpecifics || {},
    }),
  }, 45_000);
  const body = await refreshResponse.json().catch(() => ({}));
  if (!refreshResponse.ok) throw new Error(body.message || `Canlı ilan yenileme HTTP ${refreshResponse.status} döndürdü.`);
  return { ...body, processedImageCount: gallery.images.length };
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === MONITOR_ALARM) void monitorProducts();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action === "PROCESS_GALLERY_IMAGES") {
    ensureSettings().then((settings) => processGalleryImages(message.urls, { customImageOverlay: settings.customImageOverlay }))
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) => sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  }

  const handler = async () => {
    const privileged = ["CLOUD_LOGIN", "CLOUD_LOGOUT", "CLOUD_STATUS", "SAVE_CLOUD_PRODUCT", "CREATE_EBAY_DRAFT", "CHECK_BRIDGE"];
    if (privileged.includes(message?.type) && (_sender.id !== chrome.runtime.id || _sender.url !== chrome.runtime.getURL("popup.html"))) {
      throw new Error("Untrusted extension sender.");
    }
    switch (message?.type) {
      case "CHECK_BRIDGE": return globalThis.AutoListerCloud.check();
      case "CLOUD_LOGIN": return globalThis.AutoListerCloud.login(message.email, message.password);
      case "CLOUD_LOGOUT": return globalThis.AutoListerCloud.logout();
      case "CLOUD_STATUS": return globalThis.AutoListerCloud.status();
      case "SAVE_CLOUD_PRODUCT": return createDraft(message.product);
      case "CREATE_EBAY_DRAFT":
        return createDraft(message.product);
      case "REMEMBER_MANUAL_PRICE": {
        const price = Number(message.price);
        if (!Number.isFinite(price) || price <= 0) throw new Error("Geçerli fiyat gerekli.");
        const { trackedProducts = {}, manualPrices = {} } = await chrome.storage.local.get(["trackedProducts", "manualPrices"]);
        for (const [asin, product] of Object.entries(trackedProducts)) {
          if ((message.sourceId && asin === message.sourceId) || (message.sku && product.sku === message.sku) || (message.listingId && product.listingId === message.listingId)) {
            product.manualSalePrice = price.toFixed(2);
            product.ebayPrice = price.toFixed(2);
            manualPrices[asin] = price.toFixed(2);
          }
        }
        if (message.sourceId) manualPrices[message.sourceId] = price.toFixed(2);
        await chrome.storage.local.set({ trackedProducts, manualPrices });
        return { saved: true };
      }
      case "REBUILD_DRAFT_FROM_AMAZON":
        return rebuildDraftFromOpenAmazonTab(message.sourceId);
      case "REFRESH_PUBLISHED_DRAFT_FROM_AMAZON":
        return refreshPublishedDraftFromOpenAmazonTab(message.draftId, message.sourceId);
      case "TRACK_PRODUCT":
        return trackProduct(message.product);
      case "RUN_MONITOR_NOW":
        return monitorProducts();
      case "GET_DASHBOARD_STATE": {
        return dashboardState();
      }
      case "SAVE_LEGACY_MAPPING": {
        const itemId = String(message.itemId || "").trim();
        if (!/^\d{9,19}$/.test(itemId)) throw new Error("Eine gültige eBay Item-ID ist erforderlich.");
        const { asin, amazonUrl } = canonicalAmazonProduct(message.amazonUrl);
        const targetMarginPercent = Number(message.targetMarginPercent ?? 20);
        if (!Number.isFinite(targetMarginPercent) || targetMarginPercent < 0 || targetMarginPercent >= 90) throw new Error("Gewinnmarge muss zwischen 0 und 89 Prozent liegen.");
        const { legacyMappings = {}, trackedProducts = {} } = await chrome.storage.local.get(["legacyMappings", "trackedProducts"]);
        const mapping = {
          itemId, listingId: itemId, asin, amazonUrl,
          title: String(message.title || `eBay ${itemId}`),
          sku: String(message.sku || ""), offerId: String(message.offerId || ""),
          ebayPrice: String(message.price || ""), ebayQuantity: Number(message.quantity ?? 1),
          targetMarginPercent, createdAt: legacyMappings[itemId]?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        legacyMappings[itemId] = mapping;
        trackedProducts[`legacy:${itemId}`] = {
          asin, sourceId: asin, title: mapping.title, sourceUrl: amazonUrl, amazonUrl,
          listingId: itemId, sku: mapping.sku, offerId: mapping.offerId,
          ebayPrice: mapping.ebayPrice, ebayQuantity: mapping.ebayQuantity,
          targetMarginPercent, status: "PUBLISHED", legacy: true,
          lastSnapshot: trackedProducts[`legacy:${itemId}`]?.lastSnapshot || {},
        };
        await chrome.storage.local.set({ legacyMappings, trackedProducts });
        mapping.cloud = await syncLegacyMappingWithBackend(mapping);
        await ensureAlarm();
        return mapping;
      }
      case "REMOVE_LEGACY_MAPPING": {
        const itemId = String(message.itemId || "").trim();
        const { legacyMappings = {}, trackedProducts = {} } = await chrome.storage.local.get(["legacyMappings", "trackedProducts"]);
        delete legacyMappings[itemId];
        delete trackedProducts[`legacy:${itemId}`];
        await chrome.storage.local.set({ legacyMappings, trackedProducts });
        const cloud = await syncLegacyMappingWithBackend({ itemId }, "DELETE");
        return { removed: true, itemId, cloud };
      }
      case "EXPORT_LOCAL_BACKUP": {
        const state = await dashboardState();
        return { schemaVersion: 1, exportedAt: new Date().toISOString(), ...state };
      }
      case "SAVE_SETTINGS": {
        const settings = { ...DEFAULT_SETTINGS, ...(message.settings ?? {}), settingsVersion: SETTINGS_VERSION };
        await chrome.storage.local.set({ settings });
        await ensureAlarm();
        return settings;
      }
      case "CLEAR_MONITOR_CHANGES":
        await chrome.storage.local.set({ monitorChanges: [] });
        await chrome.action.setBadgeText({ text: "" });
        return { cleared: true };
      case "REMOVE_STAGING_CACHE": {
        const { localDrafts = [], trackedProducts = {} } = await chrome.storage.local.get(["localDrafts", "trackedProducts"]);
        const nextTracked = { ...trackedProducts };
        for (const [asin, product] of Object.entries(nextTracked)) {
          if (product.remoteDraftId === message.draftId || asin === message.sourceId) delete nextTracked[asin];
        }
        await chrome.storage.local.set({
          localDrafts: localDrafts.filter((draft) => draft.id !== message.draftId && draft.sourceId !== message.sourceId),
          trackedProducts: nextTracked,
        });
        return { cleared: true };
      }
      case "RESET_STAGING_CACHE": {
        const { trackedProducts = {} } = await chrome.storage.local.get(["trackedProducts"]);
        const deletedSourceIds = new Set(message.sourceIds || []);
        const nextTracked = Object.fromEntries(Object.entries(trackedProducts)
          .filter(([asin, product]) => !deletedSourceIds.has(asin) && !deletedSourceIds.has(product.sourceId)));
        await chrome.storage.local.set({
          localDrafts: [],
          trackedProducts: nextTracked,
          activeProduct: null,
          latestCapturedProduct: null,
          latestCaptureError: "",
          pipelineEvents: [],
          latestPipelineStatus: null,
        });
        return { cleared: true };
      }
      case "UPDATE_AMAZON_LINK": {
        const url = String(message.amazonUrl || "").split("?")[0];
        if (!/^https:\/\/www\.amazon\.de\/dp\/[A-Z0-9]{10}(?:\/|$)/i.test(url)) throw new Error("Bitte eine gültige amazon.de/dp/ ASIN-URL einfügen.");
        const { trackedProducts = {} } = await chrome.storage.local.get(["trackedProducts"]);
        const asin = url.match(/\/dp\/([A-Z0-9]{10})/i)?.[1]?.toUpperCase();
        if (message.sourceId && trackedProducts[message.sourceId]) trackedProducts[message.sourceId].amazonUrl = url;
        if (asin && trackedProducts[asin]) trackedProducts[asin].amazonUrl = url;
        await chrome.storage.local.set({ trackedProducts });
        return { amazonUrl: url };
      }
      default:
        throw new Error("Bilinmeyen eklenti komutu.");
    }
  };

  (async () => {
    try {
      sendResponse({ ok: true, result: await handler() });
    } catch (error) {
      console.error("BACKGROUND PIPELINE ERROR:", { action: message?.action || message?.type || "unknown", stage: error?.stage || "EXTENSION", code: error?.code || "", requestId: error?.requestId || "", details: error?.details || [], error });
      void recordPipelineEvent({
        stage: "PIPELINE_ERROR",
        action: message?.action || message?.type || "unknown",
        message: pipelineMessage(error),
      });
      sendResponse({ ok: false, error: pipelineMessage(error), debug: { stage: error?.stage || "EXTENSION", code: error?.code || "", requestId: error?.requestId || "", details: error?.details || [] } });
    }
  })();
  return true;
});
