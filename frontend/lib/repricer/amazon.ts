import "server-only";

export type AmazonSnapshot = { price: number | null; inStock: boolean; title?: string; imageUrl?: string };

type Money = { value?: number | string; currency?: string };
type RainforestProduct = {
  asin?: string;
  title?: string;
  main_image?: { link?: string } | string;
  buybox_winner?: { price?: Money; availability?: { type?: string }; shipping?: Money };
};

export function parseAsin(value: string): string {
  const raw = value.trim();
  if (/^[A-Z0-9]{10}$/i.test(raw)) return raw.toUpperCase();
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("Gültige Amazon.de-URL oder ASIN eingeben."); }
  if (!/^(www\.)?amazon\.de$/.test(url.hostname)) throw new Error("Nur Amazon.de-Produkte werden unterstützt.");
  const match = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i);
  if (!match) throw new Error("ASIN in der Amazon.de-URL nicht gefunden.");
  return match[1].toUpperCase();
}

export async function fetchAmazonSnapshot(asin: string): Promise<AmazonSnapshot> {
  const key = process.env.RAINFOREST_API_KEY;
  if (!key) return fetchAmazonStructuredData(asin);
  const url = new URL("https://api.rainforestapi.com/request");
  url.search = new URLSearchParams({ api_key: key, type: "product", amazon_domain: "amazon.de", asin }).toString();
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(45_000) });
  const body = await response.json().catch(() => null) as { request_info?: { success?: boolean; message?: string }; product?: RainforestProduct } | null;
  if (!response.ok || !body?.request_info?.success || !body.product) {
    throw new Error(body?.request_info?.message || `Amazon-Datenanbieter: HTTP ${response.status}`);
  }
  const product = body.product;
  if (product.asin && product.asin.toUpperCase() !== asin) throw new Error("Amazon lieferte eine andere ASIN; Synchronisierung abgebrochen.");
  const availability = product.buybox_winner?.availability?.type?.toLowerCase();
  const inStock = availability === "in_stock" ? true : availability === "out_of_stock" ? false : null;
  if (inStock === null) throw new Error("Amazon-Bestand ist nicht eindeutig; eBay-Bestand bleibt unverändert.");
  const money = product.buybox_winner?.price;
  const price = money ? Number(money.value) : NaN;
  if (inStock && (money?.currency !== "EUR" || !Number.isFinite(price) || price <= 0)) {
    throw new Error("Amazon-Preis fehlt oder ist nicht in EUR; eBay-Angebot bleibt unverändert.");
  }
  const imageUrl = typeof product.main_image === "string" ? product.main_image : product.main_image?.link;
  return { price: Number.isFinite(price) && price > 0 && money?.currency === "EUR" ? price : null, inStock, title: product.title, imageUrl };
}

async function fetchAmazonStructuredData(asin: string): Promise<AmazonSnapshot> {
  const response = await fetch(`https://www.amazon.de/dp/${asin}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; AutoListerPriceMonitor/1.0)", "Accept-Language": "de-DE,de;q=0.9", Accept: "text/html" },
    cache: "no-store", signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Amazon.de: HTTP ${response.status}; Bestand bleibt unverändert.`);
  const html = await response.text();
  if (/captcha|robot check|automatisierte zugriffe/i.test(html)) throw new Error("Amazon hat die Abfrage blockiert; Bestand bleibt unverändert.");
  const landedAsin = response.url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|\?|$)/i)?.[1];
  if (landedAsin && landedAsin.toUpperCase() !== asin.toUpperCase()) throw new Error("Amazon leitete auf eine andere ASIN weiter.");
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const root = JSON.parse(match[1]);
      const entries = Array.isArray(root) ? root : [root];
      const product = entries.flatMap((entry) => entry?.["@graph"] || [entry]).find((entry) => entry?.["@type"] === "Product" || entry?.["@type"]?.includes?.("Product"));
      if (!product) continue;
      const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
      const availability = String(offer?.availability || "");
      const inStock = /(?:^|\/)InStock$/i.test(availability) ? true : /(?:^|\/)(?:OutOfStock|SoldOut|Discontinued)$/i.test(availability) ? false : null;
      if (inStock === null) continue;
      const price = Number(offer?.price);
      if (inStock && (offer?.priceCurrency !== "EUR" || !Number.isFinite(price) || price <= 0)) continue;
      const images = Array.isArray(product.image) ? product.image : [product.image];
      const firstImage = typeof images[0] === "string" ? images[0] : images[0]?.url;
      return { price: offer?.priceCurrency === "EUR" && Number.isFinite(price) && price > 0 ? price : null, inStock, title: String(product.name || ""), imageUrl: firstImage };
    } catch { /* Ignore malformed schema data and continue searching. */ }
  }
  throw new Error("Amazon-Preis oder Bestand nicht eindeutig; eBay-Angebot bleibt unverändert. Rainforest API als Datenanbieter konfigurieren.");
}
