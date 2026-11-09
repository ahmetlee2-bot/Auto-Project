let currentProduct = null;
let manualPrices = {};
let busy = false;
let initialization;
let authenticated = false;

function asinFromUrl(value) {
  try { return new URL(value).pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i)?.[1]?.toUpperCase() || ""; }
  catch { return ""; }
}

const elements = {
  productName: document.querySelector("#productName"), productMeta: document.querySelector("#productMeta"), syncJoybuy: document.querySelector("#syncJoybuy"), joybuyAutoSyncToggle: document.querySelector("#joybuyAutoSyncToggle"), joybuyAutoSyncState: document.querySelector("#joybuyAutoSyncState"), joybuySyncStatus: document.querySelector("#joybuySyncStatus"), joybuySyncStatusText: document.querySelector("#joybuySyncStatusText"), joybuySyncPending: document.querySelector("#joybuySyncPending"),
  syncAmazonTracking: document.querySelector("#syncAmazonTracking"),
  sourcePrice: document.querySelector("#sourcePrice"), sourcePriceLabel: document.querySelector("#sourcePriceLabel"), salePrice: document.querySelector("#salePrice"),
  profitMargin: document.querySelector("#profitMargin"), listNow: document.querySelector("#listNow"), saveFavorite: document.querySelector("#saveFavorite"), imageRights: document.querySelector("#imageRightsConfirmed"),
  openDashboard: document.querySelector("#openDashboard"),
  manualPrice: document.querySelector("#manualPrice"),
  status: document.querySelector("#status"), log: document.querySelector("#log"), activityDot: document.querySelector("#activityDot"),
  systemState: document.querySelector("#systemState"), authView: document.querySelector("#authView"), workspaceView: document.querySelector("#workspaceView"),
  notice: document.querySelector("#notice"), noticeIcon: document.querySelector("#noticeIcon"), dismissNotice: document.querySelector("#dismissNotice"), authMessage: document.querySelector("#authMessage"),
};

function setStatus(message, isError = false, tone = "success") {
  elements.status.textContent = message;
  if (!authenticated) {
    elements.authMessage.textContent = message;
    elements.authMessage.dataset.tone = isError ? "error" : tone;
    elements.authMessage.hidden = false;
    return;
  }
  elements.notice.hidden = false;
  elements.notice.dataset.tone = isError ? "error" : tone;
  elements.noticeIcon.textContent = isError ? "!" : tone === "warning" ? "i" : "✓";
}

function setSystemState(message, state = "loading") { elements.systemState.dataset.state = state; elements.systemState.innerHTML = `<i></i>${message}`; }

function addLog(message, state = "pending") {
  const entry = document.createElement("li");
  entry.dataset.state = state;
  entry.textContent = message;
  elements.log.prepend(entry);
}

function setBusy(busy) {
  elements.listNow.disabled = busy || !authenticated || !currentProduct || currentProduct.supplier === "joybuy_de" || !elements.imageRights.checked;
  elements.saveFavorite.disabled = busy || !authenticated || !currentProduct;
  elements.syncJoybuy.disabled = busy || !authenticated;
  if (currentProduct?.supplier === "joybuy_de") elements.saveFavorite.textContent = busy ? "Wird importiert …" : "Joybuy-Entwurf erstellen"; else elements.saveFavorite.textContent = busy ? "Wird übertragen …" : "Im Produktpool speichern (Favorit)";
  elements.activityDot.classList.toggle("busy", busy);
  elements.listNow.classList.toggle("is-loading", busy);
  elements.listNow.querySelector(".button-label").textContent = busy ? "Wird übertragen …" : "Auf eBay listen";
}

function commandError(response, fallback) {
  const error = new Error(response?.error || fallback);
  Object.assign(error, response?.debug || {});
  console.error("POPUP COMMAND ERROR:", { stage: error.stage, code: error.code, requestId: error.requestId, details: error.details, error });
  return error;
}

