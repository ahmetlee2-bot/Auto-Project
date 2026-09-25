const byId = (id) => document.querySelector(`#${id}`);
const settingKeys = ["apiBaseUrl", "marketplaceId", "currency", "categoryId", "merchantLocationKey", "fulfillmentPolicyId", "paymentPolicyId", "returnPolicyId"];
let drafts = [];
let archivedDrafts = [];
let orders = [];
let liveListings = [];
let legacyMappings = {};

function normalizedStatus(item) { return String(item?.status || item?.listingStatus || item?.listing_status || "").trim().toLowerCase(); }
function isPublished(item) { return ["active", "published", "gelistet"].includes(normalizedStatus(item)); }
function isPoolDraft(item) { return ["draft", "ready"].includes(normalizedStatus(item)); }
function mappingFor(item) {
  const itemId = String(item?.listingId || item?.ebay_item_id || "");
  const saved = legacyMappings[itemId];
  if (saved?.asin || saved?.amazonUrl) return saved;
  const amazonUrl = item?.amazonUrl || item?.sourceUrl || "";
  const asinCandidate = item?.amazonAsin || item?.asin || item?.sourceId || "";
  const asin = String(asinCandidate).toUpperCase().match(/(?:^|\/)(B0[A-Z0-9]{8})(?:$|[/?])/i)?.[1]
    || String(asinCandidate).toUpperCase().match(/^B0[A-Z0-9]{8}$/)?.[0]
    || String(amazonUrl).toUpperCase().match(/\/(?:DP|GP\/PRODUCT)\/(B0[A-Z0-9]{8})(?:[/?]|$)/)?.[1]
    || "";
  return asin || amazonUrl ? { itemId, asin: asin || "Amazon", amazonUrl } : null;
}
function routedActiveListings() {
  const active = liveListings.filter(isPublished);
  return { mapped: active.filter((item) => Boolean(mappingFor(item))), unmatched: active.filter((item) => !mappingFor(item)) };
}

function status(target, message, error = false) { byId(target).textContent = message; byId(target).classList.toggle("error", error); }
function showBridgeError(error) { const banner = byId("bridgeBanner"); if (!banner) return; byId("bridgeBannerMessage").textContent = AlltaghausBridge.displayError(error); banner.hidden = false; }
function emptyRow(target, columns) { const row = document.createElement("tr"); row.innerHTML = `<td class="empty-state" colspan="${columns}">Keine Daten verfügbar</td>`; byId(target).replaceChildren(row); }
function showToast(message) { let toast = byId("toast"); if (!toast) { toast = document.createElement("div"); toast.id = "toast"; Object.assign(toast.style, { position: "fixed", zIndex: "20", top: "18px", right: "22px", padding: "14px 18px", borderRadius: "12px", color: "#fff", background: "#14885f", boxShadow: "0 16px 36px rgb(20 54 39 / 20%)", fontSize: "13px", fontWeight: "700" }); document.body.append(toast); } toast.textContent = message; toast.hidden = false; clearTimeout(showToast.timer); showToast.timer = setTimeout(() => { toast.hidden = true; }, 4200); }
function baseUrl() { return byId("apiBaseUrl").value.replace(/\/$/, ""); }
async function command(type, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...payload });
  if (response?.ok) return response.result;
  const error = new Error(response?.error || "Vorgang fehlgeschlagen.");
  Object.assign(error, response?.debug || {});
  console.error("DASHBOARD COMMAND ERROR:", { type, stage: error.stage, code: error.code, requestId: error.requestId, details: error.details, error });
  throw error;
}
async function request(path, options = {}) {
  const { supabaseSession = null } = await chrome.storage.local.get(["supabaseSession"]);
  const headers = { ...(options.headers || {}) };
  if (supabaseSession?.access_token) headers.Authorization = `Bearer ${supabaseSession.access_token}`;
  try { return await globalThis.AlltaghausBridge.requestJson(`${baseUrl()}${path}`, { ...options, headers }, 90000); } catch (error) { showBridgeError(error); throw error; }
}
function marginFor(draft) { const source = Number(String(draft.sourcePriceText || "").replace(/[^0-9,]/g, "").replace(",", ".")); return source ? Math.max(0, ((Number(draft.price) / source) - 1) * 100) : null; }
function sourceCost(draft) { return Number(String(draft.sourcePriceText || "").replace(/[^0-9,]/g, "").replace(",", ".")) || 0; }
function euro(value) { return `${Number(value || 0).toFixed(2).replace(".", ",")} €`; }

