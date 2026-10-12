import "server-only";
import { repricerAdmin } from "./admin";

const apiOrigin = process.env.EBAY_ENV === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
const cache = new Map<string, { token: string; expires: number }>();

async function legacyBridgeFor(userId: string) {
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

async function sellerToken(userId: string): Promise<string> {
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
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json", "X-EBAY-C-MARKETPLACE-ID": "EBAY_DE", ...(init.headers || {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.errors?.[0]?.message || `eBay Inventory: HTTP ${response.status}`);
  return body;
}

async function inventoryOffer(token: string, sku: string, itemId: string): Promise<{ offerId: string } | null> {
  const response = await fetch(`${apiOrigin}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "X-EBAY-C-MARKETPLACE-ID": "EBAY_DE" },
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

export async function updateEbayListing(input: { userId: string; itemId: string; sku: string; price: number; quantity: number }) {
  if (await legacyBridgeFor(input.userId)) {
    await bridgeRequest("/ebay/active-listings/update", { method: "POST", body: JSON.stringify({ listingId: input.itemId, sku: input.sku, price: input.price, quantity: input.quantity }) });
    return;
  }
  const token = await sellerToken(input.userId);
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
