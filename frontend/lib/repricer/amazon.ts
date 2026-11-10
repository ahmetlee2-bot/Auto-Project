import "server-only";
import { load } from "cheerio";

export type AmazonMarketplace = "AMZ_DE" | "AMZ_US";
export type AmazonSnapshot = { price: number | null; inStock: boolean; title?: string; imageUrl?: string };
export type AmazonProductDetails = {
  asin: string;
  marketplace: AmazonMarketplace;
  title: string;
  brand: string | null;
  description: string;
  price: number;
  currency: "EUR" | "USD";
  shipping: number;
  inStock: boolean;
  images: string[];
  itemSpecifics: Record<string, string[]>;
};

type Money = { value?: number | string; currency?: string };
type RainforestProduct = {
  asin?: string;
  title?: string;
  brand?: string;
  description?: string;
  main_image?: { link?: string } | string;
  images?: Array<{ link?: string }>;
  feature_bullets?: Array<{ text?: string }>;
  specifications?: Array<{ name?: string; value?: string }>;
  buybox_winner?: { price?: Money; availability?: { type?: string }; shipping?: Money };
};

const MARKETPLACE_CONFIG: Record<AmazonMarketplace, { domain: "amazon.de" | "amazon.com"; currency: "EUR" | "USD"; language: string }> = {
  AMZ_DE: { domain: "amazon.de", currency: "EUR", language: "de-DE,de;q=0.9,en;q=0.6" },
  AMZ_US: { domain: "amazon.com", currency: "USD", language: "en-US,en;q=0.9" },
};

export function parseAsin(value: string): string {
  const raw = value.trim();
  if (/^[A-Z0-9]{10}$/i.test(raw)) return raw.toUpperCase();
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("Gib eine gültige Amazon.de- oder Amazon.com-URL beziehungsweise ASIN ein."); }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "amazon.de" && host !== "amazon.com") throw new Error("Es werden nur Amazon.de- und Amazon.com-Produkte unterstützt.");
  const match = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i);
  if (!match) throw new Error("Die ASIN wurde in der Amazon-URL nicht gefunden.");
  return match[1].toUpperCase();
}

export async function fetchAmazonSnapshot(asin: string): Promise<AmazonSnapshot> {
  const product = await fetchAmazonProductDetails(asin, "AMZ_DE");
  return { price: product.price, inStock: product.inStock, title: product.title, imageUrl: product.images[0] };
}

let providerDisabledUntil = 0;
let desktopAgent = 0;
const desktopAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
];

/** Direct scraper is primary; Rainforest is only used if explicitly enabled and never blocks on 402/403. */
export async function fetchAmazonProductDetails(asin: string, marketplace: AmazonMarketplace): Promise<AmazonProductDetails> {
  if (!/^[A-Z0-9]{10}$/i.test(asin)) throw new Error("Die ASIN muss aus zehn Buchstaben oder Ziffern bestehen.");
  const normalizedAsin = asin.toUpperCase();
  const apiKey = process.env.RAINFOREST_API_KEY?.trim();
  const rainforestEnabled = process.env.RAINFOREST_ENABLED === "true";
  if (rainforestEnabled && apiKey && Date.now() >= providerDisabledUntil) {
    try { return await fetchRainforestProduct(normalizedAsin, marketplace, apiKey); }
    catch {
      providerDisabledUntil = Date.now() + 6 * 60 * 60_000;
    }
  }
  return fetchPublicProductPage(normalizedAsin, marketplace);
}