function renderRows() {
  const poolDrafts = drafts.filter(isPoolDraft);
  const selected = new Set([...document.querySelectorAll(".pick:checked")].map((box) => box.value));
  const rows = poolDrafts.map((draft) => {
    const row = document.createElement("tr");
    const image = draft.imageUrls?.[0] || "";
    const margin = marginFor(draft);
    const inStock = Number(draft.quantity) > 0;
    const netProfit = Math.max(0, Number(draft.price || 0) - sourceCost(draft));
    row.innerHTML = `<td><input class="pick" type="checkbox" value="${draft.id}" ${selected.has(draft.id) ? "checked" : ""}></td><td>${image ? `<img src="${image}" alt="">` : "—"}</td><td><strong>${draft.title || "Ohne Titel"}</strong><small>${draft.sourceId || ""}</small></td><td>${draft.sourcePriceText || "—"}</td><td>${draft.price || "—"} ${draft.currency || "EUR"}</td><td>${margin === null || !Number.isFinite(margin) ? "—" : `${margin.toFixed(1)} %`}</td><td><span class="badge ${inStock ? "live" : "ready"}">${inStock ? "Auf Lager" : "Ausverkauft"}</span></td><td>${euro(netProfit)}</td><td><span class="badge ${draft.status === "PUBLISHED" ? "live" : "ready"}">${draft.status === "PUBLISHED" ? "Gelistet" : "Ready"}</span></td><td class="row-actions"></td>`;
    const actions = row.querySelector(".row-actions");
    const priceInput = document.createElement("input");
    priceInput.type = "text"; priceInput.inputMode = "decimal"; priceInput.value = draft.price || "";
    priceInput.setAttribute("aria-label", "Verkaufspreis in EUR"); priceInput.style.width = "100px";
    const savePrice = document.createElement("button");
    savePrice.className = "quiet small"; savePrice.textContent = "Preis speichern";
    savePrice.onclick = async () => {
      savePrice.disabled = true;
      try {
        const price = manualPriceValue(priceInput.value);
        await request("/ebay/drafts/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draftId: draft.id, price, quantity: draft.quantity }) });
        await command("REMEMBER_MANUAL_PRICE", { sourceId: draft.sourceId, sku: draft.sku, price });
        await load();
        status("poolStatus", `Preis gespeichert: ${euro(price)}`);
      } catch (error) { status("poolStatus", error.message, true); }
      finally { savePrice.disabled = false; }
    };
    row.children[4].replaceChildren(priceInput, savePrice);
    const publishButton = document.createElement("button"); publishButton.className = "publish small"; publishButton.textContent = "Jetzt veröffentlichen"; publishButton.onclick = () => void publish([draft.id]); actions.append(publishButton);
    const editLink = document.createElement("button"); editLink.className = "quiet small"; editLink.textContent = "URL anpassen"; editLink.onclick = () => void editAmazonLink(draft); actions.append(editLink);
    const remove = document.createElement("button"); remove.className = "delete small"; remove.textContent = draft.status === "PUBLISHED" ? "Aus Dashboard entfernen" : "Löschen"; remove.onclick = () => void removeDraft(draft.id, draft.status === "PUBLISHED"); actions.append(remove);
    return row;
  });
  rows.length ? byId("draftRows").replaceChildren(...rows) : emptyRow("draftRows", 10);
}

function renderLive() {
  const live = routedActiveListings().mapped;
  const rows = live.map((draft) => {
    const row = document.createElement("tr");
    const itemId = draft.listingId || "—";
    const mapping = mappingFor(draft);
    const link = draft.ebayListingUrl || (draft.listingId ? `https://www.ebay.de/itm/${encodeURIComponent(draft.listingId)}` : "");
    const image = draft.imageUrls?.[0] || draft.imageUrl || "";
    row.innerHTML = `<td>${image ? `<img src="${image}" alt="" loading="lazy">` : "—"}</td><td><strong>${draft.title || "Ohne Titel"}</strong></td><td>${Number(draft.quantity) > 0 ? "Auf Lager" : "Ausverkauft"}</td><td>${link ? `<a href="${link}" target="_blank" rel="noreferrer">${itemId}</a>` : itemId}</td><td>${mapping ? `<span class="badge live">${mapping.asin}</span>` : `<span class="badge ready">Nicht verknüpft</span>`}</td><td><span class="badge live">Aktiv</span></td><td><input class="live-price" type="number" min="0.01" step="0.01" value="${draft.price || ""}"></td><td><input class="live-quantity" type="number" min="0" step="1" value="${draft.quantity ?? 0}"></td><td></td>`;
    const view = document.createElement("button"); view.className = "quiet small"; view.textContent = "Anzeige öffnen"; view.onclick = () => openLiveListing(draft); row.lastElementChild.append(view);
    const update = document.createElement("button"); update.className = "publish small"; update.textContent = "Aktualisieren"; update.onclick = () => void updateLiveListing(draft, row); row.lastElementChild.append(update);
    return row;
  });
  rows.length ? byId("liveRows").replaceChildren(...rows) : emptyRow("liveRows", 9); byId("liveBadge").textContent = live.length;
}

function renderLegacyMappings() {
  const unmatched = routedActiveListings().unmatched;
  const rows = unmatched.map((listing) => {
    const row = document.createElement("tr");
    const image = listing.imageUrls?.[0] || listing.imageUrl || "";
    const itemId = listing.listingId || listing.ebay_item_id || "";
    row.innerHTML = `<td>${image ? `<img src="${image}" alt="" loading="lazy">` : "—"}</td><td><a href="https://www.ebay.de/itm/${encodeURIComponent(itemId)}" target="_blank" rel="noreferrer">${itemId}</a></td><td><strong>${listing.title || "Ohne Titel"}</strong></td><td><span class="badge ready">Nicht verknüpft</span></td><td></td>`;
    const connect = document.createElement("button");
    connect.className = "publish small"; connect.textContent = "Verbinden";
    connect.onclick = () => { byId("legacyItemId").value = itemId; byId("legacyAmazonUrl").focus(); };
    row.onclick = (event) => { if (!event.target.closest("a,button")) connect.click(); };
    row.lastElementChild.append(connect);
    return row;
  });
  rows.length ? byId("legacyRows").replaceChildren(...rows) : emptyRow("legacyRows", 5);
  byId("legacyBadge").textContent = unmatched.length;
}

async function saveLegacyMapping() {
  try {
    const itemId = byId("legacyItemId").value.trim();
    const listing = liveListings.find((item) => String(item.listingId) === itemId);
    if (!listing) throw new Error("Diese Item-ID wurde nicht in den aktiven eBay-Angeboten gefunden. Zuerst Aktualisieren drücken.");
    await command("SAVE_LEGACY_MAPPING", {
      itemId, amazonUrl: byId("legacyAmazonUrl").value.trim(), targetMarginPercent: byId("legacyMargin").value,
      title: listing.title, sku: listing.sku, offerId: listing.offerId, price: listing.price, quantity: listing.quantity,
    });
    byId("legacyItemId").value = ""; byId("legacyAmazonUrl").value = "";
    await load(); status("legacyStatus", "Legacy-Angebot ist mit Amazon verbunden und wird überwacht.");
  } catch (error) { console.error("LEGACY MAPPING ERROR:", error); status("legacyStatus", error.message, true); }
}

async function updateLiveListing(listing, row) {
  let feedback = row.querySelector(".price-feedback");
  if (!feedback) { feedback = document.createElement("small"); feedback.className = "price-feedback"; feedback.setAttribute("role", "status"); row.lastElementChild.append(feedback); }
  try {
    const price = manualPriceValue(row.querySelector(".live-price").value);
    const quantity = row.querySelector(".live-quantity").value;
    feedback.textContent = "Preis wird gespeichert …";
    const stored = drafts.find((draft) => draft.listingId === listing.listingId);
    const result = stored
      ? await request("/ebay/drafts/sync", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ draftId: stored.id, price, quantity }) })
      : await request("/ebay/active-listings/update", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ sku: listing.sku, offerId: listing.offerId, listingId: listing.listingId, price, quantity }) });
    await command("REMEMBER_MANUAL_PRICE", { sourceId: stored?.sourceId, sku: listing.sku, listingId: listing.listingId, price });
    listing.price = result.price; listing.quantity = Number(result.quantity);
    feedback.textContent = `Erfolgreich aktualisiert: ${euro(result.price)}`;
  } catch (error) { console.error("ACTIVE UPDATE ERROR:", { listing, error }); feedback.textContent = error.message; }
}
function manualPriceValue(value) {
  const raw = String(value).trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw) || Number(raw) <= 0) throw new Error("Bitte einen positiven Preis mit maximal zwei Nachkommastellen eingeben.");
  return Number(raw).toFixed(2);
}
function openLiveListing(listing) {
  if (!listing.listingId) { status("poolStatus", "Für dieses Angebot ist keine eBay Item-ID verfügbar.", true); return; }
  window.open(`https://www.ebay.de/itm/${encodeURIComponent(listing.listingId)}`, "_blank", "noopener");
}

