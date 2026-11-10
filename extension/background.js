if (typeof importScripts === "function") importScripts("cloudClient.js");
if (typeof importScripts === "function") importScripts("config.js", "priceCalculator.js", "listing_builder.js", "amazon_parser.js", "bridgeClient.js");

const priceTools = globalThis.AlltaghausPrice || {
  calculateSalePrice(source, marginPercent) {
    const margin = Number(marginPercent) / 100;
    if (!Number.isFinite(source) || !Number.isFinite(margin) || margin < 0 || margin >= 0.9) return null;
    return (Math.ceil(source / (1 - margin)) - 0.01).toFixed(2);
  },
};

const SETTINGS_VERSION = 8;
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
  customImageOverlay: true,
};
let monitorInFlight = false;
let joybuySyncInFlight = false;
const JOYBUY_SYNC_ALARM = "joybuyAutoSync";
const JOYBUY_SYNC_CONTINUE_ALARM = "autolister-joybuy-price-stock-continue";
const JOYBUY_AUTO_SYNC_KEY = "joybuyAutoSyncEnabled";
const JOYBUY_SYNC_STATUS_KEY = "joybuySyncStatus";
const JOYBUY_LAST_SUCCESS_KEY = "joybuyLastSuccessfulQueueRunAt";
const JOYBUY_SYNC_PAUSED_KEY = "joybuySyncPausedForVerification";
const JOYBUY_RUN_BATCH_LIMIT = 6;

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

function originalGalleryUrls(product) {
  return [...new Set([...(product.images || []), ...(product.descriptionImages || [])]
    .map(highResolutionImageUrl)
    .filter((url) => /^https:\/\//i.test(String(url))))].slice(0, 12);
}

async function ensureSettings() {
  const current = await chrome.storage.local.get(["settings"]);
  const settings = { ...DEFAULT_SETTINGS, ...(current.settings ?? {}) };
  settings.apiBaseUrl = normalizeApiBaseUrl(settings.apiBaseUrl);
  if (Number(settings.settingsVersion || 0) < SETTINGS_VERSION) {
    settings.draftMode = false;
    settings.autoPublish = true;
    settings.customImageOverlay = true;
    settings.settingsVersion = SETTINGS_VERSION;
  }
  await chrome.storage.local.set({ settings });
  return settings;
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

chrome.runtime.onInstalled.addListener(() => { void purgeLegacyLocalDrafts(); });
chrome.runtime.onStartup.addListener(() => { void purgeLegacyLocalDrafts(); });
async function ensureJoybuySyncAlarm() {
  const alarm = await chrome.alarms.get(JOYBUY_SYNC_ALARM);
  if (!alarm) chrome.alarms.create(JOYBUY_SYNC_ALARM, { periodInMinutes: 30 });
  const state = await chrome.storage.local.get(JOYBUY_AUTO_SYNC_KEY);
  if (state[JOYBUY_AUTO_SYNC_KEY] === undefined) await chrome.storage.local.set({ [JOYBUY_AUTO_SYNC_KEY]: true });
}
void ensureJoybuySyncAlarm();
chrome.runtime.onStartup.addListener(() => { void ensureJoybuySyncAlarm(); });
chrome.runtime.onInstalled.addListener(() => { void ensureJoybuySyncAlarm(); });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === JOYBUY_SYNC_ALARM) {
    void runJoybuySync(false).catch((error) => console.warn("Joybuy sync alarm:", error));
  }
  if (alarm.name === JOYBUY_SYNC_CONTINUE_ALARM) void resumeJoybuySync();
});

async function resumeJoybuySync() {
  const { joybuySyncManualResume = false } = await chrome.storage.local.get("joybuySyncManualResume");
  await chrome.storage.local.remove("joybuySyncManualResume");
  try { await runJoybuySync(joybuySyncManualResume); }
  catch (error) { console.warn("Joybuy sync continuation:", error); }
}

function joybuyIdFromUrl(value) {
  try { return new URL(value).pathname.match(/\/(?:dp\/[^/]+\/|dg\/|landingPage\/dp\/)(\d{6,20})(?:\/|$)/i)?.[1] || ""; }
  catch { return ""; }
}

function waitForTabComplete(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      error ? reject(error) : resolve();
    };
    const onUpdated = (changedId, changeInfo) => { if (changedId === tabId && changeInfo.status === "complete") finish(); };
    const timer = setTimeout(() => finish(new Error("Joybuy-Seite hat nicht rechtzeitig geladen.")), timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((tab) => { if (tab.status === "complete") finish(); }).catch(finish);
  });
}

