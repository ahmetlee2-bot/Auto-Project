import "server-only";

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { repricerAdmin } from "../repricer/admin";
import { enrichItemSpecificsWithGpsr } from "../compliance/gpsrEngine";

export const EBAY_OAUTH_COOKIE = "autolister_ebay_oauth_state";
export const EBAY_SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
  "https://api.ebay.com/oauth/api_scope/commerce.message",
].join(" ");

export type MarketplaceId = "EBAY_US" | "EBAY_DE" | "EBAY_GB" | "EBAY_AU" | "EBAY_CA" | "EBAY_FR" | "EBAY_IT" | "EBAY_ES";
export type StoreStatus = "active" | "token_expired" | "paused";

export type EbayStore = {
  id: string;
  user_id: string;
  store_name: string;
  seller_username: string | null;
  sku_prefix: string | null;
  marketplace_id: MarketplaceId;
  token_expires_at: string;
  refresh_token_expires_at: string | null;
  daily_listing_limit: number;
  auto_lister_enabled: boolean;
  auto_pull_from_depot: boolean;
  listing_interval_hours: number;
  default_margin_percent: number;
  merchant_location_key: string | null;
  fulfillment_policy_id: string | null;
  payment_policy_id: string | null;
  return_policy_id: string | null;
  status: StoreStatus;
  last_listed_at: string | null;
  scheduler_lease_until: string | null;
};

export type EbayStoreCredentials = EbayStore & { access_token: string; refresh_token: string };
type EbayTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
};

export function ebayApiOrigin(): string {
  return String(process.env.EBAY_ENV || "production").toLowerCase() === "sandbox"
    ? "https://api.sandbox.ebay.com"
    : "https://api.ebay.com";
}

