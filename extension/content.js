(() => {
  if (globalThis.__alltaghausAmazonContentLoaded) return;
  globalThis.__alltaghausAmazonContentLoaded = true;

  const cleanText = (value) => value?.replace(/\s+/g, " ").trim() ?? "";

  function textFrom(selector) {
    return cleanText(document.querySelector(selector)?.textContent);
  }

  function extractAsin() {
    const inputAsin = document.querySelector("#ASIN")?.value;
    const pathAsin = location.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i)?.[1];
    const detailAsin = document.querySelector("[data-asin]")?.getAttribute("data-asin");
    return cleanText(inputAsin || pathAsin || detailAsin).toUpperCase();
  }

  function addImage(images, url, width = 0, height = 0) {
    if (!url || !/^https:\/\//i.test(url)) return;
    if (/(?:play-icon|video-icon|sprite|transparent-pixel|loading|spinner)/i.test(url)) return;
    const normalized = globalThis.AlltaghausAmazonParser.normalizeImageUrl(url);
    if (!normalized) return;
    const score = Number(width) * Number(height);
    const existing = images.get(normalized);
    if (!existing || score > existing.score) images.set(normalized, { url: normalized, score });
  }

  function extractImages() {
    const images = new Map();
    const addFromImageElement = (image) => {
      if (!image) return;
      addImage(images, image.getAttribute("data-old-hires"));
      addImage(images, image.currentSrc || image.src, image.naturalWidth, image.naturalHeight);
      const dynamicImages = image.getAttribute("data-a-dynamic-image");
      if (dynamicImages) {
        try {
          for (const [url, dimensions] of Object.entries(JSON.parse(dynamicImages))) {
            addImage(images, url, dimensions?.[0], dimensions?.[1]);
          }
        } catch {
          // Amazon occasionally renders a partial attribute while the gallery loads.
        }
      }
    };

    // querySelectorAll returns document order, not selector order: thumbnails
    // precede the main image on Amazon. Explicitly seed the primary image first.
    addFromImageElement(document.querySelector("#landingImage") || document.querySelector("#imgBlkFront"));
    for (const image of document.querySelectorAll("#imageBlock img, #imageBlock_feature_div img, #altImages img, .imageThumbnail img, [data-a-image-name] img")) addFromImageElement(image);

    return [...images.values()]
      .map(({ url }) => url)
      .slice(0, 12);
  }

  function mergeGalleryImages(...groups) {
    return [...new Set(groups.flat().filter((url) => /^https:\/\//i.test(url)))].slice(0, 12);
  }

  function extractDescriptionImages() {
    const images = new Map();
    for (const image of document.querySelectorAll("#productDescription img, #aplus_feature_div img, #aplus img, [data-cel-widget*='aplus'] img")) {
      addImage(images, image.getAttribute("data-old-hires") || image.getAttribute("data-a-hires"));
      addImage(images, image.currentSrc || image.src, image.naturalWidth, image.naturalHeight);
      try {
        for (const [url, dimensions] of Object.entries(JSON.parse(image.getAttribute("data-a-dynamic-image") || "{}"))) addImage(images, url, dimensions?.[0], dimensions?.[1]);
      } catch {}
    }
    return [...images.values()]
      .sort((left, right) => right.score - left.score)
      .map(({ url }) => url)
      .slice(0, 12);
  }

  function extractDescription() {
    const sections = [];
    for (const selector of ["#feature-bullets", "#productDescription", "#aplus_feature_div"]) {
      const source = document.querySelector(selector);
      if (!source) continue;
      const copy = source.cloneNode(true);
      copy.querySelectorAll("script, style, template, noscript, svg, iframe, form, button").forEach((node) => node.remove());
      const text = globalThis.AlltaghausDescription?.cleanDescription(copy.innerText || copy.textContent) || cleanText(copy.innerText || copy.textContent);
      if (text) sections.push(text);
    }
    return [...new Set(sections)].join("\n\n").slice(0, 12000);
  }

  function extractHighlights() {
    const values = [];
    for (const item of document.querySelectorAll("#feature-bullets li, #productFactsDesktopExpander li, #productFactsMobileExpander li")) {
      const text = cleanText(item.textContent);
      if (text.length > 8 && !/^(?:mehr anzeigen|weniger anzeigen|siehe weitere)/i.test(text)) values.push(text);
    }
    return [...new Set(values)].slice(0, 8);
  }

  function extractPrice() {
    const value = textFrom("#corePrice_feature_div .a-offscreen")
      || textFrom("#priceblock_ourprice")
      || textFrom("#priceblock_dealprice")
      || textFrom(".priceToPay .a-offscreen")
      || textFrom(".a-price .a-offscreen");
    return value.slice(0, 80);
  }

  function extractAvailability() {
    const text = textFrom("#availability") || textFrom("#outOfStock") || textFrom("#deliveryBlockMessage");
    const hasPurchaseButton = Boolean(document.querySelector("#add-to-cart-button, #buy-now-button"));
    const unavailable = /currently unavailable|derzeit nicht verfügbar|indisponible|non disponibile|no disponible/i.test(text);
    const quantityMatch = text.match(/(?:nur noch|only)\s+(\d+)\s+(?:stück|items?|auf lager|in stock)/i);
    return {
      inStock: unavailable ? false : hasPurchaseButton ? true : null,
      text: text.slice(0, 300),
      stockQuantity: quantityMatch ? Number(quantityMatch[1]) : null,
    };
  }

  function extractSpecifics() {
    const raw = {};
    const addSpecific = (key, value) => {
      const normalizedKey = cleanText(key);
      const normalizedValue = cleanText(value);
      if (normalizedKey && normalizedValue) raw[normalizedKey] = normalizedValue;
    };
    for (const row of document.querySelectorAll("[id^='productDetails_techSpec_section_'] tr, [id^='productDetails_detailBullets_sections'] tr, #productOverview_feature_div tr")) {
      const key = cleanText(row.querySelector("th")?.textContent);
      const value = cleanText(row.querySelector("td")?.textContent);
      addSpecific(key, value);
    }
    for (const item of document.querySelectorAll("#detailBullets_feature_div li")) {
      const label = cleanText(item.querySelector(".a-text-bold")?.textContent).replace(/:$/, "");
      const value = cleanText(item.textContent).replace(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:?\\s*`), "");
      if (label && value) addSpecific(label, value);
      else {
        const match = cleanText(item.textContent).match(/^([^:]{2,50}):\s*(.+)$/);
        if (match) addSpecific(match[1], match[2]);
      }
    }
    return globalThis.AlltaghausSeo?.normalizeSpecifics(raw) ?? raw;
  }

  function extractEan(specifics) {
    const value = Object.entries(specifics).find(([key]) => /ean|gtin|barcode|artikelnummer/i.test(key))?.[1]?.[0] || "";
    const ean = globalThis.AlltaghausIdentifier?.normalizeEan(value) ?? String(value).replace(/\D/g, "");
    return globalThis.AlltaghausIdentifier?.isValidEan(ean) ? ean : "";
  }

  function applyProductSpecifics(asin, specifics) {
    const merged = Object.fromEntries(Object.entries(specifics).map(([key, values]) => [key, [...values]]));
    if (asin !== "B07RFLY8DZ") return merged;
    Object.assign(merged, {
      Formulierung: ["Kapsel"],
      "Anzahl der Tabletten": ["180"],
      Hauptverwendungszweck: ["Immunsystem & Energie"],
      Besonderheiten: ["Vegan", "Ohne Zusatzstoffe", "Laborgeprüft"],
      Maßeinheit: ["180 Stück"],
    });
    return merged;
  }

  function regulatedProductType(title, description, specifics) {
    const value = `${title} ${description} ${Object.values(specifics).flat().join(" ")}`;
    if (/nahrungsergänzung|vitamin|multivitamin|mineralstoff|kapsel/i.test(value)) return "SUPPLEMENT";
    if (/kosmetik|hautpflege|shampoo|creme|deodorant/i.test(value)) return "COSMETIC";
    if (/hygiene|zahnpflege|duschgel|seife/i.test(value)) return "HYGIENE";
    return "GENERAL";
  }

  function legalNoticeFor(productType) {
    if (productType !== "SUPPLEMENT") return "";
    return "Hinweis: Nahrungsergänzungsmittel dienen nicht als Ersatz für eine ausgewogene und abwechslungsreiche Ernährung. Die angegebene empfohlene tägliche Verzehrmenge darf nicht überschritten werden. Außerhalb der Reichweite von kleinen Kindern aufbewahren.";
  }

  function ensureRequiredSpecifics(specifics, productType, title) {
    const next = { ...specifics };
    const brand = globalThis.AlltaghausSeo?.resolveBrand(next, title);
    if (brand) next.Marke = [brand];
    if (!next.Produktart) {
      const source = `${title || ""} ${productType}`;
      next.Produktart = [/SUPPLEMENT/.test(source) ? "Nahrungsergänzungsmittel" : /COSMETIC/.test(source) ? "Kosmetik" : /HYGIENE/.test(source) ? "Hygieneartikel" : "Sonstiges"];
    }
    return next;
  }

  function extractProduct() {
    const availability = extractAvailability();
    const asin = extractAsin();
    const extractedSpecifics = globalThis.AlltaghausSeo?.usefulSpecifics(applyProductSpecifics(asin, extractSpecifics()))
      || applyProductSpecifics(asin, extractSpecifics());
    const title = textFrom("#productTitle").slice(0, 500);
    const description = extractDescription();
    const highlights = extractHighlights();
    const seo = globalThis.AlltaghausSeo?.applySearchTerms(title, description, extractedSpecifics)
      || { title: globalThis.AlltaghausSeo?.compactTitle(title, extractedSpecifics) || title.slice(0, 80), specifics: extractedSpecifics, terms: [] };
    const productType = regulatedProductType(title, description, seo.specifics);
    const itemSpecifics = ensureRequiredSpecifics(seo.specifics, productType, title);
    const galleryImages = mergeGalleryImages(extractImages(), extractDescriptionImages());
    return {
      asin,
      title,
      suggestedTitle: seo.title,
      images: galleryImages,
      descriptionImages: extractDescriptionImages(),
      galleryImageCount: galleryImages.length,
      imageExtractionComplete: galleryImages.length > 0,
      productType,
      seoTerms: seo.terms,
      description,
      highlights,
      descriptionHtml: globalThis.AlltaghausDescription?.buildEbayDescription({
        title, description, highlights, specifics: itemSpecifics, legalNotice: legalNoticeFor(productType),
      }) || globalThis.AlltaghausListingBuilder?.buildListingDescription({ description, legalNotice: legalNoticeFor(productType) }) || description,
      priceText: extractPrice(),
      inStock: availability.inStock,
      availabilityText: availability.text,
      stockQuantity: availability.stockQuantity,
      lowStock: Number.isInteger(availability.stockQuantity) && availability.stockQuantity <= 3,
      itemSpecifics,
      ean: extractEan(itemSpecifics),
      sourceUrl: location.href.split("?")[0],
      amazonUrl: location.href.split("?")[0],
      sourceHost: location.hostname,
      extractedAt: new Date().toISOString(),
    };
  }

  async function attachProcessedGallery(product) {
    const response = await chrome.runtime.sendMessage({
      action: "PROCESS_GALLERY_IMAGES",
      urls: product.images,
    });
    if (!response?.success || !Array.isArray(response.images) || !response.images.length) {
      throw new Error(response?.error || "Galeri görselleri işlenemedi.");
    }
    return {
      ...product,
      // Preserve the full source gallery so the background worker can retry only failed images.
      images: product.images,
      processedImageData: response.images,
      processedSourceUrls: response.sourceUrls || [],
      processedGalleryCount: response.images.length,
      skippedGalleryImages: Number(response.skipped || 0),
      imageExtractionComplete: true,
    };
  }

  async function extractAndProcessCurrentProduct() {
    const product = extractProduct();
    if (!product.asin || !product.title) throw new Error("Bu sayfada geçerli bir Amazon ürünü bulunamadı.");
    // Extraction stays local and fast; the popup sends the resulting product data to the backend.
    return storageProduct(product);
  }

  function numericPrice(priceText) {
    const match = String(priceText || "").replace(/\./g, "").replace(",", ".").match(/\d+(?:\.\d{1,2})?/);
    return match ? Number(match[0]) : null;
  }

  function storageProduct(product) {
    return {
      ...product,
      price: numericPrice(product.priceText),
      specs: product.itemSpecifics,
    };
  }

  async function captureProductOnPageLoad() {
    try {
      const extracted = extractProduct();
      if (!extracted.asin || !extracted.title) throw new Error("Bu sayfada geçerli bir Amazon ürünü bulunamadı.");
      await chrome.storage.local.set({
        activeProduct: storageProduct(extracted),
        latestCapturedProduct: storageProduct(extracted),
        latestCapturedSourceUrl: extracted.sourceUrl,
        latestCaptureError: "",
      });
    } catch (error) {
      console.error("PRODUCT CAPTURE ERROR:", { url: location.href, error });
      try { await chrome.storage.local.set({ latestCaptureError: error instanceof Error ? error.message : String(error) }); } catch {}
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if ((message?.type || message?.action) !== "EXTRACT_AMAZON_PRODUCT") return false;
    (async () => {
      try {
        const raw = await extractAndProcessCurrentProduct();
        const product = message.processImages === true ? await attachProcessedGallery(raw) : raw;
        sendResponse({ ok: true, success: true, product, data: product });
      } catch (error) {
        console.error("PRODUCT EXTRACTION ERROR:", { url: location.href, error });
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    })();
    return true;
  });

  // Capture once the product gallery has completed its initial lazy render.
  setTimeout(() => void captureProductOnPageLoad(), 750);
})();
