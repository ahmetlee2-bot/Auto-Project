(() => {
  if (globalThis.__autolisterJoybuyLoaded) return;
  globalThis.__autolisterJoybuyLoaded = true;

  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const absoluteUrl = (value) => {
    try {
      const url = new URL(value, location.href);
      return url.protocol === "https:" ? url.href : "";
    } catch { return ""; }
  };

  function collectProducts(value, result = []) {
    if (!value || typeof value !== "object") return result;
    if (String(value["@type"] || "").toLowerCase().split(/\s+/).includes("product")) result.push(value);
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach((item) => collectProducts(item, result));
      else if (child && typeof child === "object") collectProducts(child, result);
    }
    return result;
  }

  function readStructuredProducts() {
    const products = [];
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try { collectProducts(JSON.parse(script.textContent || "null"), products); } catch {}
    }
    return products;
  }

  function parsePrice(value) {
    const text = clean(value).replace(/[^\d,.\-]/g, "");
    if (!text || !/\d/.test(text)) return 0;
    const comma = text.lastIndexOf(",");
    const dot = text.lastIndexOf(".");
    let normalized = text;
    if (comma >= 0 && dot >= 0) {
      const decimal = Math.max(comma, dot);
      normalized = text.slice(0, decimal).replace(/[,.]/g, "") + "." + text.slice(decimal + 1).replace(/[,.]/g, "");
    } else if (comma >= 0) {
      normalized = text.replace(/\./g, "").replace(",", ".");
    } else if (dot >= 0 && /\.\d{3}(?:$)/.test(text)) {
      normalized = text.replace(/\./g, "");
    }
    const price = Number(normalized);
    return Number.isFinite(price) && price > 0 ? price : 0;
  }

  function offerList(product) {
    const offers = product?.offers;
    return Array.isArray(offers) ? offers : offers ? [offers] : [];
  }

  function highResolutionUrl(value) {
    // Keep only URLs exposed by the page; srcset/data-zoom-image ordering below
    // selects the largest real variant without guessing undocumented CDN paths.
    return absoluteUrl(value);
  }

  function productImageUrl(value) {
    const url = highResolutionUrl(value);
    if (!url) return "";
    const parsed = new URL(url);
    return /(^|\.)joy-sourcing\.com$/i.test(parsed.hostname) && /\/product\//i.test(parsed.pathname) ? url : "";
  }

  function imageCandidates(image) {
    const candidates = [];
    const srcset = image.getAttribute("srcset") || image.getAttribute("data-srcset") || "";
    for (const part of srcset.split(",")) {
      const match = part.trim().match(/^(\S+)\s+(\d+(?:\.\d+)?)(w|x)$/i);
      if (match) candidates.push({ url: match[1], size: Number(match[2]) * (match[3].toLowerCase() === "x" ? 1000 : 1) });
    }
    for (const key of ["data-zoom-image", "data-original", "data-origin", "data-large", "data-src", "src"]) {
      const value = image.getAttribute(key);
      if (value) candidates.push({ url: value, size: key === "data-zoom-image" || key === "data-original" ? 2000 : 0 });
    }
    if (image.currentSrc) candidates.push({ url: image.currentSrc, size: image.naturalWidth || 0 });
    return candidates.sort((a, b) => b.size - a.size).map((entry) => highResolutionUrl(entry.url)).filter(Boolean);
  }

  function isVisible(element) {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
  }

  function readStock(products) {
    const actionButtons = [...document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"],[data-testid*="buy" i],[data-testid*="cart" i],[class*="buy-button" i],[class*="cart-button" i]')]
      .filter((element) => isVisible(element) && !element.disabled && element.getAttribute("aria-disabled") !== "true")
      .map((element) => clean(`${element.innerText || element.value || ""} ${element.getAttribute("aria-label") || ""}`).toLowerCase());
    if (actionButtons.some((text) => /in den warenkorb|jetzt kaufen/.test(text))) return true;

    const availability = products.flatMap(offerList).map((offer) => String(offer?.availability || "").toLowerCase());
    if (availability.some((value) => /instock|limitedavailability|onlineonly/.test(value))) return true;
    if (availability.some((value) => /outofstock|soldout|discontinued|preorder/.test(value))) return false;

    const bodyText = clean(document.body?.innerText || "");
    if (/ausverkauft|nicht verfügbar|nicht lieferbar|derzeit nicht verfügbar/i.test(bodyText)) return false;
    if (/lieferbar|auf lager|sofort verfügbar/i.test(bodyText)) return true;
    return null;
  }

  function extract(requireImages = true) {
    const structuredProducts = readStructuredProducts();
    const product = structuredProducts[0] || {};
    const meta = (key) => document.querySelector(`meta[property="${key}"],meta[name="${key}"]`)?.content || "";
    const title = clean(product.name || meta("og:title") || document.querySelector("h1")?.textContent || document.title)
      .replace(/\s*[|–-]\s*Joybuy(?:\.de)?\s*$/i, "");
    const offers = offerList(product);
    const currency = String(offers[0]?.priceCurrency || meta("product:price:currency") || "EUR").toUpperCase();
    const priceSources = [
      offers.find((offer) => offer.price)?.price,
      meta("product:price:amount"),
      meta("og:price:amount"),
      document.querySelector('[itemprop="price"]')?.getAttribute("content"),
    ].filter(Boolean);
    if (currency === "EUR") {
      const structuredPrice = priceSources.map(parsePrice).find((price) => price > 0);
      if (structuredPrice) priceSources.unshift(structuredPrice);
    }
    if (!priceSources.some((value) => typeof value === "number")) {
      const candidates = [...document.querySelectorAll('[class*="price" i],[data-testid*="price" i],[itemprop="price"]')]
        .filter(isVisible)
        .map((element) => clean(element.getAttribute("content") || element.innerText || element.textContent))
        .filter((text) => /€|EUR/.test(text) && /\d/.test(text))
        .sort((a, b) => a.length - b.length);
      priceSources.push(...candidates);
    }
    const priceEur = currency === "EUR" ? priceSources.map(parsePrice).find((price) => price > 0) || 0 : 0;
    const supplierProductId = location.pathname.match(/\/(?:dp\/[^/]+\/|dg\/|landingPage\/dp\/)(\d{6,20})(?:\/|$)/i)?.[1];
    const galleryImages = [...document.querySelectorAll("[class*='mainImageFloor_imgShowThumbnail'] img")]
      .map((image) => productImageUrl(image.currentSrc || image.getAttribute("src") || ""))
      .map((url) => url.replace(/\/s\d+x\d+_(?=jfsintlpro-)/i, "/s1248x1248_"))
      .filter(Boolean);
    const images = [...new Set(galleryImages)].slice(0, 12);
    const inStock = readStock(structuredProducts);
    const pageText = clean(document.body?.innerText || "");
    if (/risk control|security verification|captcha|sicherheitsüberprüfung|verifizieren sie, dass sie ein mensch/i.test(pageText)) {
      const error = new Error("Joybuy-Verifizierung auf der geöffneten Seite erkannt.");
      error.verificationPending = true;
      throw error;
    }
    if (!supplierProductId) throw new Error("Keine Joybuy Produkt-ID in der URL gefunden.");
    if (inStock === null) throw new Error("Bestand konnte auf der geöffneten Seite nicht sicher erkannt werden.");
    if (requireImages && !images.length) throw new Error("Joybuy-Produktgalerie konnte nicht sicher gelesen werden. Bitte die Produktseite neu laden.");

    const bulletPoints = [...document.querySelectorAll("li")].map((element) => clean(element.textContent)).filter((text) => text.length > 20).slice(0, 15);
    const specifications = {};
    for (const row of document.querySelectorAll("tr,[role='row'],[class*='specification' i] li,[class*='parameter' i] li")) {
      const cells = [...row.querySelectorAll("th,td,[role='rowheader'],[role='columnheader'],[role='cell']")]
        .map((cell) => clean(cell.textContent)).filter(Boolean);
      if (cells.length >= 2) specifications[cells[0]] = cells.slice(1).join(" ");
    }
    return {
      supplier: "joybuy_de", supplierProductId, sourceUrl: location.href.split("?")[0], rawTitle: title,
      priceEur, inStock, images, bulletPoints, specifications,
      rawDescription: clean(product.description || document.querySelector('meta[name="description"]')?.content || ""),
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type === "EXTRACT_JOYBUY_SYNC") {
      try {
        const product = extract(false);
        respond({ ok: true, snapshot: { supplierProductId: product.supplierProductId, sourceUrl: product.sourceUrl, priceEur: product.priceEur, inStock: product.inStock } });
      } catch (error) {
        respond({ ok: false, verificationPending: true, blocked: Boolean(error.verificationPending), error: error.message || "Joybuy-Daten konnten nicht sicher gelesen werden." });
      }
      return false;
    }
    if (message?.type !== "EXTRACT_JOYBUY_PRODUCT") return false;
    try { respond({ ok: true, product: extract() }); }
    catch (error) { respond({ ok: false, error: error.message || "Joybuy Produktdaten konnten nicht gelesen werden." }); }
    return false;
  });
})();