async function reportJoybuyPending(item, reason) {
  return globalThis.AutoListerCloud.reportJoybuySync({ id: item.id, sourceUrl: item.source_url, status: "verification_pending", reason: String(reason || "Joybuy-Seite konnte nicht sicher geprüft werden.").slice(0, 300) });
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function activeToastTabId() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.id ?? null;
  } catch { return null; }
}

async function notifyJoybuyToast(tabId, payload) {
  if (tabId == null) return;
  try { await chrome.tabs.sendMessage(tabId, { type: "AUTO_LISTER_JOYBUY_SYNC_TOAST", ...payload }); }
  catch { /* No toast-capable content script on this page. */ }
}

async function syncJoybuyItem(item, tabId) {
  let result;
  try { result = await chrome.tabs.sendMessage(tabId, { type: "EXTRACT_JOYBUY_SYNC" }); }
  catch (error) {
    await reportJoybuyPending(item, error?.message || "Joybuy-Seite konnte nicht gelesen werden.");
    return { pending: true };
  }
  const snapshot = result?.snapshot;
  const expectedId = joybuyIdFromUrl(item.source_url);
  if (!result?.ok || !snapshot || snapshot.supplierProductId !== expectedId || !Number.isFinite(Number(snapshot.priceEur)) || Number(snapshot.priceEur) <= 0 || typeof snapshot.inStock !== "boolean") {
    await reportJoybuyPending(item, result?.error || "Preis, Bestand oder Produktidentität konnte nicht verifiziert werden.");
    return { pending: true, blocked: Boolean(result?.blocked) };
  }
  const report = await globalThis.AutoListerCloud.reportJoybuySync({
    id: item.id, sourceUrl: item.source_url, status: "verified", sourceProductId: snapshot.supplierProductId,
    priceEur: Number(snapshot.priceEur), inStock: snapshot.inStock,
  });
  return { pending: false, changed: Boolean(report.changed) };
}

