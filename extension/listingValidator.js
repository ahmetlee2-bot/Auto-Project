(() => {
  function validateListing(product) {
    const blockers = [];
    const warnings = [];
    const title = String(product.ebayTitle || product.title || "").trim();
    const price = Number(product.salePrice);
    const quantity = Number(product.quantity);
    const imageCount = Array.isArray(product.images) ? product.images.length : 0;
    const specificsCount = Object.keys(product.itemSpecifics || {}).length;
    const description = String(product.ebayDescription || product.descriptionHtml || product.description || "").trim();

    if (!title || title.length > 80) blockers.push("Başlık boş veya 80 karakterden uzun.");
    if (!Number.isFinite(price) || price <= 0) blockers.push("Geçerli bir satış fiyatı girilmeli.");
    if (!Number.isInteger(quantity) || quantity < 0) blockers.push("Stok miktarı geçersiz.");
    if (!imageCount) blockers.push("En az bir kullanım hakkı doğrulanmış ürün görseli gerekli.");
    if (imageCount && product.imageRightsConfirmed !== true) blockers.push("Görsellerin kullanım hakkı doğrulanmalı.");
    if (product.imageExtractionComplete === false) blockers.push("Görsel galerisi eksik çıkarıldı; ilan oluşturulamaz.");
    if (product.lowStock && quantity > 0) blockers.push("Düşük stok kalkanı aktifken miktar 0 olmalı.");
    const hasCurrentTemplate = globalThis.AlltaghausListingBuilder?.hasStandardListingDescription?.(description);
    const hasLegacyTemplate = globalThis.AlltaghausDescription?.hasStandardTemplate?.(description);
    if (!hasCurrentTemplate && !hasLegacyTemplate) blockers.push("Standart HTML açıklama şablonu zorunludur.");
    if (product.productType === "SUPPLEMENT" && !/Hinweis: Nahrungsergänzungsmittel dienen nicht als Ersatz/.test(description)) blockers.push("Nahrungsergänzung ürünlerinde LMIV uyarısı zorunludur.");
    if (title.length < 20) warnings.push("Başlık kısa; ürün tipi ve temel özelliği ekleyin.");
    if (description.length < 60) warnings.push("Açıklama kısa; ürün bilgilerini gözden geçirin.");
    if (specificsCount < 2) warnings.push("Item Specifics sayısı az; renk, ölçü veya malzeme ekleyin.");
    if (!product.ean) warnings.push("Geçerli bir EAN bulunamadı; yalnızca doğru ürün kimliği kullanın.");

    return { ready: blockers.length === 0, blockers, warnings };
  }

  globalThis.AlltaghausListing = { validateListing };
})();