function renderArchive() {
  const rows = archivedDrafts.map((draft) => {
    const row = document.createElement("tr");
    const image = draft.imageUrls?.[0] || "";
    row.innerHTML = `<td>${image ? `<img src="${image}" alt="">` : "—"}</td><td><strong>${draft.title || "Ohne Titel"}</strong><small>${draft.sourceId || ""}</small></td><td>${draft.price || "—"} ${draft.currency || "EUR"}</td><td>${draft.archivedAt ? new Date(draft.archivedAt).toLocaleString("de-DE") : "—"}</td><td></td>`;
    const restore = document.createElement("button"); restore.className = "publish small"; restore.textContent = "Wiederherstellen"; restore.onclick = () => void restoreDraft(draft.id); row.lastElementChild.append(restore);
    const remove = document.createElement("button"); remove.className = "delete small"; remove.textContent = "Endgültig löschen"; remove.onclick = () => void deleteArchivedDraft(draft.id); row.lastElementChild.append(remove);
    return row;
  });
  rows.length ? byId("archiveRows").replaceChildren(...rows) : emptyRow("archiveRows", 5);
  byId("archiveBadge").textContent = archivedDrafts.length;
}

function renderStats() {
  const waiting = drafts.filter(isPoolDraft); const live = liveListings.filter(isPublished).filter((item, index, list) => list.findIndex((entry) => (entry.listingId || entry.ebay_item_id) === (item.listingId || item.ebay_item_id)) === index);
  const margins = drafts.map(marginFor).filter(Number.isFinite);
  const today = new Date().toISOString().slice(0, 10);
  const todayRevenue = orders.filter((order) => String(order.createdDate || "").slice(0, 10) === today).reduce((total, order) => total + Number(order.total || 0), 0);
  const totalProfit = live.reduce((total, draft) => total + Math.max(0, Number(draft.price || 0) - sourceCost(draft)), 0);
  byId("waitingCount").textContent = waiting.length; byId("listedCount").textContent = live.length; byId("marginAverage").textContent = margins.length ? `${(margins.reduce((a, b) => a + b, 0) / margins.length).toFixed(1)} %` : "—"; byId("todayRevenue").textContent = euro(todayRevenue); byId("totalProfit").textContent = euro(totalProfit); byId("readyBadge").textContent = waiting.length;
}