function suggestedPrice(priceText, margin) {
  return globalThis.AlltaghausPrice?.calculateSalePrice(priceText, margin, ".99") || "";
}

function renderPreview(product) {
  if (currentProduct?.asin !== product.asin) elements.manualPrice.value = manualPrices[product.asin] || "";
  currentProduct = product;
  const isJoybuy = product.supplier === "joybuy_de";
  const sourcePrice = product.price ?? product.priceEur;
  const sourcePriceText = product.priceText || (Number.isFinite(Number(sourcePrice)) && Number(sourcePrice) > 0 ? `${Number(sourcePrice).toFixed(2).replace(".", ",")} €` : "");
  const salePrice = selectedPrice(sourcePriceText);
  elements.productName.textContent = isJoybuy ? "Joybuy-Produkt erkannt" : (product.suggestedTitle || product.title || "Amazon-Produkt erkannt").slice(0, 80);
  elements.sourcePriceLabel.textContent = isJoybuy ? "QUELLPREIS (JOYBUY)" : "QUELLPREIS (AMAZON)";
  document.querySelectorAll(".supplier-eyebrow").forEach((node) => { node.textContent = isJoybuy ? "JOYBUY → EBAY.DE" : "AMAZON → EBAY.DE"; });
  elements.productMeta.textContent = `${product.asin || "Ohne ASIN"} · ${product.images?.length || 0} Quellbilder · ${Object.keys(product.itemSpecifics || {}).length} Artikelmerkmale · v${chrome.runtime.getManifest().version}`;
  elements.sourcePrice.textContent = sourcePriceText || "Nicht erkannt";
  elements.salePrice.textContent = salePrice ? `${salePrice} €` : "Nicht erkannt";
  setSystemState("Produktdaten bereit", "ready");
  setBusy(false);
}

function preparedProduct() {
  if (!currentProduct) throw new Error("Produktdaten wurden nicht geladen.");
  const priceText = currentProduct.priceText || (Number.isFinite(Number(currentProduct.price)) ? `${Number(currentProduct.price).toFixed(2).replace(".", ",")} €` : "");
  const salePrice = selectedPrice(priceText);
  if (!salePrice) throw new Error("Bitte einen positiven Preis mit maximal zwei Nachkommastellen eingeben.");
  const product = {
    ...currentProduct,
    ebayTitle: (currentProduct.suggestedTitle || currentProduct.title || "").slice(0, 80),
    ebayDescription: currentProduct.descriptionHtml || currentProduct.description || "",
    salePrice,
    manualSalePrice: elements.manualPrice.value.trim() ? salePrice : null,
    quantity: currentProduct.lowStock || currentProduct.inStock === false ? 0 : 1,
    targetMarginPercent: Number(elements.profitMargin.value),
    imageRightsConfirmed: elements.imageRights.checked,
  };
  const readiness = globalThis.AlltaghausListing?.validateListing(product);
  if (readiness && !readiness.ready) throw new Error(readiness.blockers[0]);
  return product;
}

async function activeAmazonTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let hostname = "";
  try { hostname = new URL(tab?.url || "").hostname.toLowerCase(); } catch {}
  const joybuy = hostname === "joybuy.de" || hostname.endsWith(".joybuy.de");
  const amazon = hostname === "amazon.de" || hostname.endsWith(".amazon.de");
  if (!tab?.id || (!amazon && !joybuy)) throw new Error("Bitte eine Amazon.de- oder Joybuy.de-Produktseite öffnen.");
  if (amazon && !asinFromUrl(tab.url)) throw new Error("Amazon Produkt-URL enthält keine ASIN.");
  if (joybuy && !/\/(?:dp\/[^/]+\/|dg\/|landingPage\/dp\/)\d{6,20}/i.test(new URL(tab.url).pathname)) throw new Error("Joybuy Produkt-URL enthält keine Produkt-ID.");
  return tab;
}

