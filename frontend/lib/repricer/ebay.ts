import "server-only";
import { repricerAdmin } from "./admin";
import { ensureSellingPolicyManagement, validEbayToken, type MarketplaceId } from "../ebay/multi-store";
import { generateSku } from "../ebay/sku";

const apiOrigin = process.env.EBAY_ENV === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
const cache = new Map<string, { token: string; expires: number }>();

async function legacyBridgeFor(userId: string) {
  const { count, error: storeError } = await repricerAdmin().from("ebay_stores").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("marketplace_id", "EBAY_DE").eq("status", "active");
  if (storeError) throw new Error(storeError.message);
  if (count) return false;
  if (!process.env.EBAY_LEGACY_OWNER_USER_ID || userId !== process.env.EBAY_LEGACY_OWNER_USER_ID) return false;
  const { data, error } = await repricerAdmin().from("ebay_connections").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`eBay-Verbindung konnte nicht gelesen werden: ${error.message}`);
  return !data;
}

async function bridgeRequest(path: string, init: RequestInit = {}) {
  const base = process.env.EBAY_BRIDGE_URL;
  const secret = process.env.EBAY_BRIDGE_SHARED_SECRET;
  if (!base || !secret) throw new Error("eBay-Bridge ist nicht konfiguriert.");
  const response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
    ...init, headers: { "x-autolister-bridge-key": secret, "Content-Type": "application/json", ...(init.headers || {}) },
    cache: "no-store", signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || `eBay-Bridge: HTTP ${response.status}`);
  return body;
}