function addressText(address = {}) { return [address.addressLine1, address.addressLine2, [address.postalCode, address.city].filter(Boolean).join(" "), address.countryCode].filter(Boolean).join("\n"); }
function renderOrders() {
  const rows = orders.map((order) => {
    const row = document.createElement("tr");
    const item = order.lineItems?.[0] || {};
    row.innerHTML = `<td><strong>${order.orderId || "—"}</strong></td><td>${order.buyerName || "—"}<small>${addressText(order.address).replace(/\n/g, " · ")}</small></td><td>${item.title || "—"}<small>${item.sku || ""}</small></td><td>${euro(order.total)}</td><td></td>`;
    const button = document.createElement("button"); button.className = "publish small"; button.textContent = "Auf Amazon bestellen"; button.onclick = async () => {
      const draft = drafts.find((entry) => entry.sku === item.sku || entry.title === item.title);
      await navigator.clipboard.writeText(addressText(order.address));
      const asin = draft?.sourceId || String(item.sku || "").match(/B0[A-Z0-9]{8}/i)?.[0];
      await chrome.tabs.create({ url: draft?.amazonUrl || draft?.sourceUrl || (asin ? `https://www.amazon.de/dp/${asin}` : `https://www.amazon.de/s?k=${encodeURIComponent(item.title || "")}`) });
      status("ordersStatus", "Adresse kopiert und Produktseite geöffnet.");
    }; row.lastElementChild.append(button); return row;
  });
  rows.length ? byId("orderRows").replaceChildren(...rows) : emptyRow("orderRows", 5); byId("orderBadge").textContent = orders.length;
}
async function editAmazonLink(draft) {
  const value = window.prompt("Amazon Produktlink (amazon.de/dp/ASIN):", draft.amazonUrl || draft.sourceUrl || "");
  if (value === null) return;
  try {
    const result = await request("/ebay/drafts/link", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ draftId: draft.id, sourceId: draft.sourceId, sku: draft.sku, amazonUrl: value }) });
    await command("UPDATE_AMAZON_LINK", { sourceId: draft.sourceId, amazonUrl: result.amazonUrl });
    await load(); status("poolStatus", "Amazon-Link aktualisiert.");
  } catch (error) { status("poolStatus", error.message, true); }
}