async function requestExtraction(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "EXTRACT_AMAZON_PRODUCT" });
  } catch (error) {
    if (!/Receiving end does not exist|Could not establish connection|message port closed/i.test(String(error))) throw error;
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["seoProcessor.js", "identifierProcessor.js", "descriptionProcessor.js", "listing_builder.js", "amazon_parser.js", "content.js"] });
      return await chrome.tabs.sendMessage(tabId, { type: "EXTRACT_AMAZON_PRODUCT" });
    } catch (injectionError) {
      console.error("CONTENT SCRIPT INJECTION ERROR:", { tabId, injectionError });
      throw new Error("Die Verbindung zur Amazon-Produktseite konnte nicht hergestellt werden. Lade die Seite neu und versuche es erneut.");
    }
  }
}

async function extractAndPrepare() {
  addLog("Produktdaten werden gelesen …");
  const tab = await activeAmazonTab();
  const isJoybuy = /(^|\.)joybuy\.de$/i.test(new URL(tab.url).hostname);
  let response;
  if (isJoybuy) {
    try { response = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_JOYBUY_PRODUCT" }); }
    catch { await chrome.scripting.executeScript({target:{tabId:tab.id},files:["joybuy_content.js"]}); response = await chrome.tabs.sendMessage(tab.id,{type:"EXTRACT_JOYBUY_PRODUCT"}); }
  } else response = await requestExtraction(tab.id);
  if (!response?.ok) throw new Error(response?.error || "Produktdaten konnten nicht gelesen werden.");
  if (isJoybuy) response.product = {...response.product, asin:`JB-${response.product.supplierProductId}`, title:response.product.rawTitle, supplier:"joybuy_de", sourceHost:"joybuy.de", price:response.product.priceEur, priceText:response.product.priceEur ? `${response.product.priceEur.toFixed(2).replace(".",",")} €` : ""};
  renderPreview(response.product);
  addLog(`${response.product.images?.length || 0} Quellbilder erfasst. Verarbeitung beim Listen.`, "done");
}

async function loadCapturedProduct() {
  const tab = await activeAmazonTab();
  const activeAsin = asinFromUrl(tab.url);
  manualPrices = (await chrome.storage.local.get(["manualPrices"])).manualPrices || {};
  const state = await chrome.storage.local.get(["activeProduct", "latestCapturedProduct", "latestCaptureError", "latestPipelineStatus", "autoListerMargin"]);
  if (Number.isFinite(Number(state.autoListerMargin))) elements.profitMargin.value = String(state.autoListerMargin);
  const product = [state.activeProduct, state.latestCapturedProduct].find((item) => item?.asin === activeAsin);
  if (product?.asin || product?.title) {
    renderPreview(product);
    setStatus("Produktdaten geladen. Aktuelle Seite wird geprüft …", false, "warning");
    addLog("Produktdaten aus dem Seitenspeicher geladen.", "done");
  }
  await extractAndPrepare();
  setStatus(`Produkt bereit: ${currentProduct.title.slice(0, 65)}`);
}

async function ensureActiveProduct() {
  // Re-read variant, price and availability before every submission.
  await extractAndPrepare();
}

async function listProduct() {
  if (busy) return;
  if (!elements.imageRights.checked) {
    setStatus("Bitte bestätige zuerst die Nutzungsrechte an den Produktbildern.", true);
    return;
  }
  busy = true;
  setBusy(true);
  elements.log.replaceChildren();
  setStatus("Produkt wird vorbereitet …");
  try {
    await initialization;
    const connection = await chrome.runtime.sendMessage({ type: "CHECK_BRIDGE" });
    if (!connection?.ok) throw commandError(connection, "Bitte in der Erweiterung anmelden.");
    await ensureActiveProduct();
    const response = await chrome.runtime.sendMessage({ type: "SAVE_CLOUD_PRODUCT", product: preparedProduct() });
    if (!response?.ok) throw commandError(response, "eBay-Übertragung fehlgeschlagen.");
    const result = response.result;
    if (result.serverQueued && result.jobId) {
      setStatus(`Server verarbeitet das Produkt. Auftrags-ID: ${result.jobId}`, false, "warning");
      addLog("eBay-Auftrag auf dem Server gestartet. Läuft auch bei geschlossenem Browser weiter.", "done");
    } else if (result.autoPublished || result.status === "PUBLISHED") {
      setStatus(`Erfolgreich gelistet: ${result.listingId || result.offerId}`);
      addLog("Erfolgreich auf eBay gelistet.", "done");
    } else {
      setStatus("Produkt in deinem Web-Dashboard gespeichert.");
      addLog("Cloud-Speicherung bestätigt. Noch nicht auf eBay veröffentlicht.", "done");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("FETCH ERROR:", { stage: "listProduct", error, sourceUrl: currentProduct?.sourceUrl || "" });
    setStatus(message, true);
    addLog(message, "error");
  } finally {
    busy = false;
    setBusy(false);
  }
}

async function saveFavorite() {
  if (busy || !currentProduct) return;
  busy = true; setBusy(true); elements.log.replaceChildren();
  try {
    await initialization;
    await ensureActiveProduct();
    const isJoybuy = currentProduct?.supplier === "joybuy_de";
    if (!currentProduct?.asin || (isJoybuy ? !currentProduct?.sourceUrl : !currentProduct?.title)) throw new Error("Produkt-ID oder Produktname konnte nicht erkannt werden.");
    if (!currentProduct.images?.[0]) throw new Error("Amazon-Produktbild konnte nicht erkannt werden.");
    const result = await chrome.runtime.sendMessage({ type: isJoybuy ? "IMPORT_SUPPLIER_DRAFT" : "SAVE_FAVORITE", product: currentProduct });
    if (!result?.ok) throw commandError(result, "Produkt konnte nicht im Favoritenpool gespeichert werden.");
    setStatus(isJoybuy ? "Joybuy-Produktentwurf gespeichert. Bitte im Dashboard prüfen." : "Produkt im AutoLister-Produktpool gespeichert. Im Dashboard prüfen.");
    addLog(isJoybuy ? "Joybuy-Entwurf erstellt." : "Produkt im Favoritenpool gespeichert.", "done");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message, true); addLog(message, "error");
  } finally { busy = false; setBusy(false); }
}

function selectedPrice(priceText) {
  const raw = elements.manualPrice.value.trim().replace(",", ".");
  if (!raw) return suggestedPrice(priceText, elements.profitMargin.value);
  return /^\d+(?:\.\d{1,2})?$/.test(raw) && Number(raw) > 0 ? Number(raw).toFixed(2) : "";
}

elements.manualPrice.addEventListener("input", () => {
  if (!currentProduct?.asin) return;
  manualPrices[currentProduct.asin] = elements.manualPrice.value;
  void chrome.storage.local.set({ manualPrices });
  renderPreview(currentProduct);
});
elements.imageRights.addEventListener("change", () => setBusy(busy));
elements.profitMargin.addEventListener("input", () => {
  void chrome.storage.local.set({ autoListerMargin: Number(elements.profitMargin.value) });
  if (!currentProduct) return;
  renderPreview(currentProduct);
});
elements.listNow.addEventListener("click", () => void listProduct());
elements.saveFavorite.addEventListener("click", () => void saveFavorite());
function renderAutoSync(enabled) {
  elements.joybuyAutoSyncToggle.checked = enabled;
  elements.joybuyAutoSyncState.textContent = enabled ? "An" : "Aus";
  elements.joybuyAutoSyncState.dataset.enabled = String(enabled);
  void renderJoybuySyncStatus(enabled);
}
function relativeSyncTime(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return "not yet";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  return minutes < 1 ? "just now" : `${minutes} min${minutes === 1 ? "" : "s"} ago`;
}
async function renderJoybuySyncStatus(enabled = elements.joybuyAutoSyncToggle.checked) {
  const state = await chrome.storage.local.get(["joybuyLastSuccessfulQueueRunAt", "joybuySyncStatus", "joybuySyncPausedForVerification"]);
  const status = state.joybuySyncStatus || {};
  const pending = Number(status.pending || 0);
  const paused = Boolean(state.joybuySyncPausedForVerification || status.blocked);
  elements.joybuySyncStatus.dataset.tone = paused || pending ? "warning" : enabled ? "success" : "neutral";
  if (!enabled) elements.joybuySyncStatusText.textContent = "Auto-sync disabled";
  else if (paused) elements.joybuySyncStatusText.textContent = "Auto-sync paused (security verification detected)";
  else elements.joybuySyncStatusText.textContent = `Auto-sync enabled (Last checked: ${relativeSyncTime(state.joybuyLastSuccessfulQueueRunAt)})`;
  elements.joybuySyncPending.hidden = !(pending || paused);
  elements.joybuySyncPending.textContent = paused
    ? `⚠️ Sync paused; ${pending} product(s) pending validation. Review the supplier page and start sync manually.`
    : pending ? `⚠️ ${pending} product(s) pending validation; stock was left unchanged.` : "";
}
elements.joybuyAutoSyncToggle.addEventListener("change", async () => {
  const enabled = elements.joybuyAutoSyncToggle.checked;
  await chrome.storage.local.set({ joybuyAutoSyncEnabled: enabled });
  renderAutoSync(enabled);
  setStatus(enabled ? "Automatische Joybuy-Synchronisierung aktiviert." : "Automatische Joybuy-Synchronisierung pausiert.", false, enabled ? "success" : "warning");
});
elements.syncJoybuy.addEventListener("click", async () => {
  if (busy || !authenticated) return;
  busy = true; setBusy(true);
  try {
    setStatus("Joybuy-Synchronisierung wird vorbereitet …", false, "warning");
    const response = await chrome.runtime.sendMessage({ type: "JOYBUY_SYNC_NOW" });
    if (!response?.ok) throw new Error(response?.error || "Joybuy-Synchronisierung fehlgeschlagen.");
    const result = response.result || {};
    const message = !result.authenticated ? "Bitte melde dich erneut an." : result.blocked ? "Sicherheitsprüfung erkannt. Sync wurde pausiert; nicht verifizierte Bestände bleiben unverändert." : result.empty ? "Keine Joybuy-Prüfung fällig." : `${result.checked || 0} geprüft · ${result.pending || 0} Verifizierung ausstehend${result.continuing ? " · Rest läuft automatisch weiter" : " · abgeschlossen"}.`;
    setStatus(message, false, result.pending || result.waiting ? "warning" : "success");
    addLog(message, result.pending ? "pending" : "done");
    await renderJoybuySyncStatus();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
    addLog(error instanceof Error ? error.message : String(error), "error");
  } finally { busy = false; setBusy(false); }
});
elements.syncAmazonTracking.addEventListener("click", async () => {
  elements.syncAmazonTracking.disabled = true;
  elements.syncAmazonTracking.textContent = "Amazon-Bestellungen werden geprüft…";
  try {
    const result = await cloudCommand("SYNC_AMAZON_TRACKING_PAGE");
    const failures = Number(result.failed || 0);
    setStatus(`${result.synced || 0} Trackingdatensatz/-daten übernommen${failures ? `; ${failures} Zuordnung(en) müssen geprüft werden` : ""}.`, failures > 0, failures ? "warning" : "success");
  } catch (error) { setStatus(error.message || "Amazon-Tracking konnte nicht synchronisiert werden.", true); }
  finally { elements.syncAmazonTracking.disabled = false; elements.syncAmazonTracking.textContent = "Amazon-Tracking synchronisieren"; }
});
elements.openDashboard.addEventListener("click", () => void chrome.tabs.create({ url: "https://autolister-app.de/dashboard" }));
function initialize() {
  if (initialization) return initialization;
  initialization = loadCapturedProduct().catch((error) => {
    const message = /Amazon-Produktseite/i.test(error.message) ? "Kein unterstütztes Produkt auf dieser Seite erkannt. Öffne eine Amazon-Produktseite und versuche es erneut." : error.message;
    setStatus(message, true);
    setSystemState("Produktdaten fehlen", "error");
    currentProduct = null;
    setBusy(false);
  });
  return initialization;
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (["joybuySyncStatus", "joybuyLastSuccessfulQueueRunAt", "joybuyAutoSyncEnabled", "joybuySyncPausedForVerification"].some((key) => key in changes)) {
    const enabled = changes.joybuyAutoSyncEnabled?.newValue ?? elements.joybuyAutoSyncToggle.checked;
    renderAutoSync(enabled !== false);
  }
  const event = changes.latestPipelineStatus?.newValue;
  if (busy && event?.message) { setStatus(event.message, event.stage === "PIPELINE_ERROR"); addLog(event.message, event.stage === "PIPELINE_ERROR" ? "error" : "pending"); }
});