async function runJoybuySync(manual = false) {
  if (joybuySyncInFlight) return { checked: 0, pending: 0, waiting: 0, busy: true };
  joybuySyncInFlight = true;
  const toastTabId = await activeToastTabId();
  let checked = 0;
  let pending = 0;
  let processed = 0;
  let empty = false;
  let fatal = false;
  let blocked = false;
  let queueTotal = JOYBUY_RUN_BATCH_LIMIT;
  const startedAt = new Date().toISOString();
  try {
    const auth = await globalThis.AutoListerCloud.status();
    if (!auth.authenticated) {
      const result = { checked, pending, processed, authenticated: false, paused: false };
      await chrome.storage.local.set({ [JOYBUY_SYNC_STATUS_KEY]: { ...result, checkedAt: new Date().toISOString() } });
      await notifyJoybuyToast(toastTabId, { state: "warning", text: "AutoLister-Anmeldung erforderlich" });
      return result;
    }
    const setting = await chrome.storage.local.get(JOYBUY_AUTO_SYNC_KEY);
    if (!manual && setting[JOYBUY_AUTO_SYNC_KEY] === false) return { checked, pending, paused: true };
    const verificationPause = await chrome.storage.local.get(JOYBUY_SYNC_PAUSED_KEY);
    if (!manual && verificationPause[JOYBUY_SYNC_PAUSED_KEY]) return { checked, pending, paused: true, reason: "verification" };
    if (manual) await chrome.storage.local.remove(JOYBUY_SYNC_PAUSED_KEY);
    await notifyJoybuyToast(toastTabId, { state: "running", text: "Joybuy-Abgleich wird gestartet …" });
    while (processed < JOYBUY_RUN_BATCH_LIMIT) {
      const { items = [] } = await globalThis.AutoListerCloud.getJoybuySyncQueue(manual);
      if (!items.length) { empty = processed === 0; break; }
      queueTotal = Math.min(processed + items.length, JOYBUY_RUN_BATCH_LIMIT);
      for (const item of items) {
        if (processed >= JOYBUY_RUN_BATCH_LIMIT) break;
        let tabId = null;
        try {
          const url = new URL(String(item.source_url || ""));
          if (url.protocol !== "https:" || !/(^|\.)joybuy\.de$/i.test(url.hostname) || !joybuyIdFromUrl(url.href)) {
            throw new Error("Ungültige Joybuy-Produktadresse in der Warteschlange.");
          }
          const tab = await chrome.tabs.create({ url: url.href, active: false });
          tabId = tab.id;
          if (!tabId) throw new Error("Chrome konnte den Joybuy-Hintergrundtab nicht erstellen.");
          await waitForTabComplete(tabId);
          await delay(2500);
          const outcome = await syncJoybuyItem(item, tabId);
          if (outcome.pending) pending += 1; else checked += 1;
          if (outcome.blocked) blocked = true;
        } catch (error) {
          try {
            await reportJoybuyPending(item, error?.message || "Joybuy-Seite konnte nicht sicher geprüft werden.");
            pending += 1;
          } catch (reportError) {
            console.warn("Joybuy verification report failed:", reportError);
            fatal = true;
          }
        } finally {
          if (tabId) { try { await chrome.tabs.remove(tabId); } catch {} }
        }
        processed += 1;
        await notifyJoybuyToast(toastTabId, { state: "running", text: `Joybuy-Bestand wird geprüft (${processed} / ${queueTotal} in diesem Durchlauf) …` });
        if (fatal || blocked || processed >= JOYBUY_RUN_BATCH_LIMIT) break;
        await delay(2500);
      }
      if (fatal || blocked) break;
    }
    const continuing = !fatal && !blocked && !empty && processed >= JOYBUY_RUN_BATCH_LIMIT;
    if (continuing) {
      await chrome.storage.local.set({ joybuySyncManualResume: manual });
      chrome.alarms.create(JOYBUY_SYNC_CONTINUE_ALARM, { delayInMinutes: 0.5 });
    }
    if (blocked) await chrome.storage.local.set({ [JOYBUY_SYNC_PAUSED_KEY]: true });
    const result = { checked, pending, processed, continuing, empty, paused: blocked, blocked };
    const checkedAt = new Date().toISOString();
    const saved = { [JOYBUY_SYNC_STATUS_KEY]: { ...result, checkedAt, startedAt } };
    if (!fatal && !blocked) saved[JOYBUY_LAST_SUCCESS_KEY] = checkedAt;
    await chrome.storage.local.set(saved);
    const summary = blocked
      ? `Sicherheitsprüfung erkannt; Warteschlange pausiert. ${pending} Produkt(e) warten auf Verifizierung.`
      : `${checked} Joybuy-Prüfung(en) bestätigt; ${pending} warten auf Verifizierung${continuing ? "; Fortsetzung geplant" : ""}.`;
    await recordPipelineEvent({ stage: "JOYBUY_SYNC", message: summary, checkedAt });
    await notifyJoybuyToast(toastTabId, { state: blocked || pending || fatal ? "warning" : "success", text: blocked ? "Sicherheitsprüfung erkannt · Sync pausiert" : fatal ? "Sync mit Fehler beendet" : `${checked} geprüft · ${pending} ausstehend${continuing ? " · Fortsetzung läuft" : " · abgeschlossen"}` });
    return result;
  } catch (error) {
    const checkedAt = new Date().toISOString();
    const result = { checked, pending, processed, failed: true, paused: false, error: String(error?.message || error).slice(0, 300) };
    await chrome.storage.local.set({ [JOYBUY_SYNC_STATUS_KEY]: { ...result, checkedAt, startedAt } });
    await notifyJoybuyToast(toastTabId, { state: "warning", text: "Joybuy-Sync konnte nicht abgeschlossen werden" });
    throw error;
  } finally { joybuySyncInFlight = false; }
}

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
    applyCustomFrame: settings.customImageOverlay !== false,
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
  if (method !== "POST") return { synced: false, unavailable: true };
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
  const imageUrls = originalGalleryUrls(response.product);
  if (!imageUrls.length) throw new Error("Amazon ürününde yayınlanabilir görsel bulunamadı.");
  const refreshResponse = await fetchWithTimeout(`${settings.apiBaseUrl.replace(/\/$/, "")}/ebay/drafts/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      draftId,
      imageUrls,
      applyCustomFrame: settings.customImageOverlay !== false,
      description: response.product.descriptionHtml || response.product.description || "",
      itemSpecifics: response.product.itemSpecifics || {},
    }),
  }, 45_000);
  const body = await refreshResponse.json().catch(() => ({}));
  if (!refreshResponse.ok) throw new Error(body.message || `Canlı ilan yenileme HTTP ${refreshResponse.status} döndürdü.`);
  return { ...body, imageCount: imageUrls.length };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = async () => {
    const privileged = ["CLOUD_LOGIN", "CLOUD_LOGOUT", "CLOUD_STATUS", "SAVE_CLOUD_PRODUCT", "SAVE_FAVORITE", "IMPORT_SUPPLIER_DRAFT", "CREATE_EBAY_DRAFT", "CHECK_BRIDGE", "JOYBUY_SYNC_NOW"];
    if (privileged.includes(message?.type) && (_sender.id !== chrome.runtime.id || _sender.url !== chrome.runtime.getURL("popup.html"))) {
      throw new Error("Untrusted extension sender.");
    }
    switch (message?.type) {
      case "SYNC_AMAZON_SUPPLIER_TRACKING": {
        const sourceUrl = String(_sender.url || "");
        if (_sender.id !== chrome.runtime.id || !/^https:\/\/(?:www\.)?amazon\.de\//i.test(sourceUrl)
          || !/(?:\/gp\/your-account\/order-history|\/progress-tracker\/package(?:\/|$)|\/gp\/your-account\/ship-track)/i.test(new URL(sourceUrl).pathname)) {
          throw new Error("Amazon-Tracking darf nur von einer unterstützten Amazon-Bestellseite gesendet werden.");
        }
        return globalThis.AutoListerCloud.syncAmazonSupplierTracking(message.shipment);
      }
      case "CHECK_BRIDGE": return globalThis.AutoListerCloud.check();
      case "CLOUD_LOGIN": return globalThis.AutoListerCloud.login(message.email, message.password);
      case "CLOUD_LOGOUT": return globalThis.AutoListerCloud.logout();
      case "CLOUD_STATUS": return globalThis.AutoListerCloud.status();
      case "SAVE_CLOUD_PRODUCT": return createDraft(message.product);
      case "SAVE_FAVORITE": return globalThis.AutoListerCloud.saveFavorite(message.product);
      case "IMPORT_SUPPLIER_DRAFT": return globalThis.AutoListerCloud.importSupplierDraft(message.product);
      case "JOYBUY_SYNC_NOW": return runJoybuySync(true);
      case "SYNC_AMAZON_TRACKING_PAGE": {
        if (_sender.id !== chrome.runtime.id || _sender.url !== chrome.runtime.getURL("popup.html")) throw new Error("Untrusted extension sender.");
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const url = new URL(tab?.url || "");
        if (!/^(?:www\.)?amazon\.de$/i.test(url.hostname) || !/(?:\/gp\/your-account\/order-history|\/progress-tracker\/package(?:\/|$)|\/gp\/your-account\/ship-track)/i.test(url.pathname)) {
          throw new Error("Öffne zuerst deine Amazon-Bestellübersicht oder die Paketverfolgung.");
        }
        let extracted;
        try { extracted = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_AMAZON_TRACKING" }); }
        catch {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["amazonOrders.js"] });
          extracted = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_AMAZON_TRACKING" });
        }
        if (!extracted?.ok) throw new Error(extracted?.error || "Amazon-Bestelldaten konnten nicht gelesen werden.");
        const shipments = Array.isArray(extracted.shipments) ? extracted.shipments : [];
        if (!shipments.length) return { synced: 0, failed: 0, message: "Keine versandten Bestellungen mit sicher erkannten Trackingdaten gefunden." };
        let synced = 0; const errors = [];
        for (const shipment of shipments) {
          try { await globalThis.AutoListerCloud.syncAmazonSupplierTracking(shipment); synced++; }
          catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
        }
        return { synced, failed: errors.length, errors: errors.slice(0, 5) };
      }
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
        const settings = { ...(await ensureSettings()), ...(message.settings ?? {}), settingsVersion: SETTINGS_VERSION };
        await chrome.storage.local.set({ settings });
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