async function load() {
  try {
    const state = await command("GET_DASHBOARD_STATE");
    for (const key of settingKeys) byId(key).value = state.settings[key] || "";
    legacyMappings = state.legacyMappings || {};
    const [result, archive, orderResult, liveResult, cloudLegacy] = await Promise.all([
      request("/ebay/drafts"), request("/ebay/drafts/archive"),
      request("/ebay/orders").catch((error) => ({ orders: [], error })),
      request("/ebay/active-listings").catch((error) => ({ listings: [], error })),
      request("/legacy-mappings").catch(() => null),
    ]);
    for (const row of cloudLegacy?.mappings || []) {
      legacyMappings[row.ebay_item_id] = {
        itemId: row.ebay_item_id, listingId: row.ebay_item_id, asin: row.amazon_asin, amazonUrl: row.amazon_url,
        title: row.title, sku: row.ebay_sku, offerId: row.ebay_offer_id, ebayPrice: row.ebay_price,
        ebayQuantity: row.ebay_quantity, targetMarginPercent: row.target_margin_percent,
      };
    }
    drafts = result.drafts || []; archivedDrafts = archive.drafts || [];
    orders = orderResult.orders || []; liveListings = (liveResult.listings || []).filter(isPublished);
    renderStats(); renderRows(); renderLive(); renderLegacyMappings(); renderArchive(); renderOrders();
    status("poolStatus", "Produktpool aktuell.");
    if (orderResult.error) status("ordersStatus", `Bestellungen konnten nicht geladen werden: ${orderResult.error.message}`, true);
    if (liveResult.error) status("poolStatus", `Aktive eBay-Angebote konnten nicht geladen werden: ${liveResult.error.message}`, true);
  } catch (error) { status("poolStatus", error.message, true); }
}
async function publish(ids) {
  status("poolStatus", "eBay-Veröffentlichung wird vorbereitet …");
  let done = 0;
  for (const originalDraftId of ids) {
    let draftId = originalDraftId;
    try {
      const published = await request("/ebay/drafts/publish", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ draftId }) });
      const listingId = published.listingId || published.ebay_item_id;
      const localDraft = drafts.find((draft) => draft.id === draftId);
      if (localDraft) Object.assign(localDraft, { status: "PUBLISHED", listingId, ebay_item_id: listingId, ebayListingUrl: listingId ? `https://www.ebay.de/itm/${listingId}` : null });
      if (localDraft && !liveListings.some((item) => item.listingId === listingId)) liveListings.push(localDraft);
      showToast("Produkt erfolgreich auf eBay hochgeladen");
      done++;
    } catch (error) {
      const failedDraft = drafts.find((draft) => draft.id === draftId);
      const needsImageRebuild = /25002|IMAGE_REBUILD_REQUIRED|Bildergrundsatz|500\s*Pixel/i.test(String(error.message || ""));
      if (!needsImageRebuild || !failedDraft?.sourceId) {
        console.error("PUBLISH ERROR:", { draftId, error });
        status("poolStatus", error.message, true);
        break;
      }
      try {
        status("poolStatus", "Kleine Altbilder erkannt. Amazon-Galerie wird neu aufgebaut …");
        const rebuilt = await command("REBUILD_DRAFT_FROM_AMAZON", { sourceId: failedDraft.sourceId });
        draftId = rebuilt.draftId;
        status("poolStatus", "Bilder wurden mit mindestens 500 px neu erstellt. Veröffentlichung läuft …");
        await request("/ebay/drafts/publish", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ draftId }) });
        done++;
      } catch (rebuildError) {
        console.error("IMAGE REBUILD ERROR:", { draftId, error: rebuildError });
        status("poolStatus", `Galerie konnte nicht erneuert werden: ${rebuildError.message}`, true);
        break;
      }
    }
  }
  if (done) status("poolStatus", `${done} Produkt(e) veröffentlicht.`);
  await load();
}
async function refreshPublishedDraft(draft) {
  try {
    status("poolStatus", "Amazon-Galerie und HTML werden für die Live-Anzeige neu aufgebaut …");
    const result = await command("REFRESH_PUBLISHED_DRAFT_FROM_AMAZON", { draftId: draft.id, sourceId: draft.sourceId });
    status("poolStatus", `Live-Anzeige aktualisiert: ${result.processedImageCount} bereinigte Bilder.`);
    await load();
  } catch (error) {
    console.error("PUBLISHED DRAFT REFRESH ERROR:", { draftId: draft.id, error });
    status("poolStatus", error.message, true);
  }
}

