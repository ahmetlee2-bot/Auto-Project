(() => {
  if (globalThis.AutoListerAmazonOrders) return;

  const ORDER_ID = /\b\d{3}-\d{7}-\d{7}\b/;
  const TRACKING_ID = /\b(?:TBA|AMZN|JJD|JD|HERMES|DHL|DPD)?[A-Z0-9]{8,30}\b/i;
  const ORDER_HISTORY = /\/gp\/your-account\/order-history(?:\/|$)/i;
  const PROGRESS = /\/progress-tracker\/package(?:\/|$)|\/gp\/your-account\/ship-track/i;
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
  function shippingAddressFromPage() {
    const lines = String(document.body?.innerText || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const headingIndex = lines.findIndex((line) => /^(?:Versandadresse|Lieferadresse|Shipping address)$/i.test(line));
    if (headingIndex < 0) return { recipientName: "", recipientZip: "", recipientCity: "" };
    const addressLines = lines.slice(headingIndex + 1, headingIndex + 12);
    const stopAt = addressLines.findIndex((line) => /^(?:Versand durch|Bestellübersicht|Sendungsverfolgung|Trackingnummer|Tracking ID|Lieferanweisungen)/i.test(line));
    const candidates = stopAt < 0 ? addressLines : addressLines.slice(0, stopAt);
    let recipientName = "";
    let recipientZip = "";
    let recipientCity = "";
    for (const line of candidates) {
      if (!recipientName && !/\d/.test(line) && !/@/.test(line) && line.length >= 3 && line.length <= 100) recipientName = line;
      const cityFirst = line.match(/^(.{2,70}?)\s+(\d{5})$/u);
      const zipFirst = line.match(/^(\d{5})\s+(.{2,70})$/u);
      if (cityFirst) { recipientCity = cityFirst[1].trim(); recipientZip = cityFirst[2]; }
      else if (zipFirst) { recipientZip = zipFirst[1]; recipientCity = zipFirst[2].trim(); }
    }
    return { recipientName, recipientZip, recipientCity };
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
    const address = PROGRESS.test(location.pathname) ? shippingAddressFromPage() : { recipientName: "", recipientZip: "", recipientCity: "" };
    return {
      supplier: "amazon", supplierOrderId: orderId, recipientName: address.recipientName || recipientFrom(root),
      sourceCarrier, sourceTrackingNumber, shareTrackingUrl: shareUrlFrom(root, orderId),
      recipientZip: address.recipientZip, recipientCity: address.recipientCity,
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
  function injectProgressWidget() {
    if (!PROGRESS.test(location.pathname)) return;
    const orderId = new URL(location.href).searchParams.get("orderId") || document.body.innerText.match(ORDER_ID)?.[0] || "";
    const shipment = orderId ? shipmentFrom(document.body, orderId) : null;
    if (!shipment?.sourceTrackingNumber) return;

    // Find the ideal placement right above "Bestellt" / progress status
    function findProgressAnchor() {
      // 1. Look for visible element whose text is strictly "Bestellt" or current shipment status
      const candidates = document.querySelectorAll("h1, h2, h3, h4, h5, div, span, b, strong, p");
      for (const el of candidates) {
        if (el.closest("#navbar, #nav-belt, #nav-main, header, #navFooter, #nav-global-location-slot, #autolister-progress-tracking-widget")) continue;
        const val = (el.innerText || el.textContent || "").trim();
        if (/^(?:Bestellt|Versendet|In Zustellung|Zugestellt)$/i.test(val) && el.children.length === 0) {
          // If inside a small wrapper or status heading, take that container
          const wrapper = el.closest(".pt-status-message, [data-component-type='progress-tracker']") || el;
          return wrapper;
        }
      }

      // 2. Look for the main progress tracker container
      const trackerContainer = document.querySelector("#tracking-events-container, .pt-status-message-container, [data-component-type='progress-tracker'], #progress-tracker-container");
      if (trackerContainer && !trackerContainer.closest("#navbar, header")) {
        return trackerContainer;
      }

      // 3. Look for the arrival date heading in the content area (e.g. "Ankunft morgen")
      const mainContent = document.querySelector("#mainContent, main, #content");
      if (mainContent) {
        const arrival = [...mainContent.querySelectorAll("h1, h2, h3, [role='heading']")]
          .find((n) => !n.closest("#navbar, header, #nav-global-location-slot, #autolister-progress-tracking-widget") && n.textContent && n.textContent.length < 120);
        if (arrival) return arrival;
      }

      return null;
    }

    const anchor = findProgressAnchor();
    // CRITICAL: If the "Bestellt" anchor is not rendered yet, wait for MutationObserver!
    // NEVER fallback to inserting at page top / body / navbar!
    if (!anchor) return;

    let host = document.getElementById("autolister-progress-tracking-widget");
    if (host) {
      // If widget already exists but is misplaced (e.g. at the top of the page), move it to the anchor!
      if (host.nextElementSibling !== anchor && host.parentElement !== anchor.parentElement) {
        anchor.insertAdjacentElement("beforebegin", host);
      }
      return;
    }

    host = document.createElement("div");
    host.id = "autolister-progress-tracking-widget";
    host.style.cssText = "display:block;width:min(520px,calc(100% - 32px));margin:20px auto 16px auto;position:relative;z-index:10;clear:both;";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host{font-family:Arial,Helvetica,sans-serif;color:#1e293b}
        .card{box-sizing:border-box;width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;background:#fff;border:2px solid #2563eb;border-radius:12px;box-shadow:0 4px 14px rgba(37,99,235,0.18)}
        .identity{display:flex;align-items:center;gap:10px;min-width:0}
        .logo{width:32px;height:32px;flex:0 0 32px;display:grid;place-items:center;border-radius:8px;background:#2563eb;color:#fff;font-size:18px;font-weight:800}
        .name{font-size:14px;line-height:18px;font-weight:800;white-space:nowrap;color:#0f172a}
        .dot{display:inline-block;width:7px;height:7px;margin-left:5px;border-radius:50%;background:#22c55e;vertical-align:2px}
        .caption{margin-top:2px;color:#64748b;font-size:11px;line-height:15px}
        button{flex:0 0 auto;padding:8px 14px;border:none;border-radius:8px;background:#2563eb;color:#fff;font-size:12px;font-weight:700;cursor:pointer;transition:background .15s ease}
        button:hover:not(:disabled){background:#1d4ed8}
        button:disabled{opacity:.65;cursor:not-allowed}
        button.success{background:#10b981;color:#fff}
        .error{margin:7px 3px 0;color:#b91c1c;font-size:12px;line-height:16px}
        @media(max-width:420px){.card{align-items:flex-start;flex-direction:column}.action{width:100%}button{width:100%}}
      </style>
      <div class="card">
        <div class="identity"><span class="logo" aria-hidden="true">A</span><div><div class="name">AutoLister<span class="dot" aria-hidden="true"></span></div><div class="caption">Status &amp; Tracking dieser Bestellung jetzt übermitteln.</div></div></div>
        <div class="action"><button type="button" ${!shipment?.sourceTrackingNumber || !shipment?.recipientName || !shipment?.recipientZip ? "disabled" : ""}>An AutoLister senden</button></div>
      </div>
      <p class="error" role="alert" hidden></p>`;
    const button = shadow.querySelector("button");
    const error = shadow.querySelector(".error");
    button?.addEventListener("click", async () => {
      if (!shipment || !button || button.disabled) return;
      button.disabled = true;
      button.textContent = "Wird übermittelt…";
      if (error) { error.hidden = true; error.textContent = ""; }
      try {
        const result = await chrome.runtime.sendMessage({ type: "SYNC_AMAZON_SUPPLIER_TRACKING", shipment });
        if (!result?.ok) throw new Error(result?.error || "Tracking konnte nicht synchronisiert werden.");
        button.textContent = "✓ Übermittelt";
        button.classList.add("success");
      } catch (cause) {
        button.disabled = false;
        button.textContent = "An AutoLister senden";
        if (error) {
          error.textContent = cause instanceof Error ? cause.message : "Tracking konnte nicht synchronisiert werden.";
          error.hidden = false;
        }
      }
    });

    anchor.insertAdjacentElement("beforebegin", host);
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
  injectProgressWidget();
  injectButtons();
  new MutationObserver(() => { injectProgressWidget(); injectButtons(); }).observe(document.documentElement, { childList: true, subtree: true });
})();
