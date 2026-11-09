(() => {
  if (globalThis.AutoListerAmazonOrders) return;

  const ORDER_ID = /\b\d{3}-\d{7}-\d{7}\b/;
  const TRACKING_ID = /\b(?:TBA|AMZN|JJD|JD|HERMES|DHL|DPD)?[A-Z0-9]{8,30}\b/i;
  const ORDER_HISTORY = /\/gp\/your-account\/order-history(?:\/|$)/i;
  const PROGRESS = /\/progress-tracker\/package\/|\/gp\/your-account\/ship-track/i;
  const sentButtons = new WeakSet();

  const text = (node) => String(node?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
  const absoluteUrl = (value) => {
    try {
      const url = new URL(value, location.href);
      if (url.protocol !== "https:" || !/(^|\.)amazon\.de$/i.test(url.hostname)) return "";
      return url.toString();
    } catch { return ""; }
  };
  function shareUrlFrom(root, orderId) {
    for (const anchor of root.querySelectorAll("a[href]")) {
      const href = absoluteUrl(anchor.href);
      if (href && PROGRESS.test(new URL(href).pathname)) return href;
    }
    for (const element of root.querySelectorAll("[data-clipboard-text],[data-share-url],[data-url]")) {
      const label = `${element.getAttribute("aria-label") || ""} ${text(element)}`;
      if (!/teilen|share|sendungsverfolgung/i.test(label)) continue;
      for (const value of [element.dataset.clipboardText, element.dataset.shareUrl, element.dataset.url]) {
        const href = absoluteUrl(value);
        if (href && PROGRESS.test(new URL(href).pathname)) return href;
      }
    }
    const dialog = document.querySelector('[role="dialog"], .a-popover-modal');
    if (dialog && /teilen|share|sendungsverfolgung/i.test(text(dialog))
      && (!orderId || text(dialog).includes(orderId))) {
      for (const element of dialog.querySelectorAll("input[value],textarea,[data-clipboard-text],[data-share-url],[data-url]")) {
        const href = absoluteUrl(element.value || element.dataset.clipboardText || element.dataset.shareUrl || element.dataset.url);
        if (href && PROGRESS.test(new URL(href).pathname)) return href;
      }
    }
    if (PROGRESS.test(location.pathname)) return absoluteUrl(location.href);
    return "";
  }
  function recipientFrom(root) {
    const candidates = [
      ...root.querySelectorAll("[data-recipient-name], .recipient-name, .a-color-secondary"),
    ].map((node) => node.dataset?.recipientName || text(node)).filter(Boolean);
    candidates.push(String(root?.innerText || root?.textContent || ""));
    for (const candidate of candidates) {
      const match = candidate.match(/(?:Versand|Lieferung|Geliefert)\s+an\s*:?\s*([^\n\r]{3,100})/iu);
      const value = match?.[1]?.trim().replace(/\s+(?:Bestelldetails|Lieferadresse|Adresse ändern).*$/i, "");
      if (value && !/^(?:anzeigen|ändern|verwalten)$/i.test(value)) return value.slice(0, 160);
    }
    return "";
  }
  function shipmentFrom(root, orderId) {
    const bodyText = text(root);
    const deliveryStatus = /zugestellt|erfolgreich zugestellt/i.test(bodyText) ? "DELIVERED"
      : /in zustellung|heute zustellbar/i.test(bodyText) ? "OUT_FOR_DELIVERY"
      : /unterwegs|wird zugestellt/i.test(bodyText) ? "IN_TRANSIT"
      : /versandt|versendet|auf dem weg/i.test(bodyText) ? "SHIPPED" : "ORDER_RECEIVED";
    let sourceTrackingNumber = "";
    for (const match of bodyText.matchAll(/(?:Sendungsnummer|Tracking\s*ID|Trackingnummer|Verfolgungsnummer)\s*:?\s*([A-Z0-9-]{8,40})/gi)) {
      const value = match[1].replace(/-/g, "");
      if (value !== orderId.replace(/-/g, "")) { sourceTrackingNumber = value; break; }
    }
    if (!sourceTrackingNumber) {
      const candidates = bodyText.match(new RegExp(TRACKING_ID.source, "gi")) || [];
      sourceTrackingNumber = candidates.find((value) => value.toUpperCase() !== orderId.replace(/-/g, "").toUpperCase() && !/^20\d{6,}$/.test(value)) || "";
    }
    const sourceCarrier = /\bTBA[A-Z0-9]+\b/i.test(sourceTrackingNumber) || /amazon\s*logistics/i.test(bodyText)
      ? "Amazon Logistics"
      : /\bDHL\b/i.test(bodyText) ? "DHL"
      : /\bHermes\b/i.test(bodyText) ? "Hermes"
      : /\bDPD\b/i.test(bodyText) ? "DPD"
      : /\bGLS\b/i.test(bodyText) ? "GLS" : "Amazon";
    const rawDate = bodyText.match(/(?:Lieferung|Zustellung)\s+(?:am|bis)\s+(\d{1,2}\.\s*[A-Za-zÄÖÜäöüß]+\s+20\d{2})/i)?.[1];
    let estimatedDeliveryDate;
    if (rawDate) {
      const date = new Date(`${rawDate} 12:00`);
      if (!Number.isNaN(date.valueOf())) estimatedDeliveryDate = date.toISOString().slice(0, 10);
    }
    return {
      supplier: "amazon", supplierOrderId: orderId, recipientName: recipientFrom(root),
      sourceCarrier, sourceTrackingNumber, shareTrackingUrl: shareUrlFrom(root, orderId),
      deliveryStatus,
      ...(estimatedDeliveryDate ? { estimatedDeliveryDate } : {}),
    };
  }
  function orderCards() {
    let nodes = [...document.querySelectorAll("[data-order-id], .order-card")];
    if (!nodes.length) nodes = [...document.querySelectorAll(".a-box-group")].filter((node) => [...text(node).matchAll(new RegExp(ORDER_ID.source, "g"))].length === 1);
    const found = new Map();
    for (const node of nodes) {
      const orderId = node.getAttribute("data-order-id")?.match(ORDER_ID)?.[0] || text(node).match(ORDER_ID)?.[0];
      if (!orderId || found.has(orderId)) continue;
      if (!/versandt|geliefert|tracking|sendungsverfolgung|lieferung verfolgen/i.test(text(node))) continue;
      found.set(orderId, node);
    }
    return [...found.entries()];
  }
  function injectButtons() {
    if (!ORDER_HISTORY.test(location.pathname)) return;
    for (const [orderId, card] of orderCards()) {
      const shipment = shipmentFrom(card, orderId);
      if (!shipment.sourceTrackingNumber || card.querySelector(".autolister-amazon-track-button")) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "autolister-amazon-track-button";
      button.textContent = "AutoLister: Tracking senden";
      button.style.cssText = "display:inline-flex;align-items:center;justify-content:center;margin:10px 0;padding:9px 14px;border:0;border-radius:9px;background:#1769e0;color:#fff;font:600 13px Arial,sans-serif;cursor:pointer;z-index:2";
      button.title = shipment.recipientName ? "Lieferanten-Tracking sicher deinem eBay-Auftrag zuordnen" : "Empfängername wird vor dem Speichern benötigt";
      button.disabled = !shipment.recipientName;
      button.addEventListener("click", async () => {
        if (sentButtons.has(button)) return;
        sentButtons.add(button); button.disabled = true; button.textContent = "Wird übertragen…";
        try {
          const result = await chrome.runtime.sendMessage({ type: "SYNC_AMAZON_SUPPLIER_TRACKING", shipment });
          if (!result?.ok) throw new Error(result?.error || "Tracking konnte nicht synchronisiert werden.");
          button.textContent = result.result?.updated ? "Tracking aktualisiert ✓" : "Tracking übernommen ✓";
          button.style.background = "#087f5b";
        } catch (error) {
          sentButtons.delete(button); button.disabled = false; button.textContent = "AutoLister: Tracking senden";
          window.alert(error instanceof Error ? error.message : "Tracking konnte nicht synchronisiert werden.");
        }
      });
      card.append(button);
    }
  }
  function extractAll() {
    if (!ORDER_HISTORY.test(location.pathname) && !PROGRESS.test(location.pathname)) throw new Error("Öffne zuerst die Amazon-Bestellübersicht oder die Paketverfolgung.");
    if (PROGRESS.test(location.pathname)) {
      const orderId = new URL(location.href).searchParams.get("orderId") || document.body.innerText.match(ORDER_ID)?.[0];
      const shipment = orderId ? shipmentFrom(document.body, orderId) : null;
      return shipment?.sourceTrackingNumber ? [shipment] : [];
    }
    return orderCards().map(([orderId, card]) => shipmentFrom(card, orderId)).filter((item) => item.sourceTrackingNumber && item.recipientName).slice(0, 50);
  }

  globalThis.AutoListerAmazonOrders = { extractAll };
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "EXTRACT_AMAZON_TRACKING") return false;
    try { sendResponse({ ok: true, shipments: extractAll() }); }
    catch (error) { sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }); }
    return false;
  });
  injectButtons();
  new MutationObserver(() => injectButtons()).observe(document.documentElement, { childList: true, subtree: true });
})();
