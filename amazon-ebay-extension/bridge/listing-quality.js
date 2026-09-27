'use strict';
function text(value) {
  return String(value || '').replace(/<(script|style|iframe|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}
const escape = value => text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function cleanImageUrl(value) {
  try {
    const url = new URL(String(value).replace(/&amp;/g, '&').replace(/\\u0026/g, '&').replace(/\\\//g, '/'));
    if (url.protocol !== 'https:' || !/(^|\.)(media-amazon\.com|ssl-images-amazon\.com)$/i.test(url.hostname)) return '';
    const match = url.pathname.match(/^\/images\/I\/([^/]+?)(?:\._[^/]*_)?\.(jpg|jpeg|png|webp)$/i);
    return match ? `https://m.media-amazon.com/images/I/${match[1]}.${match[2].toLowerCase()}` : '';
  } catch { return ''; }
}
// Only explicitly marked product gallery containers. Never scan page-wide image JSON.
function galleryImages(html) {
  const stack = []; const found = new Set();
  const tags = /<!--[^]*?-->|<(script|style)\b[^>]*>[^]*?<\/\1\s*>|<\/?([a-z][\w:-]*)\b[^>]*>/gi;
  for (const match of html.matchAll(tags)) {
    const tag = match[0]; const name = (match[2] || '').toLowerCase();
    if (!name) continue;
    if (tag.startsWith('</')) { const index = stack.map(x => x.name).lastIndexOf(name); if (index >= 0) stack.length = index; continue; }
    const attrs = Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m => [m[1].toLowerCase(), m[2] ?? m[3]]));
    const inside = stack.some(x => x.gallery) || /^(imageBlock|imageBlock_feature_div|altImages)$/.test(attrs.id || '');
    if (inside && name === 'img') {
      const candidates = [attrs['data-old-hires'], attrs['data-a-hires'], attrs.src];
      try { candidates.push(...Object.keys(JSON.parse((attrs['data-a-dynamic-image'] || '{}').replace(/&quot;/g, '"').replace(/&amp;/g, '&')))); } catch {}
      for (const candidate of candidates) { const url = cleanImageUrl(candidate); if (url) found.add(url); }
    }
    if (!/^(img|input|br|hr|meta|link|source|area|embed|wbr)$/.test(name) && !tag.endsWith('/>')) stack.push({ name, gallery: inside });
  }
  return [...found];
}
function title(product) {
  const source = text(product.title).replace(/\b(neues modell|neue modell|hot deal|sıcak fırsat|yeni model|sonderangebot|premium|hochwertig)\b/giu, '').replace(/[®™]/g, '');
  const german = source.replace(/adhesive stick/gi, 'Klebestift').replace(/(?:for )?3d printing/gi, 'für 3D-Druck').replace(/\badhesive\b/gi, 'Haftmittel');
  const candidates = [product.brand, german, ...(product.highlights || []).slice(0, 3)];
  const seen = new Set(); const words = [];
  for (const candidate of candidates) for (const word of text(candidate).split(/\s+/)) {
    const key = word.toLocaleLowerCase('de-DE').replace(/[^\p{L}\p{N}]/gu, '');
    if (!key || seen.has(key)) continue;
    if ([...words, word].join(' ').length > 80) continue;
    seen.add(key); words.push(word);
  }
  return words.join(' ');
}
function description(product) {
  const highlights = [...new Set((product.highlights || []).map(text).filter(Boolean))].slice(0, 8);
  return `<div style="max-width:900px;margin:auto;padding:16px;font-family:Arial,sans-serif;line-height:1.6;overflow-wrap:anywhere;color:#222"><h2>${escape(product.title)}</h2>${highlights.length ? `<h3>Produktmerkmale</h3><ul>${highlights.map(x => `<li>${escape(x)}</li>`).join('')}</ul>` : ''}<h3>Produktbeschreibung</h3><p>${escape(product.description || product.title)}</p><div style="border:1px solid #ddd;padding:12px"><h3>Versand &amp; Rückgabe</h3><p>Lieferzeit, Versandkosten und Rückgabebedingungen entnehmen Sie bitte den Angaben in diesem eBay-Angebot.</p></div></div>`;
}
module.exports = { cleanImageUrl, galleryImages, title, description, text };
