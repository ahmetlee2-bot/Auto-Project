import "server-only";
import { cleanEbayTitle } from "../ebay/seo-title";

export type ProductFacts = { raw_title: string; features: string[]; specifications: Record<string, string[]>; description: string };
export type ProductCopy = {
  seo_title: string;
  seo_title_alternatives: string[];
  top_badge: string;
  headline: string;
  subtitle: string;
  introduction: string;
  highlight_cards: Array<{ emoji: string; title: string; desc: string }>;
  bullet_points: Array<{ label: string; text: string }>;
  specs_table: Array<{ key: string; value: string }>;
  delivery_contents: string;
  service_note: string;
  legal_notices: string[];
  item_specifics: Array<{ key: string; value: string }>;
  expert_tip: string;
};

export const PRODUCT_COPY_PROMPT = `Du bist ein professioneller E-Commerce-Texter und SEO-Spezialist für eBay Deutschland. Erstelle aus den gelieferten Produktdaten ein vollständiges, verkaufsorientiertes Listing auf Deutsch. Antworte ausschließlich mit einem gültigen JSON-Objekt nach dem untenstehenden Schema.

GRUNDSÄTZE ZU FAKTEN UND MARKEN:
- Verwende nur Angaben, die durch raw_title, features, specifications oder description belegt sind. Erfinde keine Eigenschaften, Mengen, Materialien, Lieferumfänge, Kompatibilitäten, Prüfsiegel, Zertifizierungen, Garantien, Versandfristen oder rechtlichen Aussagen.
- Formuliere ansprechend und nutzenorientiert, ohne unbelegte Superlative, Heilversprechen oder garantierte Ergebnisse.
- Nenne Marken ausschließlich sachlich und korrekt, wenn sie aus den Quelldaten hervorgehen. Verschleiere oder verfälsche Marken nicht, um Plattformregeln zu umgehen. Behaupte keine Markenautorisierung oder Kompatibilität ohne Beleg. Entferne ®, ™ und ©.
- Nutze klares, natürliches Deutsch. Entferne Füllwörter, Dopplungen, Händler- und Marketplace-Namen sowie irrelevante Werbesprüche.

REGELN FÜR EBAY-SUCHTITEL:
- Erstelle genau drei unterschiedliche, suchrelevante deutsche Titelalternativen und gib sie in seo_titles aus. Der erste Titel ist die bevorzugte Variante.
- Jeder Titel muss höchstens 80 Zeichen lang sein. Keine abgeschnittenen Wörter, kaputten Zahlen oder sinnlosen Keyword-Ketten.
- Priorisiere belegte Marke, Produktart und Synonyme, Modell, Menge/Größe, Farbe/Material und belegte Verwendung. Verwende kaufnahe Suchbegriffe nur, wenn sie zum Produkt passen.
- Bewahre deutsche Dezimalzahlen und Maße korrekt, zum Beispiel 0,9 kg, 900 g, 55–58 cm. Keine Umwandlung in getrennte Ziffern.

REGELN FÜR DIE BESCHREIBUNG:
- Erstelle eine hochwertige, mobil lesbare Beschreibung. Schreibe ein klares Hauptversprechen und eine kurze empathische Einleitung mit konkretem Produktnutzen.
- Liefere genau vier kompakte Vorteilskarten und vier bis sechs präzise Stichpunkte. Vermeide Wiederholungen zwischen den Abschnitten.
- Fülle die technische Tabelle mit belegten Daten. Keine Platzhalter wie „Produkt“, „Produktdetails“, „Siehe Bilder“, „unbekannt“ oder leere Werte.
- Gib Lieferumfang und Servicehinweis nur aus, soweit belastbare Angaben vorliegen. Ein allgemeiner Kontakt über eBay-Nachrichten ist zulässig; verspreche keine Versanddauer, Rückgabe, Garantie oder kostenlose Leistung.
- Füge rechtliche Hinweise nur dann ein, wenn Produktdaten sie tatsächlich belegen und sie für das Produkt relevant sind. Erfinde keine EU-, GVO-, NemV-, Lebensmittel- oder Sicherheitsangaben. Wenn nichts sicher belegt ist, gib ein leeres Array zurück.
- Gib am Ende kompakte eBay-Artikelmerkmale aus. Verwende ausschließlich belegte Werte und lasse nicht belegte Merkmale weg. Die Publish-Pipeline ergänzt anschließend erforderliche eBay-Kategorieaspekte.
- Ein Expertentipp ist optional und darf nur aus den gelieferten Daten ableitbar sein. Erfinde keine Temperatur-, Montage- oder Nutzungshinweise.

HTML-VORLAGE:
- Die Ausgabe ist Inhalt für eine bestehende HTML-Vorlage. Liefere Textfelder und Arrays, keinen HTML-Code.
- Verwende kurze, gut scannbare Texte und keine Emojis außer in den Vorteilskarten.

JSON-SCHEMA:
{
  "seo_titles": ["Titel 1, höchstens 80 Zeichen", "Titel 2, höchstens 80 Zeichen", "Titel 3, höchstens 80 Zeichen"],
  "top_badge": "kurzes, belegtes Badge oder leer",
  "headline": "klare deutsche Produktüberschrift",
  "subtitle": "einzeiliger belegter Hauptnutzen",
  "introduction": "kurzer empathischer, nutzenorientierter Einstieg",
  "highlight_cards": [
    {"emoji":"✨","title":"Vorteil 1","desc":"konkreter belegter Nutzen"},
    {"emoji":"📦","title":"Vorteil 2","desc":"konkreter belegter Nutzen"},
    {"emoji":"🎯","title":"Vorteil 3","desc":"konkreter belegter Nutzen"},
    {"emoji":"🛠️","title":"Vorteil 4","desc":"konkreter belegter Nutzen"}
  ],
  "bullet_points": [{"label":"Merkmal","text":"belegte Erläuterung"}],
  "specs_table": [{"key":"Merkmal","value":"belegter Wert"}],
  "delivery_contents": "belegter Lieferumfang oder leer",
  "service_note": "sachlicher Servicehinweis oder leer",
  "legal_notices": ["nur belegter und relevanter Hinweis"],
  "item_specifics": [{"key":"eBay-Artikelmerkmal","value":"belegter Wert"}],
  "expert_tip": "sicher belegbarer Tipp oder leer"
}`;