export function ebayAuthOrigin(): string {
  return String(process.env.EBAY_ENV || "production").toLowerCase() === "sandbox"
    ? "https://auth.sandbox.ebay.com"
    : "https://auth.ebay.com";
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} sunucu ortamında tanımlı değil.`);
  return value;
}

function encryptionKey(): Buffer {
  const value = requiredEnv("EBAY_TOKEN_ENCRYPTION_KEY");
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("EBAY_TOKEN_ENCRYPTION_KEY 32 byte Base64 veya 64 karakter Hex olmalıdır.");
  return key;
}

export function encryptEbayToken(plainText: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptEbayToken(encrypted: string): string {
  const [version, ivText, tagText, ciphertextText] = encrypted.split(".");
  if (version !== "v1" || !ivText || !tagText || !ciphertextText) throw new Error("eBay OAuth token şifreli kayıt biçimi geçersiz.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8");
}

function stateSecret(): string {
  return requiredEnv("EBAY_OAUTH_STATE_SECRET");
}

export function signOAuthState(payload: string): string {
  return createHmac("sha256", stateSecret()).update(payload).digest("base64url");
}

export function verifyOAuthState(value: string, signature: string): boolean {
  const expected = Buffer.from(signOAuthState(value));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createOAuthNonce(): string {
  return randomBytes(32).toString("base64url");
}

export function createEbayAuthorizationUrl(nonce: string, marketplace: MarketplaceId): string {
  const clientId = process.env.EBAY_CLIENT_ID || process.env.EBAY_APP_ID;
  const ruName = process.env.EBAY_MULTI_STORE_RU_NAME || process.env.EBAY_RU_NAME;
  if (!clientId || !ruName) throw new Error("EBAY_CLIENT_ID ve EBAY_MULTI_STORE_RU_NAME eBay Developer Console ayarlarından gereklidir.");
  const url = new URL("/oauth2/authorize", ebayAuthOrigin());
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", ruName);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", EBAY_SCOPES);
  url.searchParams.set("state", `${marketplace}.${nonce}`);
  return url.toString();
}

export function allowedMarketplace(value: string | null | undefined): MarketplaceId {
  const allowed: MarketplaceId[] = ["EBAY_US", "EBAY_DE", "EBAY_GB", "EBAY_AU", "EBAY_CA", "EBAY_FR", "EBAY_IT", "EBAY_ES"];
  const marketplace = String(value || "EBAY_DE").toUpperCase() as MarketplaceId;
  if (!allowed.includes(marketplace)) throw new Error("Desteklenmeyen eBay pazaryeri.");
  return marketplace;
}

export type EbayBusinessPolicySnapshot = {
  fulfillmentPolicies: Array<Record<string, unknown>>;
  paymentPolicies: Array<Record<string, unknown>>;
  returnPolicies: Array<Record<string, unknown>>;
};

export async function ensureSellingPolicyManagement(accessToken: string, marketplace: MarketplaceId): Promise<EbayBusinessPolicySnapshot> {
  const language = marketplace === "EBAY_DE" ? "de-DE" : marketplace === "EBAY_GB" ? "en-GB" : marketplace === "EBAY_US" ? "en-US" : "en";
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    "Accept-Language": language,
    "Content-Language": language,
    "X-EBAY-C-MARKETPLACE-ID": marketplace,
  };
  const request = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${ebayApiOrigin()}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers || {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const first = Array.isArray(body.errors) ? body.errors[0] as Record<string, unknown> | undefined : undefined;
      const message = [first?.longMessage, first?.message].map((item) => String(item || "").trim()).find((item) => item.length > 2 && item !== ".");
      throw new Error(message || `eBay seller setup returned HTTP ${response.status}.`);
    }
    return body;
  };
  const getPrograms = () => request("/sell/account/v1/program/get_opted_in_programs");
  const isEnrolled = (body: Record<string, unknown>) => Array.isArray(body.programs)
    && body.programs.some((item) => item && typeof item === "object" && (item as Record<string, unknown>).programType === "SELLING_POLICY_MANAGEMENT");
  const programs = await getPrograms();
  if (!isEnrolled(programs)) {
    await request("/sell/account/v1/program/opt_in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programType: "SELLING_POLICY_MANAGEMENT" }),
    });
    if (!isEnrolled(await getPrograms())) throw new Error("eBay Selling Policy Management enrollment could not be confirmed.");
  }
  const marketplaceQuery = `marketplace_id=${encodeURIComponent(marketplace)}`;
  const [fulfillment, payment, returns] = await Promise.all([
    request(`/sell/account/v1/fulfillment_policy?${marketplaceQuery}`),
    request(`/sell/account/v1/payment_policy?${marketplaceQuery}`),
    request(`/sell/account/v1/return_policy?${marketplaceQuery}`),
  ]);
  const rows = (value: unknown): Array<Record<string, unknown>> => Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
  return {
    fulfillmentPolicies: rows(fulfillment.fulfillmentPolicies),
    paymentPolicies: rows(payment.paymentPolicies),
    returnPolicies: rows(returns.returnPolicies),
  };
}

export async function ensureStoreListingSetup(store: EbayStoreCredentials): Promise<Pick<EbayStore, "merchant_location_key" | "fulfillment_policy_id" | "payment_policy_id" | "return_policy_id">> {
  const token = await validEbayToken(store.id, store.user_id);
  const [policies, locationResponse] = await Promise.all([
    ensureSellingPolicyManagement(token, store.marketplace_id),
    ebayApiRequest<{ locations?: Array<Record<string, unknown>> }>(store, "/sell/inventory/v1/location?limit=100&offset=0", "GET"),
  ]);
  const locations = Array.isArray(locationResponse.locations) ? locationResponse.locations : [];
  const uniqueId = (rows: Array<Record<string, unknown>>, field: string) => rows.length === 1 ? String(rows[0][field] || "").trim() || null : null;
  const updates: Partial<Pick<EbayStore, "merchant_location_key" | "fulfillment_policy_id" | "payment_policy_id" | "return_policy_id">> = {};
  if (!store.merchant_location_key) updates.merchant_location_key = uniqueId(locations, "merchantLocationKey");
  if (!store.fulfillment_policy_id) updates.fulfillment_policy_id = uniqueId(policies.fulfillmentPolicies, "fulfillmentPolicyId");
  if (!store.payment_policy_id) updates.payment_policy_id = uniqueId(policies.paymentPolicies, "paymentPolicyId");
  if (!store.return_policy_id) updates.return_policy_id = uniqueId(policies.returnPolicies, "returnPolicyId");
  for (const key of Object.keys(updates) as Array<keyof typeof updates>) if (!updates[key]) delete updates[key];
  if (Object.keys(updates).length) {
    const { error } = await repricerAdmin().from("ebay_stores").update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", store.id).eq("user_id", store.user_id);
    if (error) throw new Error(`eBay mağaza ayarları kaydedilemedi: ${error.message}`);
    Object.assign(store, updates);
  }
  const missing = [
    ["merchant_location_key", store.merchant_location_key],
    ["fulfillment_policy_id", store.fulfillment_policy_id],
    ["payment_policy_id", store.payment_policy_id],
    ["return_policy_id", store.return_policy_id],
  ].filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) {
    throw new Error(`eBay bağlantısı ve izinleri hazır. Bu mağaza için eksik ayarlar: ${missing.join(", ")}. eBay hesabında gerçek mağaza adresini ve iş politikalarını bir kez tanımlayın.`);
  }
  return {
    merchant_location_key: store.merchant_location_key,
    fulfillment_policy_id: store.fulfillment_policy_id,
    payment_policy_id: store.payment_policy_id,
    return_policy_id: store.return_policy_id,
  };
}

export function marketplaceCurrency(marketplaceId: MarketplaceId): string {
  if (["EBAY_US"].includes(marketplaceId)) return "USD";
  if (["EBAY_GB"].includes(marketplaceId)) return "GBP";
  if (["EBAY_AU"].includes(marketplaceId)) return "AUD";
  if (["EBAY_CA"].includes(marketplaceId)) return "CAD";
  return "EUR";
}

function oauthCredentials(): { clientId: string; clientSecret: string; ruName: string } {
  const clientId = process.env.EBAY_CLIENT_ID || process.env.EBAY_APP_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET || process.env.EBAY_CERT_ID;
  const ruName = process.env.EBAY_MULTI_STORE_RU_NAME || process.env.EBAY_RU_NAME;
  if (!clientId || !clientSecret || !ruName) throw new Error("eBay OAuth istemci bilgileri sunucuda eksik.");
  return { clientId, clientSecret, ruName };
}

export async function exchangeAuthorizationCode(code: string): Promise<EbayTokenResponse> {
  const { clientId, clientSecret, ruName } = oauthCredentials();
  const response = await fetch(`${ebayApiOrigin()}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: ruName }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({})) as Partial<EbayTokenResponse> & { error_description?: string; error?: string };
  if (!response.ok || !body.access_token || !body.refresh_token) throw new Error(body.error_description || body.error || `eBay OAuth HTTP ${response.status}`);
  return body as EbayTokenResponse;
}

