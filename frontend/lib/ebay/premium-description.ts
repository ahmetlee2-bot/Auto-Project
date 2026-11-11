import { buildGpsrComplianceInfo } from "../compliance/gpsrEngine";

export type DescriptionProduct = {
  title: string;
  asin?: string;
  description?: string;
  features?: string[];
  brand?: string | null;
  itemSpecifics?: Record<string, string[]>;
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
}

function clean(value: string): string {
  return value.replace(/\bASIN\b\s*[:|#-]?\s*[A-Z0-9-]{8,}/gi, " ")
    .replace(/\bAmazon\b/gi, " ").replace(/[®™©]/g, "").replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ").trim();
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.map(clean).filter((value) => {
    const key = value.toLocaleLowerCase("de-DE");
    if (value.length < 4 || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 4);
}

export function premiumDescription(product: DescriptionProduct): string {
  const title = clean(product.title);
  const sourceFeatures = unique([...(product.features || []), ...(product.description || "").split(/\n|[•●▪]/)]);
  const combined = `${title} ${sourceFeatures.join(" ")}`;
  const quantity = combined.match(/\b(\d{1,3})\s*(?:Stück|Stk\.?|x)\b/i)?.[1];
  const model = combined.match(/\b\d{3,5}\s?(?:ZZ|2RS|RS|2Z|Z)\b/i)?.[0]?.replace(/\s/g, "").toUpperCase();
  const dimensions = combined.match(/\b\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?\s*mm\b/i)?.[0]?.replace(/\s+/g, " ");
  const material = combined.match(/\b(?:Edelstahl|Stahl|Metall|Kunststoff|Aluminium|Holz|Keramik)\b/i)?.[0];
  const productType = /rillenkugellager/i.test(combined) ? "Rillenkugellager" : /kugellager/i.test(combined) ? "Kugellager" : /silikagel|kieselgel/i.test(combined) ? "Silikagel / Kieselgel" : "";
  const usage = ["Skateboard", "Inline-Skates", "Roller", "Modellbau", "3D-Drucker"].filter((word) => combined.toLowerCase().includes(word.toLowerCase()));
  const shielded = /doppelt\s+geschirmt|double\s+shielded|608\s?zz/i.test(combined);
  const specs: Array<[string, string]> = productType ? [["Produktart", productType]] : [];
  if (model) specs.push(["Modell / Typ", `${model}${shielded ? " (doppelt geschirmt)" : ""}`]);
  if (dimensions) specs.push(["Abmessungen / Größe", dimensions]);
  if (material) specs.push(["Material / Ausführung", material]);
  if (quantity) specs.push(["Lieferumfang / Menge", `${quantity} Stück`]);
  for (const [key, values] of Object.entries(product.itemSpecifics || {})) {
    if (/asin|amazon/i.test(key)) continue;
    const value = unique(values || []).join(", ");
    if (value && !specs.some(([label]) => label.toLowerCase() === clean(key).toLowerCase())) specs.push([clean(key), value]);
  }

  const featureCards = [
    ...(sourceFeatures[0] ? [["⚙️", "Produktmerkmale", sourceFeatures[0]]] : []),
    ...(dimensions ? [["📐", "Maßangaben", `Abmessungen: ${dimensions}.`]] : []),
    ...(usage.length ? [["🎯", "Anwendung", `Genannte Anwendungsbereiche: ${usage.join(", ")}.`]] : []),
    ...(quantity ? [["📦", `${quantity}-teiliges Set`, `Enthalten sind ${quantity} Stück.`]] : []),
  ];
  const bullets = unique([...sourceFeatures, ...(model ? [`Modell ${model}${shielded ? ": doppelt geschirmte Ausführung" : ""}.`] : []), ...(dimensions ? [`Maße ${dimensions}; bitte vor dem Kauf mit dem vorhandenen Bauteil vergleichen.`] : []), ...(quantity ? [`Set mit ${quantity} Stück für den beschriebenen Austausch oder Vorrat.`] : [])]).slice(0, 4);
  const safe = (value: string) => escapeHtml(clean(value));
  const rows = specs.map(([key, value], index) => `<tr style="background:${index % 2 ? "#ffffff" : "#f8fafc"}"><th style="text-align:left;padding:10px;border-bottom:1px solid #e2e8f0">${safe(key)}</th><td style="padding:10px;border-bottom:1px solid #e2e8f0">${safe(value)}</td></tr>`).join("");
  const cards = featureCards.map(([emoji, heading, detail]) => `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px"><div style="font-size:22px">${emoji}</div><h3 style="color:#1d4ed8;margin:8px 0">${safe(heading)}</h3><p style="margin:0;color:#475569;line-height:1.55">${safe(detail)}</p></div>`).join("");
  const paragraphs = bullets.map((line) => `<p style="line-height:1.65">🔹 ${safe(line)}</p>`).join("");
  const subtitle = [model, dimensions, usage.length ? `Geeignet laut Produktangaben für ${usage.join(", ")}` : ""].filter(Boolean).join(" · ");
  const tip = dimensions ? `Vergleichen Sie vor der Montage die vorhandenen Bauteilmaße mit ${dimensions}.` : "";
  const gpsr = buildGpsrComplianceInfo({ title, brand: product.brand, itemSpecifics: product.itemSpecifics });
  const gpsrWarnings = gpsr.safetyWarningsDe.map((line) => `<li style="margin:0 0 4px;line-height:1.5">${safe(line)}</li>`).join("");
  const gpsrBlock = `<section style="margin-top:20px;padding:14px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;font-size:13px;color:#334155"><h2 style="margin:0 0 8px;font-size:15px;color:#0f172a">🛡️ Produktsicherheit &amp; Herstellerhinweise (${safe(gpsr.regulationCode)})</h2><p style="margin:0 0 6px"><strong>Hersteller / Marke:</strong> ${safe(gpsr.manufacturerName)} · <strong>EU-Konformität:</strong> ${safe(gpsr.responsiblePersonEu)}</p><ul style="margin:0 0 6px;padding-left:18px">${gpsrWarnings}</ul><p style="margin:0;font-size:12px;color:#64748b">${safe(gpsr.weeeNote)} ${safe(gpsr.packagingNote)}</p></section>`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:900px;margin:auto;padding:20px;color:#1f2937;background:#fff"><header style="padding:24px;text-align:center;background:linear-gradient(135deg,#2563eb,#1e3a8a);color:#fff">${product.brand ? `<span style="font-size:13px;font-weight:700;letter-spacing:1px">${safe(product.brand)}</span>` : ""}<h1>${safe(title)}</h1>${subtitle ? `<p>${safe(subtitle)}</p>` : ""}</header>${cards ? `<section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:20px 0">${cards}</section>` : ""}${paragraphs ? `<section><h2>Produktmerkmale</h2>${paragraphs}</section>` : ""}${rows ? `<section><h2>Produktdaten &amp; Spezifikationen</h2><table style="width:100%;border-collapse:collapse"><tbody>${rows}</tbody></table></section>` : ""}${tip ? `<aside style="margin-top:20px;padding:14px;background:#eff6ff;border-left:4px solid #2563eb"><strong>💡 Tipp:</strong> ${safe(tip)}</aside>` : ""}${gpsrBlock}</div>`;
  return html.replace(/\bASIN\b|\bAmazon\b/gi, "");
}
