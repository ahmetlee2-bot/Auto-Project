(() => {
  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isCodeLike(value) {
    return /(?:<\/?(?:script|style|template)|\b(?:window|document|function)\b\s*[.(=]|\b(?:const|let|var)\s+\w+\s*=|application\/ld\+json|\{\s*"(?:@context|props|state)|=>|;\s*(?:var|let|const))/i.test(value);
  }

  function cleanDescription(value, maxLength = 12000) {
    const withoutEmbeddedCode = String(value || "")
      .replace(/<(script|style|template|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ");
    const fragments = withoutEmbeddedCode.split(/\r?\n+/)
      .map(cleanText)
      .filter((fragment) => fragment.length > 1 && !isCodeLike(fragment));
    const joined = [...new Set(fragments)].join("\n\n").trim();
    if (joined.length <= maxLength) return joined;
    const candidate = joined.slice(0, maxLength);
    const boundary = Math.max(candidate.lastIndexOf(". "), candidate.lastIndexOf("! "), candidate.lastIndexOf("? "));
    return (boundary >= maxLength * 0.6 ? candidate.slice(0, boundary + 1) : candidate).trim();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function buildEbayDescription({ title, description, highlights = [], specifics = {}, legalNotice = "" }) {
    const safeTitle = escapeHtml(cleanText(title));
    const safeDescription = escapeHtml(cleanDescription(description, 2_400)).replace(/\n{2,}/g, "<br><br>");
    const safeHighlights = [...new Set(highlights.map(cleanText).filter((item) => item.length > 4))]
      .slice(0, 4)
      .map((item) => `<li style="margin:0 0 8px;">${escapeHtml(item.slice(0, 150))}</li>`)
      .join("");
    const safeSpecifics = Object.entries(specifics)
      .slice(0, 5)
      .map(([key, values]) => `<li><strong>${escapeHtml(key)}:</strong> ${escapeHtml(String(Array.isArray(values) ? values.join(", ") : values).slice(0, 80))}</li>`)
      .join("");
    const safeLegalNotice = escapeHtml(cleanText(legalNotice));

    return `<!doctype html><html><body style="margin:0;background:#f5f6f7;color:#17212b;font-family:Arial,sans-serif;line-height:1.5;">
<main style="max-width:760px;margin:0 auto;background:#fff;">
  <section style="background:#123047;color:#fff;padding:24px 28px;text-align:center;">
    <div style="font-size:20px;font-weight:700;">⚡ Blitzversand aus Deutschland | 💯 Top Kundenservice</div>
    <div style="margin-top:12px;font-size:13px;">✓ Schnelle Bearbeitung &nbsp; ✓ Sicher verpackt &nbsp; ✓ Zuverlässiger Service</div>
  </section>
  <section style="padding:28px;">
    <h1 style="margin:0 0 16px;font-size:24px;color:#123047;">${safeTitle}</h1>
    <p style="margin:0 0 18px;">${safeDescription || "Entdecken Sie dieses sorgfältig ausgewählte Produkt mit praktischen Eigenschaften für den Alltag."}</p>
    ${safeHighlights ? `<div style="background:#f0f7f4;border-left:4px solid #2b7a54;padding:16px 18px;margin:20px 0;"><h2 style="margin:0 0 10px;font-size:18px;color:#1c5e3e;">Ihre Vorteile</h2><ul style="margin:0;padding-left:20px;">${safeHighlights}</ul></div>` : ""}
    ${safeSpecifics ? `<div style="border:1px solid #d8dde1;padding:16px 18px;margin:20px 0;"><h2 style="margin:0 0 10px;font-size:18px;">Produktdetails</h2><ul style="margin:0;padding-left:20px;">${safeSpecifics}</ul></div>` : ""}
  </section>
  <section style="background:#f5f6f7;border-top:1px solid #d8dde1;padding:22px 28px;font-size:14px;">
    <h2 style="margin:0 0 10px;font-size:17px;color:#123047;">Versand &amp; Zustand</h2>
    <p style="margin:0 0 8px;">Der Versand erfolgt schnell und sorgfältig verpackt aus Deutschland.</p>
    <p style="margin:0;">Artikelzustand: neu. Bitte beachten Sie sämtliche Herstellerhinweise und Produktinformationen.</p>
    ${safeLegalNotice ? `<p style="margin:14px 0 0;font-size:11px;line-height:1.45;color:#53616c;">${safeLegalNotice}</p>` : ""}
  </section>
</main></body></html>`;
  }

  function hasStandardTemplate(html) {
    const value = String(html || "");
    return /Blitzversand aus Deutschland/.test(value)
      && /Top Kundenservice/.test(value)
      && /Versand &amp; Zustand/.test(value);
  }

  globalThis.AlltaghausDescription = { cleanDescription, isCodeLike, escapeHtml, buildEbayDescription, hasStandardTemplate };
})();