async function cloudCommand(type, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...payload });
  if (!response?.ok) throw new Error(response?.error || "Cloud-Verbindung fehlgeschlagen.");
  return response.result;
}
async function renderCloudAuth() {
  try {
    const state = await cloudCommand("CLOUD_STATUS");
    authenticated = Boolean(state.authenticated);
    elements.authView.hidden = authenticated;
    elements.workspaceView.hidden = !authenticated;
    elements.authMessage.hidden = true;
    document.querySelector("#cloudEmailLabel").textContent = state.email;
    setBusy(false);
    return authenticated;
  } catch (error) { authenticated = false; elements.authView.hidden = false; elements.workspaceView.hidden = true; return false; }
}
document.querySelector("#cloudLogin").addEventListener("submit", async (event) => {
  event.preventDefault();
  const passwordInput = document.querySelector("#cloudPassword");
  const button = document.querySelector("#cloudLoginButton");
  button.disabled = true;
  button.classList.add("is-loading");
  try {
    await cloudCommand("CLOUD_LOGIN", { email: document.querySelector("#cloudEmail").value.trim(), password: passwordInput.value });
    passwordInput.value = "";
    authenticated = true;
    await renderCloudAuth();
    setStatus("Mit deinem AutoLister-Konto verbunden.");
    initialization = undefined;
    await initialize();
  } catch (error) { setStatus(error.message, true); }
  finally { passwordInput.value = ""; button.disabled = false; button.classList.remove("is-loading"); }
});
document.querySelector("#cloudLogout").addEventListener("click", async () => {
  try { await cloudCommand("CLOUD_LOGOUT"); currentProduct = null; initialization = undefined; await renderCloudAuth(); }
  catch (error) { setStatus(error.message, true); }
});
elements.dismissNotice.addEventListener("click", () => { elements.notice.hidden = true; });
async function setSupplierUiFromActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const joybuy = /(^|\.)joybuy\.de$/i.test(new URL(tab?.url || "").hostname);
    if (!joybuy) return;
    document.querySelectorAll(".supplier-eyebrow").forEach((node) => { node.textContent = "JOYBUY → EBAY.DE"; });
    elements.sourcePriceLabel.textContent = "QUELLPREIS (JOYBUY)";
    elements.productName.textContent = "Joybuy-Produkt erkannt";
    elements.productMeta.textContent = "Joybuy-Produktseite erkannt. Produktdaten werden aus der geöffneten Seite gelesen.";
  } catch {}
}
async function boot() {
  await setSupplierUiFromActiveTab();
  const syncSetting = await chrome.storage.local.get("joybuyAutoSyncEnabled");
  renderAutoSync(syncSetting.joybuyAutoSyncEnabled !== false);
  setInterval(() => void renderJoybuySyncStatus(), 60_000);
  if (await renderCloudAuth()) await initialize();
}
document.addEventListener("DOMContentLoaded", () => void boot(), { once: true });
if (document.readyState !== "loading") void boot();