async function sellerToken(userId: string, requestedStoreId?: string): Promise<string> {
  let storeQuery = repricerAdmin().from("ebay_stores").select("id,marketplace_id").eq("user_id", userId).eq("status", "active");
  if (requestedStoreId) storeQuery = storeQuery.eq("id", requestedStoreId);
  const { data: stores, error: storeError } = await storeQuery.eq("marketplace_id", "EBAY_DE").limit(2);
  if (storeError) throw new Error(storeError.message);
  if (stores?.length === 1) return validEbayToken(stores[0].id, userId);
  if (requestedStoreId && !stores?.length) throw new Error("Der ausgewählte eBay-Shop ist nicht aktiv, gehört nicht zu diesem Konto oder ist kein EBAY_DE-Shop.");
  if (stores && stores.length > 1) throw new Error("Birden fazla DE mağazası bağlı. Çoklu mağaza için Product Depot iş akışını kullanın.");
  const cached = cache.get(userId);
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const { data, error } = await repricerAdmin().from("ebay_connections").select("access_token,refresh_token").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`eBay-Verbindung konnte nicht gelesen werden: ${error.message}`);
  if (!data) throw new Error("eBay-Verbindung fehlt. Bitte Verkäuferkonto verbinden.");
  const clientId = process.env.EBAY_APP_ID || process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CERT_ID || process.env.EBAY_CLIENT_SECRET;
  if (data.refresh_token) {
    if (!clientId || !clientSecret) throw new Error("eBay OAuth-App ist nicht konfiguriert.");
    const response = await fetch(`${apiOrigin}/identity/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      // Omitting scope retains the seller's original grants, including Trading.
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: data.refresh_token }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const body = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!response.ok || !body.access_token) throw new Error(body.error_description || `eBay OAuth: HTTP ${response.status}`);
    cache.set(userId, { token: body.access_token, expires: Date.now() + (body.expires_in || 7200) * 1000 });
    return body.access_token;
  }
  if (!data.access_token) throw new Error("eBay-Zugriffstoken fehlt. Bitte Verkäuferkonto erneut verbinden.");
  return data.access_token;
}

async function inventoryRequest(token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${apiOrigin}/sell/inventory/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Accept-Language": "de-DE", "Content-Language": "de-DE", "Content-Type": "application/json", "X-EBAY-C-MARKETPLACE-ID": "EBAY_DE", ...(init.headers || {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.errors?.[0]?.message || `eBay Inventory: HTTP ${response.status}`);
  return body;
}

type EbaySetupOption = { id: string; name: string };
export type EbayCategorySuggestion = { id: string; name: string; path: string };
export function isMissingOfferResponse(status: number, errors: Array<{ errorId?: number }> | undefined): boolean {
  return status === 404 && Boolean(errors?.some((error) => Number(error.errorId) === 25713));
}

export function inventoryItemDescription(html: string, title: string): string {
  const plain = html.replace(/<[^>]*>/g, " ")
    .replace(/&(?:amp|#38);/gi, "&").replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&(?:lt|#60);/gi, "<").replace(/&(?:gt|#62);/gi, ">")
    .replace(/\s+/g, " ").trim();
  return (plain || title).slice(0, 4000);
}

type CategoryAspect = {
  localizedAspectName?: string;
  aspectConstraint?: { aspectRequired?: boolean; aspectMode?: string };
  aspectValues?: Array<{ localizedValue?: string }>;
};
export type DraftRequiredAspect = { name: string; required: boolean; mode: string; choices: string[]; value: string };
const categoryAspectCache = new Map<string, { value: CategoryAspect[]; expires: number }>();
let categoryTreeIdCache: { value: string; expires: number } | null = null;

function normalizedAspectText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss").toLocaleLowerCase("de-DE").replace(/[^a-z0-9]+/g, " ").trim();
}

type AspectGroup = "department" | "color" | "size" | "style" | "productType" | "material" | "brand" | "identifier" | "unit" | "unitCount" | "other";
function aspectGroup(name: string): AspectGroup {
  const key = normalizedAspectText(name);
  if (/^(abteilung|department|geschlecht|gender)$/.test(key)) return "department";
  if (/^(farbe|color|colour)$/.test(key)) return "color";
  if (/groesse|grosse|size|schuhgroesse|hutgroesse|clothing size/.test(key)) return "size";
  if (/^(stil|style|look)$/.test(key)) return "style";
  if (/produktart|product type|article type|^type$|^art$/.test(key)) return "productType";
  if (/material|werkstoff|composition/.test(key)) return "material";
  if (/mpn|ean|gtin|upc|isbn|herstellernummer|artikelnummer/.test(key)) return "identifier";
  if (/^(marke|brand|hersteller|manufacturer)$/.test(key)) return "brand";
  if (/masseinheit|unit of measurement|unit type/.test(key)) return "unit";
  if (/anzahl der einheiten|number of units|unit count|quantity of units/.test(key)) return "unitCount";
  return "other";
}

function aspectKeyMatches(key: string, aspectName: string) {
  const normalizedKey = normalizedAspectText(key);
  const normalizedName = normalizedAspectText(aspectName);
  if (normalizedKey === normalizedName) return true;
  return aspectGroup(key) === aspectGroup(aspectName) && aspectGroup(key) !== "other";
}

function matchAspectAllowed(candidate: string, allowedValues: string[], group: AspectGroup): string | null {
  if (!candidate) return null;
  const normalized = normalizedAspectText(candidate);
  const equivalents = group === "color" && normalized === "rosa" ? ["rosa", "pink", "rose"]
    : group === "color" && normalized === "braun" ? ["braun", "kaffeefarbe", "brown"]
      : group === "color" && normalized === "mehrfarbig" ? ["mehrfarbig", "multicolor", "multicolour"]
        : group === "size" && normalized === "einheitsgroesse" ? ["einheitsgroesse", "one size", "universalgroesse", "osfa"]
          : group === "department" && normalized === "unisex erwachsene" ? ["unisex erwachsene", "unisex", "unisex adult"]
            : group === "brand" && normalized === "markenlos" ? ["markenlos", "ohne marke", "unbranded", "no brand"]
              : group === "identifier" && normalized === "nicht zutreffend" ? ["nicht zutreffend", "n a", "not applicable"]
                : group === "unit" && normalized === "einheit" ? ["einheit", "stuck", "stk", "unit", "piece"]
                  : [normalized];
  const match = allowedValues.find((value) => equivalents.includes(normalizedAspectText(value)));
  if (match) return match;
  if (group === "size") {
    const range = candidate.match(/\d{2}(?:[.,]\d)?\s*[-–]\s*\d{2}(?:[.,]\d)?/);
    if (range) return allowedValues.find((value) => normalizedAspectText(value).includes(normalizedAspectText(range[0]))) || null;
  }
  return null;
}

function inferAspectValue(name: string, source: string, allowedValues: string[], aspectMode = "", categoryName = "") {
  const normalizedName = normalizedAspectText(name);
  const group = aspectGroup(name);
  const text = normalizedAspectText(source);
  if (group === "department") {
    const candidate = /\b(damen|frauen|frau|women|woman)[a-z]*\b/.test(text) ? "Damen"
      : /\b(herren|maenner|mann|men|man)[a-z]*\b/.test(text) ? "Herren"
        : /\b(kinder|madchen|jungen|kids|children)[a-z]*\b/.test(text) ? "Kinder" : "Unisex Erwachsene";
    return matchAspectAllowed(candidate, allowedValues, group) || (!allowedValues.length ? candidate : null);
  }
  if (group === "color") {
    const candidate = /sky pink|\bpink\b|\brosa\b|rose/.test(text) ? "Rosa"
      : /kaffeefarbe|kaffee|coffee|schokolade/.test(text) ? "Braun"
        : /\bschwarz\b|\bblack\b/.test(text) ? "Schwarz"
          : /\bweiss\b|\bwhite\b/.test(text) ? "Weiß"
            : /\bbeige\b|\bcreme\b|\bcream\b/.test(text) ? "Beige"
              : /\bblau\b|\bblue\b/.test(text) ? "Blau"
                : /\bgruen\b|\bgreen\b/.test(text) ? "Grün"
                  : /\bgrau\b|\bgrey\b|\bgray\b/.test(text) ? "Grau"
                    : /\brot\b|\bred\b/.test(text) ? "Rot"
                      : /\bgelb\b|\byellow\b/.test(text) ? "Gelb"
                        : /\bbraun\b|\bbrown\b/.test(text) ? "Braun"
                          : /\borange\b/.test(text) ? "Orange" : "Mehrfarbig";
    return matchAspectAllowed(candidate, allowedValues, group) || (!allowedValues.length ? candidate : null);
  }
  if (group === "size") {
    const range = source.match(/\b(\d{2}(?:[.,]\d)?\s*[-–]\s*\d{2}(?:[.,]\d)?)\s*(cm)?\b/i);
    const letter = source.match(/(?:^|\s)(XXXL|XXL|XXS|XL|XS|S|M|L)(?=$|\s|[,/.-])/i)?.[1]?.toUpperCase();
    const candidate = /einheitsgroesse|one size|osfa|universal size/.test(text) ? "Einheitsgröße"
      : range ? `${range[1].replace(/\s+/g, "")}${range[2] ? " cm" : ""}` : letter || "Einheitsgröße";
    return matchAspectAllowed(candidate, allowedValues, group) || (!allowedValues.length ? candidate : null);
  }
  if (group === "style") {
    const candidate = /outdoor|sport|fitness|wandern/.test(text) ? "Sportlich"
      : /sonnenblende|visor/.test(text) ? "Sonnenblende"
        : /sonnenhut|bucket hat/.test(text) ? "Sonnenhut"
          : /kappe|schirmmutze|fischerhut/.test(text) ? "Kappe" : "Siehe Beschreibung";
    return matchAspectAllowed(candidate, allowedValues, group) || (!allowedValues.length ? candidate : allowedValues[0] || null);
  }
  if (group === "brand") {
    const rawCandidate = source.trim().split(/\s+/)[0]?.replace(/^[\s([{"'“”]+|[\s,.;:)\]}"'“”]+$/g, "") || "";
    const generic = new Set(["neu", "set", "produkt", "das", "der", "die", "the", "brand", "marke", "unbekannt", "unknown"]);
    if (!/^[\p{L}\p{N}][\p{L}\p{N}&.+'-]{1,39}$/u.test(rawCandidate) || generic.has(normalizedAspectText(rawCandidate))) return null;
    const exact = allowedValues.find((value) => normalizedAspectText(value) === normalizedAspectText(rawCandidate));
    if (exact) return exact;
    if (!allowedValues.length || /FREE_TEXT|CUSTOM/i.test(aspectMode)) return rawCandidate;
    return null;
  }
  if (/produktart|product type|^type$|^art$/.test(normalizedName)) {
    const candidates = /waschmittel|waschkapsel|waschpod|pods/.test(text)
      ? ["Waschmittel", "Waschmittelkapseln"]
      : /ramen|schusselset|schalen.?set|reisschale/.test(text)
        ? ["Schüsselset", "Schalen-Set", "Schüssel", "Schale"]
        : /sonnenhut|bucket hat/.test(text)
          ? ["Sonnenhut", "Hut"]
          : /visor|sonnenblende/.test(text)
            ? ["Sonnenblende", "Visor", "Schildmütze"]
      : /teller/.test(text) && /schussel|schale|reisschale/.test(text)
      ? ["Geschirrset", "Teller-Set", "Geschirr-Set", "Tellerset", "Teller"]
      : /teller/.test(text) && /set|4er|6er|8er|mehrteilig/.test(text)
        ? ["Teller-Set", "Tellerset", "Geschirrset", "Teller"]
        : /salatschussel/.test(text) ? ["Salatschüssel", "Schüssel", "Schale"]
          : /schussel|schale|reisschale/.test(text) ? ["Schüssel", "Schale"]
            : /keramik|geschirr|porzellan/.test(text) ? ["Geschirrset", "Geschirr", "Keramikgeschirr"] : [];
    if (!candidates.length && categoryName) candidates.push(categoryName);
    if (!candidates.length) return null;
    if (!allowedValues.length) return candidates[0];
    for (const candidate of candidates) {
      const match = allowedValues.find((value) => normalizedAspectText(value) === normalizedAspectText(candidate));
      if (match) return match;
    }
    const setValue = allowedValues.find((value) => /set|service/.test(normalizedAspectText(value)) && /teller|geschirr|service/.test(normalizedAspectText(value)));
    if (setValue && /set|4er|6er|8er|mehrteilig/.test(text)) return setValue;
    const plateValue = allowedValues.find((value) => /teller|plate/.test(normalizedAspectText(value)));
    return plateValue || null;
  }
  if (/^(material|werkstoff|materialart|materialzusammensetzung|material ausfuhrung|composition|material type)$/.test(normalizedName)) {
    const materialCandidates: Array<{ pattern: RegExp; values: string[] }> = [
      { pattern: /porzellan|porcelain/, values: ["Porzellan", "Porcelain"] },
      { pattern: /keramik|ceramic/, values: ["Keramik", "Ceramic"] },
      { pattern: /steingut|stoneware/, values: ["Steingut", "Stoneware"] },
      { pattern: /edelstahl|rostfreier stahl|stainless steel/, values: ["Edelstahl", "Stainless Steel", "Rostfreier Stahl"] },
      { pattern: /glas|glass/, values: ["Glas", "Glass"] },
      { pattern: /kunststoff|plastik|plastic/, values: ["Kunststoff", "Plastic"] },
      { pattern: /silikon|silicone/, values: ["Silikon", "Silicone"] },
      { pattern: /baumwolle|cotton/, values: ["Baumwolle", "Cotton"] },
      { pattern: /polyester/, values: ["Polyester"] },
      { pattern: /holz|wood/, values: ["Holz", "Wood"] },
      { pattern: /leder|leather/, values: ["Leder", "Leather"] },
      { pattern: /aluminium|aluminum/, values: ["Aluminium", "Aluminum"] },
    ];
    for (const candidate of materialCandidates) {
      if (!candidate.pattern.test(text)) continue;
      const match = allowedValues.find((value) => candidate.values.some((label) => normalizedAspectText(value) === normalizedAspectText(label)));
      if (match) return match;
      if (!allowedValues.length || /FREE_TEXT|CUSTOM/i.test(aspectMode)) return candidate.values[0];
    }
  }
  return null;
}

async function requiredCategoryAspects(token: string, categoryId: string): Promise<CategoryAspect[]> {
  const cached = categoryAspectCache.get(categoryId);
  if (cached && cached.expires > Date.now()) return cached.value;
  let treeId = categoryTreeIdCache?.expires && categoryTreeIdCache.expires > Date.now() ? categoryTreeIdCache.value : "";
  if (!treeId) {
    const tree = await sellerApiRequest(token, "/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=EBAY_DE") as { categoryTreeId?: string };
    treeId = String(tree.categoryTreeId || "").trim();
    if (!treeId) throw new Error("eBay hat keinen Kategoriebaum für Produktmerkmale zurückgegeben.");
    categoryTreeIdCache = { value: treeId, expires: Date.now() + 24 * 60 * 60 * 1000 };
  }
  const response = await sellerApiRequest(token, `/commerce/taxonomy/v1/category_tree/${encodeURIComponent(treeId)}/get_item_aspects_for_category?category_id=${encodeURIComponent(categoryId)}`) as { aspects?: CategoryAspect[] };
  const aspects = Array.isArray(response.aspects) ? response.aspects : [];
  categoryAspectCache.set(categoryId, { value: aspects, expires: Date.now() + 6 * 60 * 60 * 1000 });
  return aspects;
}

function inferAspectFromProductData(name: string, source: string, itemSpecifics: Record<string, string[]>, allowedValues: string[], aspectMode = "", categoryName = "") {
  const normalizedName = normalizedAspectText(name);
  const direct = Object.entries(itemSpecifics).find(([key, values]) =>
    aspectKeyMatches(key, name) && values.some((value) => value.trim()))?.[1]?.find((value) => value.trim())?.trim();
  if (direct) {
    const exact = matchAspectAllowed(direct, allowedValues, aspectGroup(name));
    if (exact) return exact;
    if (!allowedValues.length || /FREE_TEXT|CUSTOM/i.test(aspectMode)) return direct;
  }
  if (/produktart|product type|^type$|^art$/.test(normalizedName)) {
    const inferred = inferAspectValue(name, source, allowedValues, aspectMode, categoryName);
    if (inferred) return inferred;
    const related = Object.entries(itemSpecifics).find(([key, values]) =>
      /^(typ|produkttyp|product type|art)$/.test(normalizedAspectText(key)) && values.some((value) => value.trim()))?.[1]?.find((value) => value.trim())?.trim();
    if (related) {
      const exact = matchAspectAllowed(related, allowedValues, aspectGroup(name));
      if (exact) return exact;
      if (!allowedValues.length || /FREE_TEXT|CUSTOM/i.test(aspectMode)) return related;
    }
  }
  return inferAspectValue(name, source, allowedValues, aspectMode, categoryName);
}

function safeAspectFallback(name: string, values: string[], categoryName = "") {
  const group = aspectGroup(name);
  const fallback = group === "department" ? "Unisex Erwachsene"
    : group === "color" ? "Mehrfarbig"
      : group === "size" ? "Einheitsgröße"
        : group === "brand" ? "Markenlos"
          : group === "identifier" ? "Nicht zutreffend"
            : group === "unit" ? "Einheit"
              : group === "unitCount" ? "1"
                : (group === "style" || group === "productType") && categoryName ? categoryName : "Siehe Beschreibung";
  return matchAspectAllowed(fallback, values, group) || values[0] || fallback;
}

export function resolveRequiredAspectsFromData(aspects: CategoryAspect[], title: string, description: string, itemSpecifics: Record<string, string[]> = {}, categoryName = "", suggestions: Record<string, string> = {}): Record<string, string[]> {
  const source = `${title} ${description} ${Object.entries(itemSpecifics).flatMap(([key, values]) => [key, ...values]).join(" ")}`;
  const result: Record<string, string[]> = {};
  for (const aspect of aspects.filter((item) => item.aspectConstraint?.aspectRequired === true)) {
    const name = String(aspect.localizedAspectName || "").trim();
    if (!name) continue;
    const values = (aspect.aspectValues || []).map((entry) => String(entry.localizedValue || "").trim()).filter(Boolean);
    const mode = String(aspect.aspectConstraint?.aspectMode || "");
    const inferred = inferAspectFromProductData(name, source, itemSpecifics, values, mode, categoryName);
    const suggestion = String(Object.entries(suggestions).find(([key]) => normalizedAspectText(key) === normalizedAspectText(name))?.[1] || "").trim();
    const aiValue = suggestion
      ? matchAspectAllowed(suggestion, values, aspectGroup(name)) || (!values.length && normalizedAspectText(source).includes(normalizedAspectText(suggestion)) ? suggestion : null)
      : null;
    result[name] = [inferred || aiValue || safeAspectFallback(name, values, categoryName)];
  }
  return result;
}

async function generateGeminiAspectSuggestions(title: string, descriptionHtml: string, itemSpecifics: Record<string, string[]>, required: CategoryAspect[], categoryName: string): Promise<Record<string, string>> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return {};
  const source = `${title} ${inventoryItemDescription(descriptionHtml, title)} ${Object.entries(itemSpecifics).map(([name, values]) => `${name}: ${values.join(", ")}`).join("; ")}`;
  const unresolved = required.filter((aspect) => {
    const name = String(aspect.localizedAspectName || "").trim();
    return name && !inferAspectFromProductData(name, source, itemSpecifics, (aspect.aspectValues || []).map((entry) => String(entry.localizedValue || "")), String(aspect.aspectConstraint?.aspectMode || ""), categoryName);
  });
  if (!unresolved.length) return {};
  try {
    const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "Du ordnest verpflichtende eBay-Artikelmerkmale auf Deutsch zu. Gib ausschließlich ein JSON-Objekt mit Aspektname und kurzem Wert zurück. Nutze nur Tatsachen, die ausdrücklich im Titel, in der Beschreibung oder in den gelieferten Produktmerkmalen stehen. Erfinde keine Eigenschaften. Wähle bei Auswahllisten exakt einen gelieferten erlaubten Wert; unbelegte Merkmale auslassen." }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify({ title, description: source.slice(0, 4500), category: categoryName, aspects: unresolved.map((aspect) => ({ name: aspect.localizedAspectName, allowedValues: (aspect.aspectValues || []).map((value) => value.localizedValue).filter(Boolean) })) }) }] }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: 600, thinkingConfig: { thinkingLevel: "low" } },
      }),
      cache: "no-store", signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) return {};
    const body = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).flatMap(([name, value]) => typeof value === "string" && value.trim() ? [[name, value.trim().slice(0, 100)]] : []));
  } catch { return {}; }
}

async function listingAspects(token: string, categoryId: string, title: string, descriptionHtml: string, itemSpecifics: Record<string, string[]> = {}, categoryName = ""): Promise<Record<string, string[]>> {
  const required = (await requiredCategoryAspects(token, categoryId)).filter((aspect) => aspect.aspectConstraint?.aspectRequired === true);
  const suggestions = await generateGeminiAspectSuggestions(title, descriptionHtml, itemSpecifics, required, categoryName);
  return resolveRequiredAspectsFromData(required, title, inventoryItemDescription(descriptionHtml, title), itemSpecifics, categoryName, suggestions);
}

export async function completeDraftRequiredAspects(userId: string, storeId: string | undefined, categoryId: string, title: string, descriptionHtml: string, itemSpecifics: Record<string, string[]> = {}, categoryName = ""): Promise<Record<string, string[]>> {
  const token = await sellerToken(userId, storeId);
  const completed = await listingAspects(token, categoryId, title, descriptionHtml, itemSpecifics, categoryName);
  return { ...itemSpecifics, ...completed };
}

export async function getDraftRequiredAspects(userId: string, storeId: string | undefined, categoryId: string, title: string, descriptionHtml: string, itemSpecifics: Record<string, string[]> = {}, categoryName = ""): Promise<DraftRequiredAspect[]> {
  const token = await sellerToken(userId, storeId);
  const aspects = (await requiredCategoryAspects(token, categoryId)).filter((aspect) => aspect.aspectConstraint?.aspectRequired === true);
  const completed = await listingAspects(token, categoryId, title, descriptionHtml, itemSpecifics, categoryName);
  return aspects.flatMap((aspect) => {
    const name = String(aspect.localizedAspectName || "").trim();
    if (!name) return [];
    const choices = (aspect.aspectValues || []).map((entry) => String(entry.localizedValue || "").trim()).filter(Boolean);
    const mode = String(aspect.aspectConstraint?.aspectMode || "");
    const value = completed[name]?.[0] || safeAspectFallback(name, choices, categoryName);
    return [{ name, required: true, mode, choices, value }];
  });
}
export type EbayListingSetup = {
  storeId: string | null;
  marketplaceId: string;
  merchantLocations: EbaySetupOption[];
  fulfillmentPolicies: EbaySetupOption[];
  paymentPolicies: EbaySetupOption[];
  returnPolicies: EbaySetupOption[];
  defaults: {
    merchantLocationKey: string;
    fulfillmentPolicyId: string;
    paymentPolicyId: string;
    returnPolicyId: string;
    categoryId: string;
  };
};

function normalizeMarketplaceId(value: unknown): MarketplaceId {
  const normalized = String(value || "EBAY_DE").trim().toUpperCase();
  if (normalized === "DE" || normalized === "DE · TARGONAHANDEL" || normalized.startsWith("DE ·")) return "EBAY_DE";
  if (["EBAY_DE", "EBAY_US", "EBAY_GB"].includes(normalized)) return normalized as MarketplaceId;
  throw new Error(`Nicht unterstützter eBay-Marktplatz: ${normalized}`);
}

async function sellerApiRequest(token: string, path: string, marketplaceId = "EBAY_DE") {
  const response = await fetch(`${apiOrigin}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Accept-Language": "de-DE",
      "Content-Language": "de-DE",
      "X-EBAY-C-MARKETPLACE-ID": normalizeMarketplaceId(marketplaceId),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const first = body?.errors?.[0] as { message?: unknown; longMessage?: unknown; errorId?: unknown } | undefined;
    const detail = [first?.message, first?.longMessage].map((value) => String(value || "").trim()).find((value) => value.length > 2 && value !== ".");
    const code = first?.errorId ? ` (${String(first.errorId)})` : "";
    throw new Error(detail ? `${detail}${code}` : `eBay-Verkäuferkonto konnte die Einstellungen nicht laden (HTTP ${response.status}${code}). Prüfe eBay-Berechtigungen und Verkäufer-Richtlinien.`);
  }
  return body;
}