async function removeDraft(draftId, localOnly = false) {
  const target = drafts.find((draft) => draft.id === draftId);
  try {
    status("poolStatus", "Entwurf wird gelöscht …");
    const result = await request("/ebay/drafts/delete", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ draftId, sourceId: target?.sourceId || "", localOnly }) });
    drafts = drafts.filter((draft) => draft.id !== draftId);
    renderStats(); renderRows();
    await command("REMOVE_STAGING_CACHE", { draftId, sourceId: result.sourceId || target?.sourceId || "" });
    status("poolStatus", localOnly ? "Dashboard-Eintrag entfernt." : "Entwurf ins Archiv verschoben.");
  } catch (error) { console.error("DELETE ERROR:", { draftId, error }); status("poolStatus", error.message, true); }
}
async function resetDrafts() {
  try {
    status("poolStatus", "Staging-Speicher wird bereinigt …");
    const result = await request("/ebay/drafts/reset", { method:"POST", headers:{"Content-Type":"application/json"}, body:"{}" });
    await command("RESET_STAGING_CACHE", { sourceIds: result.deletedSourceIds || [] });
    drafts = drafts.filter((draft) => draft.status === "PUBLISHED");
    renderStats(); renderRows();
    await load();
    status("poolStatus", `${result.deletedCount || 0} Entwurf/Entwürfe ins Archiv verschoben.`);
  } catch (error) { console.error("RESET ERROR:", error); status("poolStatus", error.message, true); }
}
async function restoreDraft(draftId) {
  try {
    status("archiveStatus", "Entwurf wird wiederhergestellt …");
    await request("/ebay/drafts/restore", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ draftId }) });
    await load();
    status("archiveStatus", "Entwurf wiederhergestellt.");
  } catch (error) { console.error("RESTORE ERROR:", { draftId, error }); status("archiveStatus", error.message, true); }
}
async function deleteArchivedDraft(draftId) {
  try {
    status("archiveStatus", "Archivierter Entwurf wird gelöscht …");
    await request("/ebay/drafts/archive/delete", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ draftId }) });
    archivedDrafts = archivedDrafts.filter((draft) => draft.id !== draftId);
    renderArchive();
    status("archiveStatus", "Archivierter Entwurf endgültig gelöscht.");
  } catch (error) {
    console.error("ARCHIVE DELETE ERROR:", { draftId, error });
    status("archiveStatus", error.message, true);
  }
}

