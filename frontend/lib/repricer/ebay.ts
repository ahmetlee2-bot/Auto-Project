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

type EbaySetupOption = { id: string; name: string };
export type EbayListingSetup = {
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

async function sellerApiRequest(token: string, path: string) {
  const response = await fetch(`${apiOrigin}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_DE",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.errors?.[0]?.message || `eBay-Kontoeinstellungen: HTTP ${response.status}`);
  }
  return body;
}

export async function getEbayListingSetup(userId: string): Promise<EbayListingSetup> {
  if (await legacyBridgeFor(userId)) {
    throw new Error("Für eBay-Entwürfe muss das Verkäuferkonto direkt per eBay OAuth verbunden sein.");
  }
  const token = await sellerToken(userId);
  const [locations, fulfillment, payments, returns] = await Promise.all([
    sellerApiRequest(token, "/sell/inventory/v1/location?limit=100&offset=0"),
    sellerApiRequest(token, "/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_DE"),
    sellerApiRequest(token, "/sell/account/v1/payment_policy?marketplace_id=EBAY_DE"),
    sellerApiRequest(token, "/sell/account/v1/return_policy?marketplace_id=EBAY_DE"),
  ]);
  const mapOptions = (rows: unknown, idKey: string, nameKey: string): EbaySetupOption[] =>
    (Array.isArray(rows) ? rows : []).flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const item = row as Record<string, unknown>;
      const id = String(item[idKey] || "").trim();
      const name = String(item[nameKey] || id).trim();
      return id ? [{ id, name }] : [];
    });
  return {
    merchantLocations: mapOptions(locations.locations, "merchantLocationKey", "name"),
    fulfillmentPolicies: mapOptions(fulfillment.fulfillmentPolicies, "fulfillmentPolicyId", "name"),
    paymentPolicies: mapOptions(payments.paymentPolicies, "paymentPolicyId", "name"),
    returnPolicies: mapOptions(returns.returnPolicies, "returnPolicyId", "name"),
    defaults: {
      merchantLocationKey: process.env.EBAY_MERCHANT_LOCATION_KEY || "",
      fulfillmentPolicyId: process.env.EBAY_FULFILLMENT_POLICY_ID || "",
      paymentPolicyId: process.env.EBAY_PAYMENT_POLICY_ID || "",
      returnPolicyId: process.env.EBAY_RETURN_POLICY_ID || "",
      categoryId: process.env.EBAY_DEFAULT_CATEGORY_ID || "",
    },
  };
}

export async function publishEbayDraftProduct(input: {
  userId: string;
  id: string;
  title: string;
  descriptionHtml: string;
  images: string[];
  categoryId?: string | null;
  price: number;
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
  const token = await sellerToken(input.userId);
  const sku = `AL-${input.id}`;
  const quantity = 1;
  const listingDescription = input.descriptionHtml.slice(0, 50_000);
  const item = {
    availability: { shipToLocationAvailability: { quantity } },
    condition: "NEW",
    product: {
      title: input.title.slice(0, 80),
      description: listingDescription,
      imageUrls: input.images.slice(0, 12),
      aspects: {},
    },
  };
  const offerUrl = `${apiOrigin}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}&marketplace_id=EBAY_DE`;
  const existingResponse = await fetch(offerUrl, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "X-EBAY-C-MARKETPLACE-ID": "EBAY_DE" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const existingBody = await existingResponse.json().catch(() => ({})) as {
    offers?: Array<{ offerId?: string; listing?: { listingId?: string }; listingId?: string }>;
    errors?: Array<{ message?: string }>;
  };
  if (!existingResponse.ok) throw new Error(existingBody.errors?.[0]?.message || `eBay-Angebotssuche: HTTP ${existingResponse.status}`);
  const existing = existingBody.offers?.[0];
  if (existing?.listing?.listingId || existing?.listingId) {
    const itemId = String(existing.listing?.listingId || existing.listingId);
    await updateEbayListing({ userId: input.userId, itemId, sku, price: input.price, quantity });
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
