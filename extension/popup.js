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
  productName: document.querySelector("#productName"), productMeta: document.querySelector("#productMeta"),
  sourcePrice: document.querySelector("#sourcePrice"), salePrice: document.querySelector("#salePrice"),
  profitMargin: document.querySelector("#profitMargin"), listNow: document.querySelector("#listNow"), imageRights: document.querySelector("#imageRightsConfirmed"),
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
  elements.listNow.disabled = busy || !authenticated || !currentProduct || !elements.imageRights.checked;
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
  const sourcePriceText = product.priceText || (Number.isFinite(Number(product.price)) ? `${Number(product.price).toFixed(2).replace(".", ",")} €` : "");
  const salePrice = selectedPrice(sourcePriceText);
  elements.productName.textContent = (product.suggestedTitle || product.title || "Amazon Produkt").slice(0, 80);
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
  if (!tab?.id || !(hostname === "amazon.de" || hostname.endsWith(".amazon.de")) || !asinFromUrl(tab.url)) throw new Error("Bitte eine Amazon.de Produktseite öffnen.");
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
  const response = await requestExtraction((await activeAmazonTab()).id);
  if (!response?.ok) throw new Error(response?.error || "Produktdaten konnten nicht gelesen werden.");
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
      setStatus(`Sunucu ürünü işliyor. İş kimliği: ${result.jobId}`, false, "warning");
      addLog("eBay yükleme işi sunucuda başladı. Bilgisayarı kapatsanız da işlem devam eder.", "done");
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
    setStatus("Mit deinem AutoLister-Konto verbunden.", false);
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
async function boot() { if (await renderCloudAuth()) await initialize(); }
document.addEventListener("DOMContentLoaded", () => void boot(), { once: true });
if (document.readyState !== "loading") void boot();
