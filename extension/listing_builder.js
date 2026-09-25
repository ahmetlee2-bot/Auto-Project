(() => {
  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function cleanDescription(value) {
    return String(value || "")
      .replace(/<(script|style|template|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1_600);
  }

  function buildListingDescription({ description, legalNotice = "" } = {}) {
    try {
      const productDescription = escapeHtml(cleanDescription(description))
        .replace(/\n{2,}/g, "<br><br>");
      const notice = escapeHtml(String(legalNotice || "").trim());
      const html = `<div style="font-family:Arial,sans-serif;max-width:900px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;box-shadow:0 2px 5px rgba(0,0,0,.05);">
  <div style="background-color:#0053a0;color:#fff;padding:16px 20px;text-align:center;font-size:20px;font-weight:bold;letter-spacing:.5px;">Blitzversand aus Deutschland | Top Qualitat &amp; Service</div>
  <div style="padding:25px;background-color:#fff;">
    <h2 style="color:#333;font-size:18px;border-bottom:2px solid #0053a0;padding-bottom:8px;margin-top:0;">Produktbeschreibung</h2>
    <div style="color:#444;line-height:1.7;font-size:15px;">${productDescription || "Bitte beachten Sie die Produktdetails und Herstellerangaben."}</div>
    <div style="background-color:#f8f9fa;border-left:4px solid #0053a0;padding:18px;margin-top:25px;border-radius:0 4px 4px 0;">
      <h3 style="margin-top:0;color:#0053a0;font-size:16px;">Ihre Vorteile bei uns:</h3>
      <ul style="color:#555;line-height:1.8;margin-bottom:0;padding-left:20px;">
        <li><strong>Schneller Versand:</strong> Bearbeitung und Versand gemaess Angebotsangabe.</li>
        <li><strong>Artikelzustand:</strong> Neuware gemaess Artikelbeschreibung.</li>
        <li><strong>Zuverlassiger Service:</strong> Kundensupport bei Fragen zum Angebot.</li>
      </ul>
    </div>
    ${notice ? `<p style="margin:20px 0 0;color:#666;font-size:11px;line-height:1.45;">${notice}</p>` : ""}
  </div>
</div>`;
      if (!hasStandardListingDescription(html)) throw new Error("Standard HTML markers are missing.");
      return html;
    } catch (error) {
      console.error("LISTING BUILDER ERROR:", { stage: "HTML_DESCRIPTION", descriptionLength: String(description || "").length, legalNoticeLength: String(legalNotice || "").length, message: error.message });
      throw error;
    }
  }

  function hasStandardListingDescription(value) {
    const html = String(value || "");
    return /Blitzversand aus Deutschland/i.test(html)
      && /Produktbeschreibung/i.test(html)
      && /Ihre Vorteile bei uns/i.test(html);
  }

  function cleanGallery(assets) {
    try {
      if (!assets?.length || assets[0].overlayApplied !== true) throw new Error("Ana gorsel rozetlenmeden gonderilemez.");
      const seen = new Set();
      return assets.filter((asset, index) => {
      if (!/^data:image\/jpeg;base64,.+/.test(asset.dataUrl || "") || !asset.pixelHash || asset.pipelineVersion !== 4 || asset.width < 500 || asset.height < 500) throw new Error("Gecersiz islenmis galeri.");
      if (index > 0 && asset.overlayApplied) throw new Error("Rozet yalnizca ana gorselde olabilir.");
      if (seen.has(asset.pixelHash)) return false;
      seen.add(asset.pixelHash);
      return true;
      });
    } catch (error) {
      console.error("LISTING BUILDER ERROR:", { stage: "PICTURE_ARRAY", imageCount: assets?.length || 0, dimensions: (assets || []).map(({ width, height }) => `${width || 0}x${height || 0}`), message: error.message });
      throw error;
    }
  }
  globalThis.AlltaghausListingBuilder = { buildListingDescription, hasStandardListingDescription, cleanGallery };
})();