async function fetchRainforestProduct(asin: string, marketplace: AmazonMarketplace, apiKey: string): Promise<AmazonProductDetails> {
  const config = MARKETPLACE_CONFIG[marketplace];
  const url = new URL("https://api.rainforestapi.com/request");
  url.search = new URLSearchParams({ api_key: apiKey, type: "product", amazon_domain: config.domain, asin }).toString();
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  const body = await response.json().catch(() => null) as {
    request_info?: { success?: boolean; message?: string };
    product?: RainforestProduct;
  } | null;
  const product = body?.product;
  if (!response.ok || !body?.request_info?.success || !product?.title) {
    throw new Error(`Amazon-Datenanbieter: HTTP ${response.status}: ${body?.request_info?.message || "Produktdaten fehlen"}`);
  }
  if (product.asin && product.asin.toUpperCase() !== asin) throw new Error("Amazon lieferte eine andere ASIN; Import abgebrochen.");

  const priceValue = Number(product.buybox_winner?.price?.value);
  const currency = product.buybox_winner?.price?.currency || config.currency;
  const inStock = parseAvailability(product.buybox_winner?.availability?.type);
  if (inStock === null) throw new Error("Der Bestand ist nicht eindeutig; das Produkt wurde nicht als verfügbar markiert.");
  if (!Number.isFinite(priceValue) || priceValue <= 0 || currency !== config.currency) {
    throw new Error(`Der aktuelle Amazon-Preis fehlt oder ist nicht in ${config.currency}.`);
  }

  const mainImage = typeof product.main_image === "string" ? product.main_image : product.main_image?.link;
  const images = uniqueHttpsImages([mainImage, ...(product.images || []).map((image) => image.link)]);
  const bullets = (product.feature_bullets || []).map((bullet) => String(bullet.text || "").trim()).filter(Boolean).slice(0, 15);
  const itemSpecifics = Object.fromEntries((product.specifications || []).filter((entry) => entry.name && entry.value)
    .slice(0, 50).map((entry) => [String(entry.name).slice(0, 80), [String(entry.value).slice(0, 200)]]));
  const shippingValue = Number(product.buybox_winner?.shipping?.value ?? 0);

  return {
    asin,
    marketplace,
    title: product.title.trim().slice(0, 200),
    brand: product.brand?.trim() || null,
    description: (bullets.join("\n") || String(product.description || "")).slice(0, 50_000),
    price: roundMoney(priceValue),
    currency: config.currency,
    shipping: Number.isFinite(shippingValue) && shippingValue > 0 ? roundMoney(shippingValue) : 0,
    inStock,
    images,
    itemSpecifics,
  };
}