const placeholder = /^(produkt|produktdetails|siehe bilder|siehe beschreibung|ausführung|maße & passform|n\/a|unknown|unbekannt|standard)$/i;
const safe = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 1000) : "";
const valid = (value: string) => value.length > 2 && !placeholder.test(value);
const validTitle = (value: string) => valid(value) && value.length <= 80 && !/\b\d+\s+\d+\b/.test(value);

function parseTextPairs(value: unknown, keyName: string, valueName: string, limit: number): Array<{ key: string; value: string }> {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({ key: safe(item?.[keyName]), value: safe(item?.[valueName]) }))
    .filter((item) => valid(item.key) && valid(item.value)).slice(0, limit);
}

export function parseProductCopy(value: unknown): ProductCopy | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const rawTitles = Array.isArray(raw.seo_titles) ? raw.seo_titles : Array.isArray(raw.seo_title_alternatives) ? raw.seo_title_alternatives : [];
  const titles = [...new Set(rawTitles.map(safe).map((candidate) => cleanEbayTitle(candidate, 80)).filter(validTitle))].slice(0, 3);
  // Older saved test fixtures and model responses may still contain only one title.
  const legacyTitle = cleanEbayTitle(safe(raw.seo_title), 80);
  if (raw.seo_title && !validTitle(legacyTitle)) return null;
  if (titles.length < 3 && validTitle(legacyTitle) && !titles.includes(legacyTitle)) titles.unshift(legacyTitle);
  if (titles.length < 3) return null;

  const cards = Array.isArray(raw.highlight_cards) ? raw.highlight_cards : [];
  const bullets = Array.isArray(raw.bullet_points) ? raw.bullet_points : [];
  const specs = Array.isArray(raw.specs_table) ? raw.specs_table : [];
  const highlight_cards = cards.map((item) => ({ emoji: safe(item?.emoji).slice(0, 8), title: safe(item?.title), desc: safe(item?.desc) })).filter((item) => valid(item.title) && valid(item.desc)).slice(0, 4);
  const bullet_points = bullets.map((item) => ({ label: safe(item?.label), text: safe(item?.text) })).filter((item) => valid(item.label) && valid(item.text)).slice(0, 6);
  const specs_table = specs.map((item) => ({ key: safe(item?.key), value: safe(item?.value) })).filter((item) => valid(item.key) && valid(item.value)).slice(0, 12);
  if (!bullet_points.length || !specs_table.length) return null;
  const item_specifics = parseTextPairs(raw.item_specifics, "key", "value", 30);
  const legal_notices = Array.isArray(raw.legal_notices) ? raw.legal_notices.map(safe).filter(valid).slice(0, 8) : [];
  return {
    seo_title: titles[0], seo_title_alternatives: titles,
    top_badge: valid(safe(raw.top_badge)) ? safe(raw.top_badge) : "",
    headline: valid(safe(raw.headline)) ? safe(raw.headline) : titles[0],
    subtitle: valid(safe(raw.subtitle)) ? safe(raw.subtitle) : "",
    introduction: valid(safe(raw.introduction)) ? safe(raw.introduction) : "",
    highlight_cards, bullet_points, specs_table,
    delivery_contents: valid(safe(raw.delivery_contents)) ? safe(raw.delivery_contents) : "",
    service_note: valid(safe(raw.service_note)) ? safe(raw.service_note) : "",
    legal_notices, item_specifics,
    expert_tip: valid(safe(raw.expert_tip)) ? safe(raw.expert_tip) : "",
  };
}

export async function generateProductCopy(facts: ProductFacts): Promise<ProductCopy | null> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: PRODUCT_COPY_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: `Nutze nur belegte Informationen aus diesen Produktdaten. Die Beispielwerte im Schema sind Platzhalter und keine Fakten. Lasse nicht belegbare Angaben weg. Schreibe ausschließlich Deutsch.\n${JSON.stringify(facts)}` }] }],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: 3000, thinkingConfig: { thinkingLevel: "low" } },
    }),
    cache: "no-store", signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) return null;
  const body = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  try { return parseProductCopy(JSON.parse(text)); } catch { return null; }
}