export async function validEbayToken(storeId: string, userId: string): Promise<string> {
  const admin = repricerAdmin();
  const { data, error } = await admin.from("ebay_stores").select("*").eq("id", storeId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("eBay mağazası bu kullanıcıya ait değil veya bulunamadı.");
  const store = data as EbayStoreCredentials;
  if (store.status === "paused") throw new Error("Bu eBay mağazası duraklatılmış.");
  if (new Date(store.token_expires_at).getTime() > Date.now() + 5 * 60_000) return decryptEbayToken(store.access_token);
  if (store.refresh_token_expires_at && new Date(store.refresh_token_expires_at).getTime() <= Date.now()) {
    await admin.from("ebay_stores").update({ status: "token_expired" }).eq("id", storeId).eq("user_id", userId);
    throw new Error("eBay yenileme izninin süresi dolmuş. Mağazayı yeniden bağlayın.");
  }

  const { clientId, clientSecret } = oauthCredentials();
  const response = await fetch(`${ebayApiOrigin()}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    // Omitting scope preserves each seller's existing consent set; expanded
    // scopes take effect only after the seller reconnects and consents again.
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: decryptEbayToken(store.refresh_token) }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({})) as Partial<EbayTokenResponse> & { error_description?: string; error?: string };
  if (!response.ok || !body.access_token) {
    await admin.from("ebay_stores").update({ status: "token_expired" }).eq("id", storeId).eq("user_id", userId);
    throw new Error(body.error_description || body.error || `eBay token yenileme isteği HTTP ${response.status} ile başarısız oldu.`);
  }
  const patch: Record<string, unknown> = {
    access_token: encryptEbayToken(body.access_token),
    token_expires_at: new Date(Date.now() + Number(body.expires_in || 7200) * 1000).toISOString(),
    status: "active",
  };
  if (body.refresh_token) patch.refresh_token = encryptEbayToken(body.refresh_token);
  if (body.refresh_token_expires_in) patch.refresh_token_expires_at = new Date(Date.now() + Number(body.refresh_token_expires_in) * 1000).toISOString();
  const { error: saveError } = await admin.from("ebay_stores").update(patch).eq("id", storeId).eq("user_id", userId);
  if (saveError) throw saveError;
  return body.access_token;
}

export async function ebayApiRequest<T>(store: Pick<EbayStore, "id" | "user_id" | "marketplace_id">, path: string, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("eBay API path geçersiz.");
  const token = await validEbayToken(store.id, store.user_id);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "X-EBAY-C-MARKETPLACE-ID": store.marketplace_id,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${ebayApiOrigin()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) as unknown : null;
  if (!response.ok) {
    const message = typeof data === "object" && data !== null && "errors" in data && Array.isArray(data.errors)
      ? String((data.errors[0] as { message?: string }).message || "")
      : `eBay API HTTP ${response.status}`;
    throw new Error(message || `eBay API HTTP ${response.status}`);
  }
  return data as T;
}

export async function fetchSellerUsername(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch(`${ebayApiOrigin()}/commerce/identity/v1/user/`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) {
      const body = await response.json() as { username?: string };
      if (body.username?.trim()) return body.username.trim();
    }
  } catch { /* The Identity API is not enabled for every eBay application. */ }
  try {
    const response = await fetch(`${ebayApiOrigin()}/ws/api.dll`, {
      method: "POST",
      headers: { "Content-Type": "text/xml", "X-EBAY-API-CALL-NAME": "GetUser", "X-EBAY-API-SITEID": "77", "X-EBAY-API-COMPATIBILITY-LEVEL": "1423", "X-EBAY-API-IAF-TOKEN": accessToken },
      body: '<?xml version="1.0" encoding="utf-8"?><GetUserRequest xmlns="urn:ebay:apis:eBLBaseComponents"><DetailLevel>ReturnSummary</DetailLevel></GetUserRequest>',
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const xml = await response.text();
    if (!/<Ack>(?:Success|Warning)<\/Ack>/i.test(xml)) return null;
    return xml.match(/<UserID>([^<]+)<\/UserID>/i)?.[1]?.trim().replace(/&amp;/g, "&") || null;
  } catch { return null; }
}

export function createInventorySku(storeId: string, asin: string): string {
  return `AL${storeId.replaceAll("-", "").slice(0, 10)}${asin.toUpperCase()}`;
}

export async function publishPoolProduct(input: {
  store: EbayStoreCredentials;
  product: {
    asin: string;
    title: string;
    description: string;
    category_id: string | null;
    images: string[];
    item_specifics: Record<string, string[]>;
    condition: string;
  };
  targetPrice: number;
}): Promise<{ sku: string; offerId: string; ebayItemId: string }> {
  const { store, product, targetPrice } = input;
  const setup = await ensureStoreListingSetup(store);
  const locationKey = setup.merchant_location_key as string;
  const fulfillmentPolicyId = setup.fulfillment_policy_id as string;
  const paymentPolicyId = setup.payment_policy_id as string;
  const returnPolicyId = setup.return_policy_id as string;
  if (!product.category_id) throw new Error("Ürün için eBay kategori kimliği gerekli.");
  if (!product.images.length) throw new Error("Yayınlamak için en az bir ürün görseli gerekli.");
  const sku = createInventorySku(store.id, product.asin);
  const aspects = enrichItemSpecificsWithGpsr(product.item_specifics || {}, {
    title: product.title,
    asin: product.asin,
    categoryId: product.category_id,
  });
  await ebayApiRequest(store, `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, "PUT", {
    availability: { shipToLocationAvailability: { quantity: 1 } },
    condition: product.condition || "NEW",
    product: {
      title: product.title.slice(0, 80),
      description: product.description,
      imageUrls: product.images.slice(0, 12),
      aspects,
    },
  });
  const offerPayload = {
    sku,
    marketplaceId: store.marketplace_id,
    format: "FIXED_PRICE",
    listingDuration: "GTC",
    availableQuantity: 1,
    categoryId: product.category_id,
    merchantLocationKey: locationKey,
    listingDescription: product.description,
    listingPolicies: { fulfillmentPolicyId, paymentPolicyId, returnPolicyId },
    pricingSummary: { price: { currency: marketplaceCurrency(store.marketplace_id), value: targetPrice.toFixed(2) } },
  };
  const existingOffers = await ebayApiRequest<{ offers?: Array<{ offerId?: string; status?: string; listingId?: string }> }>(
    store,
    `/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}&marketplace_id=${encodeURIComponent(store.marketplace_id)}`,
    "GET",
  );
  const existingOffer = existingOffers.offers?.find((candidate) => candidate.offerId);
  if (existingOffer?.status === "PUBLISHED" && existingOffer.listingId) {
    return { sku, offerId: existingOffer.offerId as string, ebayItemId: existingOffer.listingId };
  }
  const offer = existingOffer?.offerId
    ? await ebayApiRequest<{ offerId?: string }>(store, `/sell/inventory/v1/offer/${encodeURIComponent(existingOffer.offerId)}`, "PUT", offerPayload)
    : await ebayApiRequest<{ offerId?: string }>(store, "/sell/inventory/v1/offer", "POST", offerPayload);
  const offerId = offer.offerId || existingOffer?.offerId;
  if (!offerId) throw new Error("eBay API teklif oluşturdu ancak offerId döndürmedi.");
  const published = await ebayApiRequest<{ listingId?: string }>(store, `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`, "POST");
  if (!published.listingId) throw new Error("eBay API yayını doğrulayamadı; listingId dönmedi.");
  return { sku, offerId, ebayItemId: published.listingId };
}

export function computeSuggestedPrice(sourcePrice: number, shipping: number, marginPercent: number): number {
  const fees = 0.15;
  const result = ((sourcePrice + shipping) * (1 + marginPercent / 100)) / (1 - fees);
  return Math.ceil((result - Number.EPSILON) * 100) / 100;
}

export function safeStore(store: EbayStore): Omit<EbayStore, "scheduler_lease_until"> {
  const { scheduler_lease_until: _lease, ...safe } = store;
  return safe;
}