async function fetchPublicProductPage(asin: string, marketplace: AmazonMarketplace): Promise<AmazonProductDetails> {
  const config = MARKETPLACE_CONFIG[marketplace];
  const response = await fetch(`https://www.${config.domain}/dp/${asin}`, {
    headers: {
      "User-Agent": desktopAgents[desktopAgent++ % desktopAgents.length],
      "Accept-Language": config.language,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Amazon ${config.domain} antwortete mit HTTP ${response.status}; es wurden keine Produktdaten gespeichert.`);

  const html = await response.text();
  if (/<title>[^<]*robot check|<form[^>]*validateCaptcha|automatisierte zugriffe|enter the characters you see/i.test(html)) {
    throw new Error(`Amazon ${config.domain} hat die Anfrage blockiert. Ohne Rainforest-Key werden Captcha- oder Robot-Checks nicht umgangen.`);
  }
  const landedAsin = response.url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|\?|$)/i)?.[1];
  if (landedAsin && landedAsin.toUpperCase() !== asin) throw new Error("Amazon leitete auf eine andere ASIN weiter; Import abgebrochen.");

  const jsonProducts = readJsonLdProducts(html);
  const $ = load(html);
  const product = jsonProducts.find((item) => item.type.includes("Product"));
  const offers = Array.isArray(product?.offers) ? product?.offers[0] : product?.offers;
  const title = extractById(html, "productTitle") || stringValue(product?.name) || metaContent(html, "og:title");
  if (!title) throw new Error(`Amazon ${config.domain} hat keinen lesbaren Produkttitel zurückgegeben.`);

  const stockFromJsonLd = parseAvailability(offers?.availability);
  const availabilityText = extractById(html, "availability");
  const buyBox = $("#desktop_qualifiedBuyBox");
  const hasBuyableOffer = buyBox.find('input#add-to-cart-button[type="submit"]:not([disabled])').length > 0
    && buyBox.find('input#buy-now-button[type="submit"]:not([disabled])').length > 0
    && Number(buyBox.find("select#quantity option:selected").val()) > 0;

  const offerCurrency = String(offers?.priceCurrency || config.currency).toUpperCase();
  let price = parseNumericPrice(offers?.price, config.currency);
  if (price === null) price = parseLocalizedPrice($("#corePrice_feature_div .a-price .a-offscreen, #corePriceDisplay_desktop_feature_div .a-price .a-offscreen, .a-price .a-offscreen").first().text(), config.currency);
  if (price === null) {
    const itempropPrice = html.match(/<[^>]*itemprop=["']price["'][^>]*content=["']([^"']+)["']/i)?.[1]
      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*itemprop=["']price["']/i)?.[1];
    price = parseNumericPrice(itempropPrice, config.currency);
  }
  if (price === null) {
    const priceCandidates = [
      extractById(html, "priceblock_ourprice"), extractById(html, "priceblock_dealprice"),
      extractById(html, "price_inside_buybox"), ...[...html.matchAll(/<span\b[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)].map((match) => stripHtml(match[1])),
    ];
    for (const candidate of priceCandidates) {
      price = parseLocalizedPrice(candidate || "", config.currency);
      if (price !== null) break;
    }
  }
  const inStock = stockFromJsonLd ?? parseAvailabilityText(availabilityText, marketplace) ?? (hasBuyableOffer ? true : (price !== null ? true : null));
  if (inStock === null) throw new Error("Amazon hat den Bestand nicht eindeutig angegeben; der Bestand bleibt unverändert.");
  if (inStock && (price === null || offerCurrency !== config.currency)) {
    throw new Error(`Amazon ${config.domain} hat keinen eindeutigen ${config.currency}-Preis zurückgegeben.`);
  }
  if (price === null) throw new Error(`Amazon ${config.domain} hat keinen Preis zurückgegeben; es wurden keine Produktdaten gespeichert.`);

  const images = parseAmazonImages(html, product?.image);
  const bullets = extractBulletPoints(html);
  const description = bullets.join("\n") || stringValue(product?.description) || metaContent(html, "description");
  const brand = extractBrand(html) || stringValue(product?.brand);
  const itemSpecifics = extractItemSpecifics(html);

  return {
    asin,
    marketplace,
    title: cleanText(title).slice(0, 200),
    brand: brand ? cleanText(brand).slice(0, 120) : null,
    description: cleanText(description).slice(0, 50_000),
    price: roundMoney(price),
    currency: config.currency,
    shipping: 0,
    inStock,
    images,
    itemSpecifics,
  };
}

type JsonLdProduct = {
  type: string[];
  name?: unknown;
  description?: unknown;
  image?: unknown;
  brand?: unknown;
  offers?: { price?: unknown; priceCurrency?: unknown; availability?: unknown } | Array<{ price?: unknown; priceCurrency?: unknown; availability?: unknown }>;
};

function readJsonLdProducts(html: string): JsonLdProduct[] {
  const output: JsonLdProduct[] = [];
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed: unknown = JSON.parse(decodeHtml(match[1]));
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of entries) {
        const graphValue = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>)["@graph"] : undefined;
        const graph = Array.isArray(graphValue) ? graphValue : [entry];
        for (const candidate of graph) {
          if (!candidate || typeof candidate !== "object") continue;
          const typeValue = (candidate as Record<string, unknown>)["@type"];
          const type = (Array.isArray(typeValue) ? typeValue : [typeValue]).filter((value): value is string => typeof value === "string");
          if (type.some((value) => value.toLowerCase().includes("product"))) output.push({ ...(candidate as object), type } as JsonLdProduct);
        }
      }
    } catch { /* Amazon pages sometimes contain partial or invalid JSON-LD. */ }
  }
  return output;
}

function parseAmazonImages(html: string, jsonLdImages: unknown): string[] {
  const candidates: Array<{ url: string; size: number }> = [];
  for (const match of html.matchAll(/\bdata-a-dynamic-image\s*=\s*(["'])([\s\S]*?)\1/gi)) {
    try {
      const imageMap = JSON.parse(decodeHtml(match[2])) as Record<string, unknown>;
      for (const [url, dimensions] of Object.entries(imageMap)) {
        const size = Array.isArray(dimensions) ? Number(dimensions[0]) * Number(dimensions[1]) : 0;
        candidates.push({ url, size: Number.isFinite(size) ? size : 0 });
      }
    } catch { /* Ignore malformed image metadata. */ }
  }
  for (const match of html.matchAll(/<img\b[^>]*\b(?:id=["'](?:landingImage|imgBlkFront)["'][^>]*|data-old-hires=["'][^"']+["'][^>]*)/gi)) {
    const tag = match[0];
    const src = tag.match(/\bdata-old-hires=["']([^"']+)["']/i)?.[1] || tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (src) candidates.push({ url: decodeHtml(src), size: 1 });
  }
  const ldImages = Array.isArray(jsonLdImages) ? jsonLdImages : [jsonLdImages];
  for (const item of ldImages) {
    const url = typeof item === "string" ? item : typeof item === "object" && item !== null ? String((item as { url?: unknown }).url || "") : "";
    if (url) candidates.push({ url, size: 0 });
  }
  const ogImage = metaContent(html, "og:image") || metaContent(html, "twitter:image");
  if (ogImage) candidates.push({ url: ogImage, size: 0 });
  candidates.sort((left, right) => right.size - left.size);
  return uniqueHttpsImages(candidates.map((item) => item.url));
}

function extractBulletPoints(html: string): string[] {
  const wrapper = html.match(/<div\b[^>]*id=["']feature-bullets["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || "";
  return [...wrapper.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => cleanText(stripHtml(match[1])))
    .filter((value) => value.length > 2 && !/^[\s\d.]+$/.test(value))
    .slice(0, 15);
}

function extractBrand(html: string): string | null {
  const byline = extractById(html, "bylineInfo");
  if (byline) return byline.replace(/^(Visit the|Marke:|Brand:|Besuche den)\s*/i, "").trim();
  const itemprop = html.match(/<[^>]*itemprop=["']brand["'][^>]*>([\s\S]*?)<\//i)?.[1];
  return itemprop ? cleanText(stripHtml(itemprop)) : null;
}

function extractItemSpecifics(html: string): Record<string, string[]> {
  const specifics: Record<string, string[]> = {};
  const section = html.match(/<div\b[^>]*id=["'](?:detailBullets_feature_div|prodDetails)["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || "";
  for (const row of section.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((cell) => cleanText(stripHtml(cell[1]))).filter(Boolean);
    if (cells.length >= 2 && cells[0].length <= 80 && cells[1].length <= 200) specifics[cells[0]] = [cells[1]];
  }
  return Object.fromEntries(Object.entries(specifics).slice(0, 50));
}

function extractById(html: string, id: string): string {
  return cleanText(load(html)(`[id="${id}"]`).first().text());
}

function metaContent(html: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tag = html.match(new RegExp(`<meta\\b(?=[^>]*(?:name|property)=["']${escaped}["'])[^>]*>`, "i"))?.[0] || "";
  return decodeHtml(tag.match(/\bcontent=["']([^"']*)["']/i)?.[1] || "");
}

function parseAvailability(value: unknown): boolean | null {
  const text = Array.isArray(value) ? value.join(" ") : String(value ?? "");
  if (!text) return null;
  if (/(?:^|\/)(?:OutOfStock|SoldOut|Discontinued|PreOrder|PreSale)$/i.test(text) || /out_of_stock|unavailable|sold.?out/i.test(text)) return false;
  if (/(?:^|\/)(?:InStock|LimitedAvailability|OnlineOnly)$/i.test(text) || /in_stock|available/i.test(text)) return true;
  return null;
}

function parseAvailabilityText(text: string, marketplace: AmazonMarketplace): boolean | null {
  if (!text) return null;
  if (marketplace === "AMZ_DE") {
    if (/nicht verfügbar|nicht auf lager|nicht lieferbar|ausverkauft/i.test(text)) return false;
    if (/auf lager|sofort lieferbar|auf lagerbestand|lieferbar/i.test(text)) return true;
  } else {
    if (/in stock|available to ship|usually ships/i.test(text)) return true;
    if (/currently unavailable|out of stock|temporarily out of stock/i.test(text)) return false;
  }
  return null;
}

function parseNumericPrice(value: unknown, currency: "EUR" | "USD"): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return roundMoney(value);
  return parseLocalizedPrice(String(value ?? ""), currency);
}

function parseLocalizedPrice(value: string, currency: "EUR" | "USD"): number | null {
  let normalized = decodeHtml(value).replace(/[^\d.,]/g, "");
  if (!normalized || !/\d/.test(normalized)) return null;
  if (currency === "EUR") {
    if (normalized.includes(",")) normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = normalized.replace(/,/g, "");
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? roundMoney(amount) : null;
}

function uniqueHttpsImages(candidates: unknown[]): string[] {
  const output: string[] = [];
  for (const candidate of candidates) {
    const value = typeof candidate === "string" ? decodeHtml(candidate.trim()) : "";
    if (!value || value.startsWith("data:")) continue;
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && /\.(?:jpe?g|png|webp)(?:$|\?)/i.test(url.pathname + url.search) && !output.includes(url.toString())) {
        output.push(url.toString());
      }
    } catch { /* Ignore malformed source image links. */ }
    if (output.length === 12) break;
  }
  return output;
}

function stripHtml(value: string): string {
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
}

function cleanText(value: string): string {
  return decodeHtml(value).replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, number: string) => String.fromCodePoint(Number(number)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&euro;/gi, "€").replace(/&pound;/gi, "£").replace(/&nbsp;/gi, " ");
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