export async function suggestEbayCategories(userId: string, title: string, storeId?: string): Promise<EbayCategorySuggestion[]> {
  const query = title.trim().slice(0, 300);
  if (!query) return [];
  const token = await sellerToken(userId, storeId);
  const request = async (path: string) => {
    const response = await fetch(`${apiOrigin}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Accept-Language": "de-DE", "X-EBAY-C-MARKETPLACE-ID": "EBAY_DE" },
      cache: "no-store", signal: AbortSignal.timeout(20_000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = String(body?.errors?.[0]?.message || "").trim();
      throw new Error(message || `eBay-Kategorien konnten nicht geladen werden (HTTP ${response.status}).`);
    }
    return body as Record<string, unknown>;
  };
  const tree = await request("/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=EBAY_DE");
  const treeId = String(tree.categoryTreeId || "").trim();
  if (!treeId) throw new Error("eBay hat keinen Kategoriebaum für Deutschland zurückgegeben.");
  const result = await request(`/commerce/taxonomy/v1/category_tree/${encodeURIComponent(treeId)}/get_category_suggestions?q=${encodeURIComponent(query)}`);
  const rows = Array.isArray(result.categorySuggestions) ? result.categorySuggestions : [];
  return rows.flatMap((raw): EbayCategorySuggestion[] => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Record<string, unknown>;
    const category = row.category && typeof row.category === "object" ? row.category as Record<string, unknown> : {};
    const id = String(category.categoryId || "").trim();
    const name = String(category.categoryName || "").trim();
    if (!id || !name) return [];
    const ancestors = Array.isArray(row.categoryTreeNodeAncestors) ? row.categoryTreeNodeAncestors : [];
    const names = ancestors.flatMap((ancestor) => {
      if (!ancestor || typeof ancestor !== "object") return [];
      const ancestorName = String((ancestor as Record<string, unknown>).categoryName || "").trim();
      return ancestorName ? [ancestorName] : [];
    });
    return [{ id, name, path: [...names, name].join(" › ") }];
  }).slice(0, 8);
}

const defaultLocationKey = "default_de_location";

async function createMerchantLocation(token: string, city: string, postalCode: string) {
  const response = await fetch(`${apiOrigin}/sell/inventory/v1/location/${defaultLocationKey}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json", "Content-Language": "de-DE" },
    body: JSON.stringify({ location: { address: { city, postalCode, country: "DE" } }, name: "Standard Versandlager DE", merchantLocationStatus: "ENABLED", locationTypes: ["WAREHOUSE"] }),
    cache: "no-store", signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok && response.status !== 409) {
    const body = await response.json().catch(() => ({})) as { errors?: Array<{ message?: string; longMessage?: string; errorId?: number }> };
    const error = body.errors?.[0];
    throw new Error(error?.longMessage || error?.message || `eBay-Standort konnte nicht erstellt werden (HTTP ${response.status}${error?.errorId ? `, ${error.errorId}` : ""}).`);
  }
}

export async function createDefaultEbayLocation(userId: string, storeId: string, city: string, postalCode: string) {
  if (!/^[A-Za-zÄÖÜäöüß .'-]{2,80}$/.test(city) || !/^\d{5}$/.test(postalCode)) throw new Error("Bitte eine gültige deutsche Stadt und fünfstellige Postleitzahl eingeben.");
  const { data: store, error } = await repricerAdmin().from("ebay_stores").select("id,merchant_location_key")
    .eq("id", storeId).eq("user_id", userId).eq("marketplace_id", "EBAY_DE").eq("status", "active").maybeSingle();
  if (error || !store) throw new Error("Der ausgewählte eBay-DE-Shop ist nicht aktiv oder gehört nicht zu diesem Konto.");
  const token = await sellerToken(userId, storeId);
  const existing = await sellerApiRequest(token, "/sell/inventory/v1/location?limit=100&offset=0") as { locations?: Array<{ merchantLocationKey?: string }> };
  if (!existing.locations?.length) await createMerchantLocation(token, city, postalCode);
  const refreshed = await sellerApiRequest(token, "/sell/inventory/v1/location?limit=100&offset=0") as { locations?: Array<{ merchantLocationKey?: string }> };
  const key = refreshed.locations?.find((item) => item.merchantLocationKey === defaultLocationKey)?.merchantLocationKey
    || refreshed.locations?.[0]?.merchantLocationKey;
  if (!key) throw new Error("eBay hat den neuen Versandstandort noch nicht zurückgegeben.");
  const { error: saveError } = await repricerAdmin().from("ebay_stores").update({ merchant_location_key: key, updated_at: new Date().toISOString() })
    .eq("id", storeId).eq("user_id", userId).eq("marketplace_id", "EBAY_DE").eq("status", "active");
  if (saveError) throw new Error(`Standort erstellt, konnte aber nicht gespeichert werden: ${saveError.message}`);
  return key;
}

export async function getEbayListingSetup(userId: string, requestedStoreId?: string): Promise<EbayListingSetup> {
  let store: { id: string; seller_username: string; marketplace_id: string; merchant_location_key: string | null; fulfillment_policy_id: string | null; payment_policy_id: string | null; return_policy_id: string | null } | null = null;
  if (requestedStoreId) {
    const { data, error } = await repricerAdmin().from("ebay_stores")
      .select("id,seller_username,marketplace_id,merchant_location_key,fulfillment_policy_id,payment_policy_id,return_policy_id")
      .eq("id", requestedStoreId).eq("user_id", userId).eq("status", "active").maybeSingle();
    if (error) throw new Error(`eBay-Shop konnte nicht gelesen werden: ${error.message}`);
    if (!data) throw new Error("Der ausgewählte eBay-Shop ist nicht aktiv oder gehört nicht zu diesem Konto.");
    store = data;
    if (normalizeMarketplaceId(store.marketplace_id) !== "EBAY_DE") throw new Error("eBay-Entwürfe können derzeit nur auf dem Marktplatz EBAY_DE veröffentlicht werden.");
  } else {
    const { data, error } = await repricerAdmin().from("ebay_stores")
      .select("id,seller_username,marketplace_id,merchant_location_key,fulfillment_policy_id,payment_policy_id,return_policy_id")
      .eq("user_id", userId).eq("marketplace_id", "EBAY_DE").eq("status", "active")
      .order("created_at", { ascending: true }).limit(1);
    if (error) throw new Error(`eBay-Shops konnten nicht gelesen werden: ${error.message}`);
    store = data?.[0] || null;
  }
  if (await legacyBridgeFor(userId)) {
    throw new Error("Für eBay-Entwürfe muss das Verkäuferkonto direkt per eBay OAuth verbunden sein.");
  }
  const marketplaceId = normalizeMarketplaceId(store?.marketplace_id || "EBAY_DE");
  const token = await sellerToken(userId, store?.id);
  let [locations, policySnapshot] = await Promise.all([
    sellerApiRequest(token, "/sell/inventory/v1/location?limit=100&offset=0"),
    ensureSellingPolicyManagement(token, marketplaceId),
  ]);
  // The owner supplied this dispatch city/postcode for this specific store.
  if (store?.seller_username === "targonahandel" && Array.isArray(locations.locations) && locations.locations.length === 0) {
    await createMerchantLocation(token, "Augsburg", "86150");
    locations = await sellerApiRequest(token, "/sell/inventory/v1/location?limit=100&offset=0");
  }
  const mapOptions = (rows: unknown, idKey: string, nameKey: string): EbaySetupOption[] =>
    (Array.isArray(rows) ? rows : []).flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const item = row as Record<string, unknown>;
      const id = String(item[idKey] || "").trim();
      const name = String(item[nameKey] || id).trim();
      return id ? [{ id, name }] : [];
    });
  let merchantLocations = mapOptions(locations.locations, "merchantLocationKey", "name");
  const fulfillmentPolicies = mapOptions(policySnapshot.fulfillmentPolicies, "fulfillmentPolicyId", "name");
  const paymentPolicies = mapOptions(policySnapshot.paymentPolicies, "paymentPolicyId", "name");
  const returnPolicies = mapOptions(policySnapshot.returnPolicies, "returnPolicyId", "name");
  if (store) {
    const uniqueDefaults = [
      ["merchant_location_key", store.merchant_location_key, merchantLocations],
      ["fulfillment_policy_id", store.fulfillment_policy_id, fulfillmentPolicies],
      ["payment_policy_id", store.payment_policy_id, paymentPolicies],
      ["return_policy_id", store.return_policy_id, returnPolicies],
    ] as const;
    for (const [column, savedValue, options] of uniqueDefaults) {
      if (savedValue || options.length !== 1) continue;
      const { error } = await repricerAdmin().from("ebay_stores").update({ [column]: options[0].id, updated_at: new Date().toISOString() })
        .eq("id", store.id).eq("user_id", userId).is(column, null);
      if (error) throw new Error(`eBay-Standardeinstellung konnte nicht gespeichert werden: ${error.message}`);
    }
  }
  return {
    storeId: store?.id || null,
    marketplaceId,
    merchantLocations,
    fulfillmentPolicies,
    paymentPolicies,
    returnPolicies,
    defaults: {
      merchantLocationKey: (store?.merchant_location_key || (!store ? process.env.EBAY_MERCHANT_LOCATION_KEY : null) || merchantLocations[0]?.id || "").trim(),
      fulfillmentPolicyId: (store?.fulfillment_policy_id || (!store ? process.env.EBAY_FULFILLMENT_POLICY_ID : null) || fulfillmentPolicies[0]?.id || "").trim(),
      paymentPolicyId: (store?.payment_policy_id || (!store ? process.env.EBAY_PAYMENT_POLICY_ID : null) || paymentPolicies[0]?.id || "").trim(),
      returnPolicyId: (store?.return_policy_id || (!store ? process.env.EBAY_RETURN_POLICY_ID : null) || returnPolicies[0]?.id || "").trim(),
      categoryId: process.env.EBAY_DEFAULT_CATEGORY_ID || "",
    },
  };
}

export async function saveEbayListingSetup(userId: string, storeId: string, settings: Pick<EbayListingSetup["defaults"], "merchantLocationKey" | "fulfillmentPolicyId" | "paymentPolicyId" | "returnPolicyId">) {
  const { data, error } = await repricerAdmin().from("ebay_stores").update({
    merchant_location_key: settings.merchantLocationKey,
    fulfillment_policy_id: settings.fulfillmentPolicyId,
    payment_policy_id: settings.paymentPolicyId,
    return_policy_id: settings.returnPolicyId,
    updated_at: new Date().toISOString(),
  }).eq("id", storeId).eq("user_id", userId).eq("marketplace_id", "EBAY_DE").eq("status", "active")
    .select("id").maybeSingle();
  if (error) throw new Error(`eBay-Einstellungen konnten nicht gespeichert werden: ${error.message}`);
  if (!data) throw new Error("Der ausgewählte eBay-Shop ist nicht aktiv oder gehört nicht zu diesem Konto.");
}

export async function publishEbayDraftProduct(input: {
  userId: string;
  storeId?: string;
  id: string;
  title: string;
  descriptionHtml: string;
  images: string[];
  categoryId?: string | null;
  price: number;
  quantity?: number;
  itemSpecifics?: Record<string, string[]>;
  settings: Pick<EbayListingSetup["defaults"], "merchantLocationKey" | "fulfillmentPolicyId" | "paymentPolicyId" | "returnPolicyId">;
}): Promise<{ sku: string; offerId: string; itemId: string; price: number; quantity: number }> {
  if (await legacyBridgeFor(input.userId)) {
    throw new Error("Die direkte eBay Inventory-Veröffentlichung benötigt eine eBay OAuth-Verbindung.");
  }
  if (!Number.isFinite(input.price) || input.price <= 0) throw new Error("Der berechnete Verkaufspreis fehlt.");
  if (!input.images.length) throw new Error("Vor der Veröffentlichung muss mindestens ein Produktbild vorhanden sein.");
  const { merchantLocationKey, fulfillmentPolicyId, paymentPolicyId, returnPolicyId } = input.settings;
  const categoryId = String(input.categoryId || process.env.EBAY_DEFAULT_CATEGORY_ID || "").trim();
  if (!merchantLocationKey || !fulfillmentPolicyId || !paymentPolicyId || !returnPolicyId || !categoryId) {
    throw new Error("Bitte wähle eBay-Standort, Kategorie sowie Versand-, Zahlungs- und Rückgaberichtlinie.");
  }
  const token = await sellerToken(input.userId, input.storeId);
  const aspects = await listingAspects(token, categoryId, input.title, input.descriptionHtml, input.itemSpecifics || {});
  let storeQuery = repricerAdmin().from("ebay_stores").select("id,store_name,seller_username,sku_prefix")
    .eq("user_id", input.userId).eq("status", "active").eq("marketplace_id", "EBAY_DE");
  if (input.storeId) storeQuery = storeQuery.eq("id", input.storeId);
  const { data: skuStores, error: skuStoreError } = await storeQuery.limit(2);
  if (skuStoreError) throw new Error(`Shop-Identität für SKU konnte nicht geladen werden: ${skuStoreError.message}`);
  if (skuStores && skuStores.length > 1) throw new Error("Bitte wähle vor dem Veröffentlichen einen einzelnen eBay-Shop aus.");
  const skuStore = skuStores?.[0];
  const sku = generateSku({
    storeId: skuStore?.id || input.storeId,
    userId: input.userId,
    listingId: input.id,
    storeName: skuStore?.store_name,
    sellerUsername: skuStore?.seller_username,
    skuPrefix: skuStore?.sku_prefix,
  });
  const quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new Error("Adet 1–999 arasında olmalı.");
  const listingDescription = input.descriptionHtml.slice(0, 50_000);
  const item = {
    availability: { shipToLocationAvailability: { quantity } },
    condition: "NEW",
    product: {
      title: input.title.slice(0, 80),
      description: inventoryItemDescription(listingDescription, input.title),
      imageUrls: input.images.slice(0, 12),
      aspects,
    },
  };
  const offerUrl = `${apiOrigin}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}&marketplace_id=EBAY_DE`;
  const existingResponse = await fetch(offerUrl, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Accept-Language": "de-DE", "Content-Language": "de-DE", "X-EBAY-C-MARKETPLACE-ID": "EBAY_DE" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const existingBody = await existingResponse.json().catch(() => ({})) as {
    offers?: Array<{ offerId?: string; listing?: { listingId?: string }; listingId?: string }>;
    errors?: Array<{ errorId?: number; message?: string; longMessage?: string }>;
  };
  // eBay returns 404/25713 when a SKU has no offer yet. That is the normal
  // first-publish path; other 404s and permission errors remain actionable.
  const offerMissing = isMissingOfferResponse(existingResponse.status, existingBody.errors);
  if (!existingResponse.ok && !offerMissing) throw new Error(existingBody.errors?.[0]?.longMessage || existingBody.errors?.[0]?.message || `eBay-Angebotssuche: HTTP ${existingResponse.status}`);
  const existing = existingBody.offers?.[0];
  if (existing?.listing?.listingId || existing?.listingId) {
    const itemId = String(existing.listing?.listingId || existing.listingId);
    await updateEbayListing({ userId: input.userId, storeId: input.storeId, itemId, sku, price: input.price, quantity });
    return {
      sku,
      offerId: String(existing.offerId || ""),
      itemId,
      price: input.price,
      quantity,
    };
  }
  // A previous attempt may have created an unpublished offer. Update its inventory
  // item only after confirming it is not already live; published listings use the
  // price/quantity endpoint above and must not be rewritten as a new inventory item.
  await inventoryRequest(token, `/inventory_item/${encodeURIComponent(sku)}`, {
    method: "PUT",
    body: JSON.stringify(item),
  });
  const offer = {
    sku,
    marketplaceId: "EBAY_DE",
    format: "FIXED_PRICE",
    availableQuantity: quantity,
    categoryId,
    listingDuration: "GTC",
    merchantLocationKey,
    listingDescription,
    listingPolicies: { fulfillmentPolicyId, paymentPolicyId, returnPolicyId },
    pricingSummary: { price: { currency: "EUR", value: input.price.toFixed(2) } },
  };
  const offerResult = existing?.offerId
    ? await inventoryRequest(token, `/offer/${encodeURIComponent(existing.offerId)}`, { method: "PUT", body: JSON.stringify(offer) })
    : await inventoryRequest(token, "/offer", { method: "POST", body: JSON.stringify(offer) });
  const offerId = String(offerResult.offerId || existing?.offerId || "");
  if (!offerId) throw new Error("eBay hat keine Angebots-ID zurückgegeben.");
  const published = await inventoryRequest(token, `/offer/${encodeURIComponent(offerId)}/publish`, { method: "POST" }) as {
    listingId?: string;
  };
  let itemId = String(published.listingId || "");
  if (!itemId) {
    const savedOffer = await inventoryRequest(token, `/offer/${encodeURIComponent(offerId)}`) as {
      listing?: { listingId?: string };
      listingId?: string;
    };
    itemId = String(savedOffer.listing?.listingId || savedOffer.listingId || "");
  }
  if (!/^[0-9]{9,15}$/.test(itemId)) throw new Error("eBay hat das Angebot verarbeitet, aber keine gültige Item-ID zurückgegeben.");
  return { sku, offerId, itemId, price: input.price, quantity };
}

async function inventoryOffer(token: string, sku: string, itemId: string): Promise<{ offerId: string } | null> {
  const response = await fetch(`${apiOrigin}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Accept-Language": "de-DE", "Content-Language": "de-DE", "X-EBAY-C-MARKETPLACE-ID": "EBAY_DE" },
    cache: "no-store", signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 404) return null;
  const body = await response.json().catch(() => ({})) as { offers?: Array<{ offerId?: string; listing?: { listingId?: string }; listingId?: string }>; errors?: Array<{ message?: string }> };
  if (!response.ok) throw new Error(body.errors?.[0]?.message || `eBay-Angebotssuche: HTTP ${response.status}`);
  const offer = body.offers?.find((entry) => (entry.listing?.listingId || entry.listingId) === itemId);
  return offer?.offerId ? { offerId: offer.offerId } : null;
}

async function reviseTrading(token: string, itemId: string, price: number | null, quantity: number) {
  if (!/^[0-9]{9,15}$/.test(itemId)) throw new Error("eBay Item ID ist ungültig.");
  const body = `<?xml version="1.0" encoding="utf-8"?><ReviseInventoryStatusRequest xmlns="urn:ebay:apis:eBLBaseComponents"><InventoryStatus><ItemID>${itemId}</ItemID>${price === null ? "" : `<StartPrice>${price.toFixed(2)}</StartPrice>`}<Quantity>${quantity}</Quantity></InventoryStatus></ReviseInventoryStatusRequest>`;
  const response = await fetch(`${apiOrigin}/ws/api.dll`, {
    method: "POST", headers: { "Content-Type": "text/xml", "X-EBAY-API-CALL-NAME": "ReviseInventoryStatus", "X-EBAY-API-SITEID": "77", "X-EBAY-API-COMPATIBILITY-LEVEL": "1423", "X-EBAY-API-IAF-TOKEN": token }, body,
    cache: "no-store", signal: AbortSignal.timeout(25_000),
  });
  const xml = await response.text();
  const ack = xml.match(/<Ack>([^<]+)<\/Ack>/i)?.[1];
  if (!response.ok || !["Success", "Warning"].includes(ack || "")) {
    const message = xml.match(/<LongMessage>([\s\S]*?)<\/LongMessage>/i)?.[1]?.replace(/<[^>]+>/g, "") || `HTTP ${response.status}`;
    throw new Error(`eBay Trading: ${message.slice(0, 300)}`);
  }
}

async function tradingItem(token: string, itemId: string) {
  if (!/^[0-9]{9,15}$/.test(itemId)) throw new Error("eBay Item ID ist ungültig.");
  const body = `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${itemId}</ItemID></GetItemRequest>`;
  const response = await fetch(`${apiOrigin}/ws/api.dll`, {
    method: "POST", headers: { "Content-Type": "text/xml", "X-EBAY-API-CALL-NAME": "GetItem", "X-EBAY-API-SITEID": "77", "X-EBAY-API-COMPATIBILITY-LEVEL": "1423", "X-EBAY-API-IAF-TOKEN": token }, body,
    cache: "no-store", signal: AbortSignal.timeout(25_000),
  });
  const xml = await response.text();
  const ack = xml.match(/<Ack>([^<]+)<\/Ack>/i)?.[1];
  if (!response.ok || !["Success", "Warning"].includes(ack || "")) {
    const message = xml.match(/<LongMessage>([\s\S]*?)<\/LongMessage>/i)?.[1] || `HTTP ${response.status}`;
    throw new Error(`eBay GetItem: ${message.slice(0, 300)}`);
  }
  const sku = xml.match(/<SKU>([^<]*)<\/SKU>/i)?.[1] || "";
  const priceMatch = xml.match(/<CurrentPrice[^>]*currencyID="([A-Z]{3})"[^>]*>([0-9.]+)<\/CurrentPrice>/i)
    || xml.match(/<StartPrice[^>]*currencyID="([A-Z]{3})"[^>]*>([0-9.]+)<\/StartPrice>/i);
  if (!priceMatch || priceMatch[1] !== "EUR") throw new Error("eBay-Preis fehlt oder ist nicht in EUR.");
  const price = Number(priceMatch[2]);
  const available = xml.match(/<QuantityAvailable>(\d+)<\/QuantityAvailable>/i)?.[1];
  const total = Number(xml.match(/<Quantity>(\d+)<\/Quantity>/i)?.[1] || 0);
  const sold = Number(xml.match(/<QuantitySold>(\d+)<\/QuantitySold>/i)?.[1] || 0);
  return { sku, price, quantity: available === undefined ? Math.max(0, total - sold) : Number(available) };
}

export async function fetchEbayListing(userId: string, itemId: string, fallbackSku: string) {
  if (await legacyBridgeFor(userId)) {
    const body = await bridgeRequest("/ebay/active-listings") as { listings?: Array<{ listingId?: string; sku?: string; source?: string; price?: string; quantity?: number }> };
    const listing = body.listings?.find((entry) => entry.listingId === itemId);
    if (!listing || listing.source === "bridge-fallback") throw new Error("Aktives eBay-Angebot konnte nicht zuverlässig gelesen werden.");
    const price = Number(listing.price);
    if (!Number.isFinite(price) || price <= 0) throw new Error("eBay-Angebotspreis ist ungültig.");
    return { sku: listing.sku || fallbackSku, price, quantity: Number(listing.quantity || 0) };
  }
  const token = await sellerToken(userId);
  const item = await tradingItem(token, itemId);
  const sku = item.sku || fallbackSku;
  const offer = await inventoryOffer(token, sku, itemId);
  if (offer) {
    const data = await inventoryRequest(token, `/offer/${encodeURIComponent(offer.offerId)}`) as { pricingSummary?: { price?: { currency?: string; value?: string } }; availableQuantity?: number };
    const price = Number(data.pricingSummary?.price?.value);
    if (data.pricingSummary?.price?.currency !== "EUR" || !Number.isFinite(price)) throw new Error("eBay Inventory-Preis ist ungültig.");
    return { sku, price, quantity: Number(data.availableQuantity ?? item.quantity) };
  }
  return { sku, price: item.price, quantity: item.quantity };
}

export async function updateEbayListing(input: { userId: string; storeId?: string; itemId: string; sku: string; price: number; quantity: number }) {
  if (await legacyBridgeFor(input.userId)) {
    await bridgeRequest("/ebay/active-listings/update", { method: "POST", body: JSON.stringify({ listingId: input.itemId, sku: input.sku, price: input.price, quantity: input.quantity }) });
    return;
  }
  const token = await sellerToken(input.userId, input.storeId);
  // Inventory-model listings cannot be revised via Trading. Resolve the offer first.
  const offer = await inventoryOffer(token, input.sku, input.itemId);
  if (offer) {
    const request = { requests: [{ sku: input.sku, shipToLocationAvailability: { quantity: input.quantity }, offers: [{ offerId: offer.offerId, availableQuantity: input.quantity, price: { currency: "EUR", value: input.price.toFixed(2) } }] }] };
    const result = await inventoryRequest(token, "/bulk_update_price_quantity", { method: "POST", body: JSON.stringify(request) }) as { responses?: Array<{ statusCode?: number; errors?: Array<{ message?: string }>; offers?: Array<{ statusCode?: number; errors?: Array<{ message?: string }> }> }> };
    const failed = result.responses?.find((row) => !row.statusCode || row.statusCode < 200 || row.statusCode >= 300);
    if (!result.responses?.length || failed) {
      throw new Error(failed?.errors?.[0]?.message || "eBay Inventory-Update fehlgeschlagen.");
    }
  } else {
    await reviseTrading(token, input.itemId, input.price, input.quantity);
  }
}

export async function endEbayListing(userId: string, itemId: string, sku: string) {
  if (await legacyBridgeFor(userId)) throw new Error("Das verbundene eBay-Konto unterstützt das Beenden von Angeboten über die Bridge nicht.");
  const token = await sellerToken(userId);
  const offer = await inventoryOffer(token, sku, itemId);
  if (offer) {
    await inventoryRequest(token, `/offer/${encodeURIComponent(offer.offerId)}/withdraw`, { method: "POST" });
    return;
  }
  if (!/^[0-9]{9,15}$/.test(itemId)) throw new Error("eBay Item ID ist ungültig.");
  const body = `<?xml version="1.0" encoding="utf-8"?><EndItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${itemId}</ItemID><EndingReason>NotAvailable</EndingReason></EndItemRequest>`;
  const response = await fetch(`${apiOrigin}/ws/api.dll`, {
    method: "POST", headers: { "Content-Type": "text/xml", "X-EBAY-API-CALL-NAME": "EndItem", "X-EBAY-API-SITEID": "77", "X-EBAY-API-COMPATIBILITY-LEVEL": "1423", "X-EBAY-API-IAF-TOKEN": token }, body,
    cache: "no-store", signal: AbortSignal.timeout(25_000),
  });
  const xml = await response.text();
  const ack = xml.match(/<Ack>([^<]+)<\/Ack>/i)?.[1];
  if (!response.ok || !["Success", "Warning"].includes(ack || "")) {
    const message = xml.match(/<LongMessage>([\s\S]*?)<\/LongMessage>/i)?.[1]?.replace(/<[^>]+>/g, "") || `HTTP ${response.status}`;
    throw new Error(`eBay-Angebot konnte nicht beendet werden: ${message.slice(0, 300)}`);
  }
}