document.querySelectorAll(".tab").forEach((tab) => tab.onclick = () => { document.querySelectorAll(".tab,.view").forEach((node) => node.classList.remove("active")); tab.classList.add("active"); byId(tab.dataset.tab).classList.add("active"); if (tab.dataset.tab === "live") void load(); });
byId("selectAll").onchange = (event) => document.querySelectorAll(".pick").forEach((box) => { box.checked = event.target.checked; });
byId("publishSelected").onclick = () => void publish([...document.querySelectorAll(".pick:checked")].map((box) => box.value));
byId("resetDrafts").onclick = () => void resetDrafts();
byId("refresh").onclick = async (event) => { const button = event.currentTarget; button.disabled = true; button.textContent = "Aktualisiere …"; await load(); await new Promise((resolve) => setTimeout(resolve, 1000)); button.disabled = false; button.textContent = "Aktualisieren"; };
byId("saveSettings").onclick = async () => { const settings = Object.fromEntries(settingKeys.map((key) => [key, byId(key).value.trim()])); try { await command("SAVE_SETTINGS", { settings }); status("settingsStatus", "Einstellungen gespeichert."); } catch (error) { status("settingsStatus", error.message, true); } };
byId("testConnection").onclick = async () => { try { const data = await request("/ebay/status"); status("settingsStatus", `Verbindung bereit · ${data.environment}`); } catch (error) { status("settingsStatus", error.message, true); } };
byId("saveLegacyMapping").onclick = () => void saveLegacyMapping();
byId("runLegacyMonitor").onclick = async () => { try { status("legacyStatus", "Amazon-Preise und Bestände werden geprüft …"); const result = await command("RUN_MONITOR_NOW"); status("legacyStatus", `${result.checked} Produkt(e) geprüft, ${result.changed} Änderung(en).`); await load(); } catch (error) { status("legacyStatus", error.message, true); } };
byId("customImageOverlay").checked = true;
byId("customImageOverlay").disabled = true;
byId("customImageOverlay").title = "Hauptbild-Badges sind im aktuellen Bildprofil obligatorisch.";
byId("bridgeBannerClose").onclick = () => { byId("bridgeBanner").hidden = true; };
void load();
