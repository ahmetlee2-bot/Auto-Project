const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require("sharp");
const { activatePromotion } = require("./promotion");
const { createRestError, createTradingError, payloadSummary, toPublicError } = require("./ebay_api_client");

const envFile = process.env.EBAY_ENV_FILE || path.join(process.env.LOCALAPPDATA || os.homedir(), "Alltaghaus", "ebay-bridge.env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}
const { authenticateRequest, isConfigured: supabaseConfigured } = require("./supabase");
const { deleteLegacyMapping, listLegacyMappings, recordApiError, upsertLegacyMapping } = require("./repositories");

const port = Number(process.env.PORT || 3210);
const bindHost = process.env.BRIDGE_BIND_HOST || "127.0.0.1";
const sharedSecret = String(process.env.BRIDGE_SHARED_SECRET || "");
if (bindHost !== "127.0.0.1" && bindHost !== "localhost" && !sharedSecret) {
  throw new Error("BRIDGE_SHARED_SECRET is required for a network-bound bridge.");
}
const mode = process.env.EBAY_MODE === "api" ? "api" : "mock";
const environment = process.env.EBAY_ENV === "production" ? "production" : "sandbox";
const apiOrigin = environment === "production" ? "https://api.ebay.com" : "https://api.sandbox.ebay.com";
const mediaOrigin = environment === "production" ? "https://apim.ebay.com" : "https://apim.sandbox.ebay.com";
const dataFile = process.env.DATA_FILE || path.join(__dirname, "data", "drafts.json");
const archiveFile = process.env.ARCHIVE_FILE || path.join(path.dirname(dataFile), "drafts-archive.json");
const jobsFile = process.env.JOBS_FILE || path.join(path.dirname(dataFile), "draft-jobs.json");
const maxBodyBytes = 26_000_000;
const inventoryScope = "https://api.ebay.com/oauth/api_scope/sell.inventory";
const accountScope = "https://api.ebay.com/oauth/api_scope/sell.account";
const tokenCache = new Map();
const categoryTreeCache = new Map();
const configurationCache = new Map();
const categorySuggestionCache = new Map();
const categoryAspectCache = new Map();
const oauthStates = new Map();
const draftJobs = new Map();
function persistDraftJobs() {
  writeRecords(jobsFile, [...draftJobs.values()].slice(-100));
}
const debugEvents = [];
const monitorState = { enabled: process.env.SERVER_MONITOR_ENABLED === "true", lastRunAt: null, checked: 0, changed: 0, errors: 0 };

function debugEvent(stage, data = {}) {
  const event = { at: new Date().toISOString(), stage, ...data };
  debugEvents.unshift(event);
  debugEvents.splice(100);
  if (/_ERROR$/.test(stage)) void recordApiError(null, event).catch((error) => console.error("SUPABASE AUDIT ERROR:", error.message));
  return event;
}

async function debugStage(stage, context, task) {
  const startedAt = Date.now();
  debugEvent(`${stage}_START`, context);
  try {
    const result = await task();
    debugEvent(`${stage}_OK`, { ...context, durationMs: Date.now() - startedAt });
    return result;
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    if (!error.stage || error.stage === "UNKNOWN") error.stage = stage;
    const publicError = toPublicError(error);
    console.error("EBAY PIPELINE ERROR:", { ...context, ...publicError });
    debugEvent(`${stage}_ERROR`, { ...context, durationMs: Date.now() - startedAt, error: publicError });
    throw error;
  }
}
const defaultOauthScopes = [
  "https://api.ebay.com/oauth/api_scope",
  inventoryScope,
  accountScope,
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  "https://api.ebay.com/oauth/api_scope/sell.marketing",
];

function livePublishEnabled() {
  return mode === "api" && environment === "production" && process.env.ALLOW_LIVE_PUBLISH === "true";
}

function oauthState() {
  const hasAccessToken = Boolean(process.env.EBAY_ACCESS_TOKEN);
  const credentialEnvironment = String(process.env.EBAY_CREDENTIAL_ENV || "").toLowerCase();
  const hasRefreshCredentials = Boolean(
    process.env.EBAY_CLIENT_ID
    && process.env.EBAY_CLIENT_SECRET
    && process.env.EBAY_REFRESH_TOKEN
    && credentialEnvironment === environment
  );
  return { hasAccessToken, hasRefreshCredentials, credentialEnvironment };
}

function configuredSellerTemplate() {
  return {
    merchantLocationKey: String(process.env.EBAY_MERCHANT_LOCATION_KEY || "").trim(),
    fulfillmentPolicyId: String(process.env.EBAY_FULFILLMENT_POLICY_ID || "").trim(),
    paymentPolicyId: String(process.env.EBAY_PAYMENT_POLICY_ID || "").trim(),
    returnPolicyId: String(process.env.EBAY_RETURN_POLICY_ID || "").trim(),
  };
}

function corsHeaders(request) {
  const origin = request.headers.origin || "";
  const allowed = origin.startsWith("chrome-extension://") || /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "null",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Vary": "Origin",
  };
}

function send(response, status, body, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  response.end(JSON.stringify(body));
}

function sendHtml(response, status, html) {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(html);
}

const retryableFileErrors = new Set(["EACCES", "EBUSY", "EPERM"]);
const retrySleepBuffer = new Int32Array(new SharedArrayBuffer(4));

function sleepSync(milliseconds) {
  Atomics.wait(retrySleepBuffer, 0, 0, milliseconds);
}

function retryFileOperation(operation, label, attempts = 8) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      lastError = error;
      if (!retryableFileErrors.has(error.code) || attempt === attempts) break;
      sleepSync(Math.min(25 * (2 ** (attempt - 1)), 500));
    }
  }
  const wrapped = new Error(`${label} yazilamadi: ${lastError?.message || "Bilinmeyen dosya hatasi."}`);
  wrapped.code = lastError?.code || "FILE_WRITE_FAILED";
  wrapped.cause = lastError;
  throw wrapped;
}

function atomicWriteFileSync(file, contents, options = undefined) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  try {
    retryFileOperation(() => fs.writeFileSync(temporary, contents, options), path.basename(file));
    retryFileOperation(() => fs.renameSync(temporary, file), path.basename(file));
  } finally {
    try { fs.rmSync(temporary, { force: true }); }
    catch (error) {
      if (!retryableFileErrors.has(error.code)) console.error("TEMP FILE CLEANUP ERROR:", temporary, error);
    }
  }
}

function writeEnvironment(values) {
  const lines = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8").split(/\r?\n/).filter(Boolean) : [];
  for (const [key, value] of Object.entries(values)) {
    const prefix = `${key}=`;
    const index = lines.findIndex((line) => line.startsWith(prefix));
    if (index >= 0) lines[index] = `${prefix}${value}`;
    else lines.push(`${prefix}${value}`);
    process.env[key] = String(value);
  }
  atomicWriteFileSync(envFile, `${lines.join("\n")}\n`, { mode: 0o600 });
}

function oauthScopes() {
  const configured = String(process.env.EBAY_OAUTH_SCOPES || "").trim().split(/\s+/).filter(Boolean);
  return [...new Set(configured.length ? configured : defaultOauthScopes)];
}

function createAuthorizationUrl() {
  const clientId = process.env.EBAY_CLIENT_ID;
  const ruName = process.env.EBAY_RUNAME;
  if (environment !== "production") throw new Error("Kalici OAuth kurulumu yalnizca Production ortaminda aciktir.");
  if (!clientId || !ruName) throw new Error("Production Client ID veya RuName eksik.");
  const state = crypto.randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + 10 * 60 * 1000;
  oauthStates.set(state, expiresAt);
  for (const [candidate, expiry] of oauthStates) if (expiry <= Date.now()) oauthStates.delete(candidate);
  const url = new URL("https://auth.ebay.com/oauth2/authorize");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: ruName,
    response_type: "code",
    scope: oauthScopes().join(" "),
    state,
  }).toString();
  return { authorizationUrl: url.toString(), expiresAt: new Date(expiresAt).toISOString() };
}

async function exchangeAuthorizationCode(code) {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const ruName = process.env.EBAY_RUNAME;
  if (!clientId || !clientSecret || !ruName) throw new Error("Production OAuth uygulama bilgileri eksik.");
  const tokenResponse = await fetch(`${apiOrigin}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: ruName }),
  });
  const tokenBody = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenBody.access_token || !tokenBody.refresh_token) {
    throw new Error(tokenBody.error_description || tokenBody.error || `OAuth HTTP ${tokenResponse.status}`);
  }
  writeEnvironment({
    EBAY_ACCESS_TOKEN: tokenBody.access_token,
    EBAY_ACCESS_TOKEN_EXPIRES_AT: new Date(Date.now() + Number(tokenBody.expires_in || 7200) * 1000).toISOString(),
    EBAY_REFRESH_TOKEN: tokenBody.refresh_token,
    EBAY_REFRESH_TOKEN_EXPIRES_AT: new Date(Date.now() + Number(tokenBody.refresh_token_expires_in || 0) * 1000).toISOString(),
    EBAY_CREDENTIAL_ENV: environment,
  });
  tokenCache.clear();
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > maxBodyBytes) throw new Error("Payload cok buyuk.");
  }
  try { return JSON.parse(body || "{}"); }
  catch { throw new Error("Gecersiz JSON."); }
}

function validateDraft(input) {
  const title = sanitizeEbayText(input.title).slice(0, 80);
  const price = Number(input.price);
  const quantity = Number(input.quantity);
  const description = sanitizeEbayText(input.description);
  if (!input.sourceId || !title) throw new Error("sourceId ve title zorunludur.");
  if (!Number.isFinite(price) || price <= 0) throw new Error("price pozitif bir sayi olmalidir.");
  if (!Number.isInteger(quantity) || quantity < 0) throw new Error("quantity sifir veya pozitif tam sayi olmalidir.");
  if (description.length > 4000) throw new Error("HTML aciklama eBay 4.000 karakter sinirini asiyor.");
  const imageUrls = Array.isArray(input.imageUrls) ? input.imageUrls.filter(isEbayHostedImageUrl).slice(0, 12) : [];
  const processedImageData = Array.isArray(input.processedImageData)
    ? input.processedImageData.filter((asset) => typeof asset?.dataUrl === "string" && /^data:image\/(jpeg|jpg|png);base64,/i.test(asset.dataUrl)).slice(0, 12)
    : [];
  if (imageUrls.length && processedImageData.length) throw new Error("Ham imageUrls ve islenmis gorseller birlikte gonderilemez.");
  if ((imageUrls.length || processedImageData.length) && input.imageRightsConfirmed !== true) throw new Error("Gorsellerin kullanim hakki dogrulanmalidir.");
  const itemSpecifics = Object.fromEntries(Object.entries(input.itemSpecifics || {})
    .map(([key, values]) => [sanitizeEbayText(key).slice(0, 40), (Array.isArray(values) ? values : [values])
      .map((value) => sanitizeEbayText(value).slice(0, 120)).filter(Boolean).slice(0, 10)])
    .filter(([key, values]) => key && values.length)
    .slice(0, 30));
  return {
    ...input,
    sku: /^DE-INV-\d{6,20}$/.test(String(input.sku || "")) ? String(input.sku) : generateEbaySku(),
    title,
    description,
    imageUrls,
    processedImageData,
    imageRightsConfirmed: input.imageRightsConfirmed === true,
    price: price.toFixed(2),
    quantity,
    itemSpecifics,
    ean: isValidEan(input.ean) ? String(input.ean).replace(/\D/g, "") : "",
  };
}

function sanitizeEbayText(value) {
  return String(value || "")
    .replace(/\bAMZ(?:[-_\s]*[A-Z0-9]{0,12})?\b/gi, " ")
    .replace(/\bB0[A-Z0-9]{8}\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function generateEbaySku() {
  return `DE-INV-${crypto.randomInt(100000000, 999999999)}`;
}

function isEbayHostedImageUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && /(^|\.)ebayimg\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function isValidEan(value) {
  const ean = String(value || "").replace(/\D/g, "");
  if (![8, 13].includes(ean.length)) return false;
  const digits = [...ean].map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

function readDrafts() {
  return readRecords(dataFile);
}

function readRecords(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
}

function readArchivedDrafts() { return readRecords(archiveFile); }

function saveDraft(draft) {
  const drafts = readDrafts();
  drafts.unshift(draft);
  writeDrafts(drafts);
}

function writeDrafts(drafts) {
  writeRecords(dataFile, drafts);
}

function writeArchivedDrafts(drafts) { writeRecords(archiveFile, drafts); }

function writeRecords(file, records) {
  atomicWriteFileSync(file, JSON.stringify(records.slice(0, 500), null, 2));
}

function archiveDrafts(items, reason) {
  if (!items.length) return;
  const archive = readArchivedDrafts();
  const archivedAt = new Date().toISOString();
  archive.unshift(...items.map((draft) => ({ ...draft, archivedAt, archiveReason: reason })));
  writeArchivedDrafts(archive);
}

async function accessToken(requiredScopes = [inventoryScope]) {
  const configuredAccessToken = process.env.EBAY_ACCESS_TOKEN;
  // Prefer scoped, renewable credentials whenever the matching refresh grant exists.
  if (configuredAccessToken && !oauthState().hasRefreshCredentials) {
    const expiresAt = Date.parse(process.env.EBAY_ACCESS_TOKEN_EXPIRES_AT || "");
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
      throw new Error("eBay erisim tokeninin suresi doldu; yeniden yetkilendirme gerekli.");
    }
    return configuredAccessToken;
  }
  if (!oauthState().hasRefreshCredentials) throw new Error("Bu ortam icin refresh token yapilandirilmamis.");

  const scope = [...new Set(requiredScopes)].sort().join(" ");
  const cached = tokenCache.get(scope);
  if (cached?.expiresAt > Date.now() + 300_000) return cached.value;

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const refreshToken = process.env.EBAY_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) throw new Error("eBay OAuth bilgileri eksik.");
  const response = await fetch(`${apiOrigin}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error_description || body.error || `OAuth HTTP ${response.status}`);
  tokenCache.set(scope, {
    value: body.access_token,
    expiresAt: Date.now() + (Number(body.expires_in || 7200) * 1000),
  });
  return body.access_token;
}

async function applicationToken() {
  const scope = "https://api.ebay.com/oauth/api_scope";
  const cached = tokenCache.get(scope);
  if (cached?.expiresAt > Date.now() + 300_000) return cached.value;
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("eBay uygulama OAuth bilgileri eksik.");
  const response = await fetch(`${apiOrigin}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error_description || body.error || `OAuth HTTP ${response.status}`);
  tokenCache.set(scope, {
    value: body.access_token,
    expiresAt: Date.now() + (Number(body.expires_in || 7200) * 1000),
  });
  return body.access_token;
}

async function ebayRequest(token, method, pathname, body, marketplaceId) {
  return ebayApiRequest(token, method, `/sell/inventory/v1${pathname}`, body, marketplaceId);
}

async function ebayApiRequest(token, method, pathname, body, marketplaceId) {
  const retryable = method === "GET" || method === "PUT";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response;
    const endpoint = `${apiOrigin}${pathname}`;
    try {
      response = await fetch(endpoint, {
        method,
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept-Language": process.env.EBAY_LOCALE || "de-DE",
          "Content-Type": "application/json",
          "Content-Language": process.env.EBAY_LOCALE || "de-DE",
          "X-EBAY-C-MARKETPLACE-ID": marketplaceId || "EBAY_DE",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });
    } catch (cause) {
      throw createRestError({ response, body: { message: cause.message }, stage: "EBAY_NETWORK", operation: `${method} ${pathname}`, method, endpoint: pathname, cause });
    }
    const responseBody = await response.json().catch(() => ({}));
    if (response.ok) return responseBody;
    const retryAfter = Number(response.headers.get("retry-after"));
    if (retryable && attempt < 2 && (response.status === 429 || response.status >= 500)) {
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 300 * (2 ** attempt);
      await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 3_000)));
      continue;
    }
    throw createRestError({ response, body: responseBody, stage: "EBAY_API", operation: `${method} ${pathname}`, method, endpoint: pathname });
  }
  throw new Error("eBay istegi tekrar deneme sinirini asti.");
}

async function getActiveListings() {
  try { return await getTradingActiveListings(); }
  catch (error) { console.warn("TRADING ACTIVE LIST ERROR:", error); }
  const token = await accessToken([inventoryScope]);
  const marketplaceId = "EBAY_DE";
  let response;
  try {
    response = await ebayRequest(token, "GET", "/offer?marketplace_id=EBAY_DE&limit=200", undefined, marketplaceId);
  } catch (error) {
    console.warn("ACTIVE OFFER LIST ERROR:", error);
    return readDrafts().filter((draft) => draft.status === "PUBLISHED").map((draft) => ({
      sku: draft.sku, offerId: draft.offerId || "", listingId: draft.listingId || "", status: "PUBLISHED",
      title: draft.title || draft.sku, imageUrls: draft.imageUrls || [], quantity: draft.quantity || 0,
      price: draft.price || "0.00", currency: draft.currency || "EUR", source: "bridge-fallback",
    }));
  }
  const activeOffers = (response.offers || []).filter((offer) => String(offer.status || "").toUpperCase() === "PUBLISHED" || String(offer.listingStatus || "").toUpperCase() === "ACTIVE");
  const listings = await Promise.all(activeOffers.map(async (offer) => {
    let inventory = {};
    if (offer.sku && /^[A-Za-z0-9]+$/.test(String(offer.sku))) {
      try { inventory = await ebayRequest(token, "GET", `/inventory_item/${encodeURIComponent(offer.sku)}`, undefined, marketplaceId); } catch (error) { console.warn("ACTIVE LISTING INVENTORY ERROR:", { sku: offer.sku, error }); }
    }
    return {
      sku: offer.sku,
      offerId: offer.offerId || "",
      listingId: offer.listingId || "",
      status: "PUBLISHED",
      title: inventory.product?.title || offer.listingDescription || offer.sku,
      imageUrls: inventory.product?.imageUrls || [],
      quantity: inventory.availability?.shipToLocationAvailability?.quantity ?? offer.availableQuantity ?? 0,
      price: offer.pricingSummary?.price?.value || "0.00",
      currency: offer.pricingSummary?.price?.currency || "EUR",
    };
  }));
  return listings;
}

function enrichActiveListings(listings) {
  const storedDrafts = readDrafts();
  return listings.map((listing) => {
    const stored = storedDrafts.find((draft) =>
      (listing.listingId && String(draft.listingId) === String(listing.listingId))
      || (listing.sku && String(draft.sku) === String(listing.sku)));
    if (!stored) return listing;
    return {
      ...stored,
      ...listing,
      imageUrls: listing.imageUrls?.length ? listing.imageUrls : (stored.imageUrls || []),
      amazonUrl: stored.amazonUrl || stored.sourceUrl || "",
      amazonAsin: stored.amazonAsin || stored.asin || stored.sourceId || "",
      sourceId: stored.sourceId || stored.asin || "",
    };
  });
}

function xmlValue(xml, tag) {
  const match = String(xml).match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? match[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim() : "";
}

function xmlItems(xml) {
  return [...String(xml).matchAll(/<Item>([\s\S]*?)<\/Item>/gi)].map((match) => {
    const item = match[1];
    return {
      sku: xmlValue(item, "SKU"), offerId: "", listingId: xmlValue(item, "ItemID"), status: "PUBLISHED",
      title: xmlValue(item, "Title"), quantity: Number(xmlValue(item, "QuantityAvailable") || xmlValue(item, "Quantity") || 0),
      price: xmlValue(item, "CurrentPrice") || xmlValue(item, "StartPrice") || "0.00", currency: "EUR", imageUrls: [], source: "trading",
    };
  });
}

async function getTradingActiveListings() {
  const token = await accessToken();
  const body = `<?xml version="1.0" encoding="utf-8"?><GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>1</PageNumber></Pagination></ActiveList></GetMyeBaySellingRequest>`;
  const response = await fetch(`${apiOrigin}/ws/api.dll`, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "X-EBAY-API-CALL-NAME": "GetMyeBaySelling",
      "X-EBAY-API-SITEID": "77",
      "X-EBAY-API-COMPATIBILITY-LEVEL": process.env.EBAY_COMPATIBILITY_LEVEL || "1423",
      "X-EBAY-API-IAF-TOKEN": token,
    }, body,
  });
  const xml = await response.text();
  if (!response.ok || /<Ack>Failure<\/Ack>/i.test(xml)) throw createTradingError({ response, xml, stage: "LEGACY_LIST", operation: "GetMyeBaySelling", endpoint: "/ws/api.dll" });
  return xmlItems(xml);
}

async function updateActiveListing(input) {
  const sku = String(input.sku || "");
  const offerId = String(input.offerId || "");
  const price = Number(input.price);
  const quantity = Number(input.quantity);
  if (!Number.isFinite(price) || price <= 0) throw new Error("Fiyat pozitif olmalı.");
  if (!Number.isInteger(quantity) || quantity < 0) throw new Error("Stok sıfır veya pozitif tam sayı olmalı.");
  const token = await accessToken([inventoryScope]);
  if (!offerId && input.listingId) {
    const body = `<?xml version="1.0" encoding="utf-8"?><ReviseInventoryStatusRequest xmlns="urn:ebay:apis:eBLBaseComponents"><InventoryStatus><ItemID>${String(input.listingId)}</ItemID><StartPrice>${price.toFixed(2)}</StartPrice><Quantity>${quantity}</Quantity></InventoryStatus></ReviseInventoryStatusRequest>`;
    const response = await fetch(`${apiOrigin}/ws/api.dll`, { method: "POST", headers: { "Content-Type": "text/xml", "X-EBAY-API-CALL-NAME": "ReviseInventoryStatus", "X-EBAY-API-SITEID": "77", "X-EBAY-API-COMPATIBILITY-LEVEL": process.env.EBAY_COMPATIBILITY_LEVEL || "1423", "X-EBAY-API-IAF-TOKEN": token }, body });
    const xml = await response.text();
    if (!response.ok || /<Ack>Failure<\/Ack>/i.test(xml)) throw createTradingError({ response, xml, stage: "LEGACY_UPDATE", operation: "ReviseInventoryStatus", endpoint: "/ws/api.dll" });
    return { updated: true, listingId: input.listingId, price: price.toFixed(2), quantity };
  }
  if (!offerId) throw new Error("Aktif offer veya Item ID gerekli.");
  const offer = await ebayRequest(token, "GET", `/offer/${encodeURIComponent(offerId)}`, undefined, "EBAY_DE");
  const nextOffer = {
    ...offer,
    pricingSummary: { ...(offer.pricingSummary || {}), price: { currency: offer.pricingSummary?.price?.currency || "EUR", value: price.toFixed(2) } },
    availableQuantity: quantity,
  };
  await ebayRequest(token, "PUT", `/offer/${encodeURIComponent(offerId)}`, nextOffer, "EBAY_DE");
  if (/^[A-Za-z0-9]+$/.test(sku)) {
    await ebayRequest(token, "PUT", `/inventory_item/${encodeURIComponent(sku)}`, {
      availability: { shipToLocationAvailability: { quantity } },
    }, "EBAY_DE");
  }
  return { updated: true, offerId, sku, price: price.toFixed(2), quantity };
}

function amazonSourceUrl(draft) {
  try {
    const url = new URL(String(draft.amazonUrl || draft.sourceUrl || ""));
    if (url.protocol !== "https:" || !/(^|\.)amazon\.de$/i.test(url.hostname)) return "";
    const asin = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1];
    return asin ? `https://www.amazon.de/dp/${asin.toUpperCase()}` : "";
  } catch { return ""; }
}

function parseSourcePrice(value) {
  const cleaned = String(value || "").replace(/[^\d,.]/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function salePriceForSource(sourcePrice, marginPercent) {
  const margin = Number(marginPercent) / 100;
  if (!Number.isFinite(sourcePrice) || !Number.isFinite(margin) || margin < 0 || margin >= 0.9) return null;
  return (Math.ceil(sourcePrice / (1 - margin)) - 0.01).toFixed(2);
}

function readAmazonProductSchema(html) {
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const root = JSON.parse(match[1]);
      const entries = Array.isArray(root) ? root : [root];
      const product = entries.flatMap((entry) => entry?.['@graph'] || [entry]).find((entry) => {
        const type = entry?.['@type'];
        return type === 'Product' || (Array.isArray(type) && type.includes('Product'));
      });
      if (!product) continue;
      const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
      const availability = String(offer?.availability || '');
      return {
        price: parseSourcePrice(offer?.price),
        inStock: /(?:^|\/)InStock$/i.test(availability) ? true : /(?:^|\/)(?:OutOfStock|SoldOut|Discontinued)$/i.test(availability) ? false : null,
      };
    } catch { /* Ignore malformed source metadata. */ }
  }
  return { price: null, inStock: null };
}

async function fetchAmazonSnapshot(draft) {
  const url = amazonSourceUrl(draft);
  if (!url) throw new Error('Geçerli Amazon.de ürün URLsi bulunamadı.');
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AutoLister/1.0)', 'Accept-Language': 'de-DE,de;q=0.9' },
    redirect: 'manual', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Amazon HTTP ${response.status}`);
  const html = await response.text();
  if (/captcha|robot check|automated access/i.test(html)) throw new Error('Amazon robot doğrulaması istedi.');
  const schema = readAmazonProductSchema(html);
  const availability = html.match(/id=["']availability["'][^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') || '';
  const inStock = schema.inStock ?? (/derzeit nicht verfügbar|currently unavailable|nicht auf lager/i.test(availability) ? false : /auf lager|lieferbar|in stock/i.test(availability) ? true : null);
  const quantityMatch = availability.match(/nur noch\s+(\d+)\s+(?:stück|artikel)/i);
  if (schema.price === null && inStock === null) throw new Error('Amazon fiyat veya stok bilgisi güvenilir biçimde okunamadı.');
  return { price: schema.price, inStock, stockQuantity: quantityMatch ? Number(quantityMatch[1]) : null, checkedAt: new Date().toISOString() };
}

async function monitorPublishedProducts() {
  if (!monitorState.enabled || mode !== 'api' || environment !== 'production') return monitorState;
  const candidates = readDrafts().filter((draft) => draft.status === 'PUBLISHED' && amazonSourceUrl(draft)).slice(0, 30);
  const result = { enabled: true, lastRunAt: new Date().toISOString(), checked: 0, changed: 0, errors: 0 };
  for (const draft of candidates) {
    try {
      const snapshot = await fetchAmazonSnapshot(draft);
      const currentPrice = Number(draft.price);
      const salePrice = draft.manualSalePrice || (snapshot.price && salePriceForSource(snapshot.price, draft.targetMarginPercent)) || draft.price;
      const desiredQuantity = Number.isInteger(Number(draft.desiredQuantity)) ? Number(draft.desiredQuantity) : 1;
      const nextQuantity = snapshot.inStock === false || (snapshot.stockQuantity !== null && snapshot.stockQuantity <= 3)
        ? 0 : snapshot.inStock === true ? desiredQuantity : draft.quantity;
      if (Number(salePrice) !== currentPrice || nextQuantity !== draft.quantity) {
        await updateActiveListing({ sku: draft.sku, offerId: draft.offerId, listingId: draft.listingId, price: salePrice, quantity: nextQuantity });
        result.changed += 1;
      }
      const latest = readDrafts();
      const index = latest.findIndex((entry) => entry.id === draft.id);
      if (index >= 0) {
        latest[index] = { ...latest[index], price: String(salePrice), quantity: nextQuantity, lastSourceSnapshot: snapshot, lastCheckedAt: snapshot.checkedAt, lastError: '' };
        writeDrafts(latest);
      }
      result.checked += 1;
    } catch (error) {
      const latest = readDrafts();
      const index = latest.findIndex((entry) => entry.id === draft.id);
      if (index >= 0) {
        latest[index] = { ...latest[index], lastCheckedAt: new Date().toISOString(), lastError: error.message };
        writeDrafts(latest);
      }
      result.errors += 1;
      debugEvent('SERVER_MONITOR_ERROR', { sourceId: draft.sourceId, message: error.message });
    }
  }
  Object.assign(monitorState, result);
  return monitorState;
}

async function getEbayOrders() {
  const token = await accessToken(["https://api.ebay.com/oauth/api_scope/sell.fulfillment"]);
  const result = await ebayApiRequest(token, "GET", "/sell/fulfillment/v1/order?limit=100&fieldGroups=TAX_BREAKDOWN", undefined, "EBAY_DE");
  return (result.orders || []).map((order) => ({
    orderId: order.orderId,
    createdDate: order.creationDate,
    total: order.pricingSummary?.total?.value || "0.00",
    currency: order.pricingSummary?.total?.currency || "EUR",
    buyerName: [order.buyer?.username, order.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.fullName].filter(Boolean).join(" · "),
    address: order.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.contactAddress || {},
    lineItems: (order.lineItems || []).map((item) => ({ title: item.title || "", sku: item.sku || "", quantity: item.quantity || 1 })),
  }));
}

async function getConfiguration(marketplaceId = "EBAY_DE", refresh = false) {
  const cached = configurationCache.get(marketplaceId);
  if (!refresh && cached?.expiresAt > Date.now()) return cached.value;
  const token = await accessToken([inventoryScope, accountScope]);
  const marketplaceQuery = `marketplace_id=${encodeURIComponent(marketplaceId)}`;
  const [locations, fulfillment, payment, returns] = await Promise.all([
    ebayRequest(token, "GET", "/location?limit=100"),
    ebayApiRequest(token, "GET", `/sell/account/v1/fulfillment_policy?${marketplaceQuery}`),
    ebayApiRequest(token, "GET", `/sell/account/v1/payment_policy?${marketplaceQuery}`),
    ebayApiRequest(token, "GET", `/sell/account/v1/return_policy?${marketplaceQuery}`),
  ]);
  const configuration = {
    marketplaceId,
    locations: (locations.locations || []).map((item) => ({
      merchantLocationKey: item.merchantLocationKey,
      name: item.name,
      status: item.merchantLocationStatus,
    })),
    fulfillmentPolicies: (fulfillment.fulfillmentPolicies || []).map((item) => ({ id: item.fulfillmentPolicyId, name: item.name })),
    paymentPolicies: (payment.paymentPolicies || []).map((item) => ({ id: item.paymentPolicyId, name: item.name })),
    returnPolicies: (returns.returnPolicies || []).map((item) => ({ id: item.returnPolicyId, name: item.name })),
  };
  const preferred = configuredSellerTemplate();
  configuration.sellerTemplate = {
    merchantLocationKey: configuration.locations.some((item) => item.merchantLocationKey === preferred.merchantLocationKey && item.status === "ENABLED")
      ? preferred.merchantLocationKey
      : configuration.locations.find((item) => item.status === "ENABLED")?.merchantLocationKey || "",
    fulfillmentPolicyId: configuration.fulfillmentPolicies.some((item) => item.id === preferred.fulfillmentPolicyId)
      ? preferred.fulfillmentPolicyId
      : configuration.fulfillmentPolicies[0]?.id || "",
    paymentPolicyId: configuration.paymentPolicies.some((item) => item.id === preferred.paymentPolicyId)
      ? preferred.paymentPolicyId
      : configuration.paymentPolicies[0]?.id || "",
    returnPolicyId: configuration.returnPolicies.some((item) => item.id === preferred.returnPolicyId)
      ? preferred.returnPolicyId
      : configuration.returnPolicies[0]?.id || "",
  };
  configurationCache.set(marketplaceId, { value: configuration, expiresAt: Date.now() + 10 * 60 * 1000 });
  return configuration;
}

async function suggestCategory(title, marketplaceId = "EBAY_DE") {
  const cacheKey = `${marketplaceId}:${String(title).trim().toLocaleLowerCase("de-DE")}`;
  const cached = categorySuggestionCache.get(cacheKey);
  if (cached?.expiresAt > Date.now()) return cached.value;
  const token = await applicationToken();
  let treeId = categoryTreeCache.get(marketplaceId);
  if (!treeId) {
    const tree = await ebayApiRequest(token, "GET", `/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=${encodeURIComponent(marketplaceId)}`);
    treeId = tree.categoryTreeId;
    categoryTreeCache.set(marketplaceId, treeId);
  }
  const suggestions = await ebayApiRequest(token, "GET", `/commerce/taxonomy/v1/category_tree/${encodeURIComponent(treeId)}/get_category_suggestions?q=${encodeURIComponent(title)}`, undefined, marketplaceId);
  const categoryId = suggestions.categorySuggestions?.[0]?.category?.categoryId || "";
  categorySuggestionCache.set(cacheKey, { value: categoryId, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
  return categoryId;
}

async function categoryAspectRules(categoryId, marketplaceId = "EBAY_DE") {
  if (!categoryId) return { metadataAvailable: false, required: [], recommended: [], warning: "eBay kategorisi secilmemis." };
  const cacheKey = `${marketplaceId}:${categoryId}`;
  const cached = categoryAspectCache.get(cacheKey);
  if (cached?.expiresAt > Date.now()) return cached.value;

  const token = await applicationToken();
  let treeId = categoryTreeCache.get(marketplaceId);
  if (!treeId) {
    const tree = await ebayApiRequest(token, "GET", `/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=${encodeURIComponent(marketplaceId)}`);
    treeId = tree.categoryTreeId;
    categoryTreeCache.set(marketplaceId, treeId);
  }
  const result = await ebayApiRequest(token, "GET", `/commerce/taxonomy/v1/category_tree/${encodeURIComponent(treeId)}/get_item_aspects_for_category?category_id=${encodeURIComponent(categoryId)}`, undefined, marketplaceId);
  if (!Array.isArray(result.aspects)) throw new Error("Kategori ozellik yaniti gecersiz.");
  const rules = {
    metadataAvailable: true,
    required: (result.aspects || []).filter((item) => item.aspectConstraint?.aspectRequired).map((item) => item.localizedAspectName),
    recommended: (result.aspects || []).filter((item) => !item.aspectConstraint?.aspectRequired && item.aspectConstraint?.aspectUsage === "RECOMMENDED").map((item) => item.localizedAspectName),
  };
  categoryAspectCache.set(cacheKey, { value: rules, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
  return rules;
}

function normalizeAspectName(value) {
  return String(value || "").toLocaleLowerCase("de-DE").replace(/[^\p{L}\p{N}]/gu, "");
}

function categoryOverrideForTitle(title) {
  const normalized = String(title || "").toLocaleLowerCase("de-DE");
  if (/baby\s*-?\s*feuchttücher|babyfeuchttücher|babytücher/.test(normalized)) return "115328";
  return "";
}

function firstAspectValue(aspects, acceptedNames) {
  for (const [name, values] of Object.entries(aspects || {})) {
    if (!acceptedNames.has(normalizeAspectName(name))) continue;
    const value = Array.isArray(values) ? values[0] : values;
    if (String(value || "").trim()) return String(value).trim();
  }
  return "";
}

function explicitShadeFromDraft(stored) {
  const aspects = stored.itemSpecifics || {};
  const specified = firstAspectValue(aspects, new Set(["farbton", "farbe", "color", "colour", "shade"]));
  if (specified) return specified;

  // Only derive a shade where the source itself explicitly states one.  Do not
  // infer a cosmetic shade merely from product type or an image.
  const source = `${stored.title || ""} ${stored.description || ""} ${Object.values(aspects).flat().join(" ")}`;
  if (/\b(?:very\s+black|intensiv(?:es|e)?\s+schwarz|schwarz|black)\b/iu.test(source)) return "Schwarz";
  return "";
}

function completeRequiredAspects(stored, rules) {
  const aspects = { ...(stored.itemSpecifics || {}) };
  const provided = new Set(Object.keys(aspects).map(normalizeAspectName));
  const completed = [];
  for (const required of rules.required || []) {
    const normalized = normalizeAspectName(required);
    if (provided.has(normalized)) continue;
    let value = "";
    if (normalized === "markenkompatibilität") value = "Universell";
    if (normalized === "marke") {
      value = firstAspectValue(aspects, new Set(["marke", "brand", "hersteller", "manufacturer"]));
      if (/^(unbranded|generic|unbekannt|n\/?a)$/iu.test(value)) value = "";
    }
    if (normalized === "farbton") value = explicitShadeFromDraft({ ...stored, itemSpecifics: aspects });
    if (!value) continue;
    aspects[required] = [value];
    provided.add(normalized);
    completed.push({ aspect: required, value });
    debugEvent("ITEM_SPECIFIC_AUTO_COMPLETED", { sku: stored.sku, aspect: required, value });
  }
  return { stored: { ...stored, itemSpecifics: aspects }, changed: completed.length > 0, completed };
}

function ebayImageDimensions(url) {
  const match = String(url || "").match(/\/s\/([^/]+)\//i);
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const dimensions = decoded.match(/^(\d+)x(\d+)$/i);
    return dimensions ? { width: Number(dimensions[1]), height: Number(dimensions[2]) } : null;
  } catch {
    return null;
  }
}

async function validateEbayDraft(stored) {
  const errors = [];
  const warnings = [];
  if (!stored.categoryId) errors.push("eBay kategorisi eksik.");
  if (!stored.title || stored.title.length > 80) errors.push("eBay basligi gecersiz.");
  if (!stored.imageUrls?.length) errors.push("En az bir urun gorseli gerekli.");
  if (stored.imageUrls?.some((url) => !isEbayHostedImageUrl(url))) errors.push("Envanterde yalnizca eBay-hosted gorsel URLleri bulunabilir.");
  const undersizedImages = (stored.imageUrls || []).filter((url) => {
    const dimensions = ebayImageDimensions(url);
    return dimensions && Math.max(dimensions.width, dimensions.height) < 500;
  });
  if (undersizedImages.length) errors.push("IMAGE_REBUILD_REQUIRED: Eski galeride eBay'in 500px sınırının altında görseller var; Amazon sayfasından galeri yeniden oluşturulmalı.");
  if (stored.imageUrls?.length && stored.imageRightsConfirmed !== true) errors.push("Gorsellerin kullanim hakki dogrulanmamis.");
  if (!Number.isFinite(Number(stored.price)) || Number(stored.price) <= 0) errors.push("Satis fiyati gecersiz.");
  if (!Number.isInteger(stored.quantity) || stored.quantity < 0) errors.push("Stok miktari gecersiz.");
  if (stored.quantity === 0) warnings.push("Miktar 0; yayinlansa bile ilan stokta yok gorunur.");

  try {
    const rules = await categoryAspectRules(stored.categoryId, stored.marketplaceId || "EBAY_DE");
    const provided = new Set(Object.keys(stored.itemSpecifics || {}).map(normalizeAspectName));
    const missingRequired = rules.required.filter((name) => !provided.has(normalizeAspectName(name)));
    const missingRecommended = rules.recommended.filter((name) => !provided.has(normalizeAspectName(name))).slice(0, 12);
    if (missingRequired.length) errors.push(`Zorunlu Item Specifics eksik: ${missingRequired.join(", ")}`);
    if (missingRecommended.length) warnings.push(`Onerilen Item Specifics: ${missingRecommended.join(", ")}`);
    return { ready: errors.length === 0, errors, warnings, ...rules, missingRequired, missingRecommended };
  } catch (error) {
    errors.push(`eBay Item Specifics metadatasi okunamadi: ${error instanceof Error ? error.message : String(error)}`);
    return { ready: false, errors, warnings, metadataAvailable: false, required: [], recommended: [], missingRequired: [], missingRecommended: [] };
  }
}

async function hydrateOfferSettings(draft) {
  const hasPolicies = draft.merchantLocationKey
    && draft.listingPolicies?.fulfillmentPolicyId
    && draft.listingPolicies?.paymentPolicyId
    && draft.listingPolicies?.returnPolicyId;
  if (!hasPolicies) {
    try {
      const configuration = await getConfiguration(draft.marketplaceId || "EBAY_DE");
      draft.merchantLocationKey ||= configuration.sellerTemplate.merchantLocationKey;
      draft.listingPolicies ||= {};
      draft.listingPolicies.fulfillmentPolicyId ||= configuration.sellerTemplate.fulfillmentPolicyId;
      draft.listingPolicies.paymentPolicyId ||= configuration.sellerTemplate.paymentPolicyId;
      draft.listingPolicies.returnPolicyId ||= configuration.sellerTemplate.returnPolicyId;
    } catch {
      // Inventory-only drafts remain available if Account API setup is incomplete.
    }
  }
  const categoryOverride = categoryOverrideForTitle(draft.title);
  if (categoryOverride) draft.categoryId = categoryOverride;
  if (!draft.categoryId) {
    try { draft.categoryId = await suggestCategory(draft.title, draft.marketplaceId || "EBAY_DE"); }
    catch { draft.categoryId = ""; }
  }
  return draft;
}

async function createEbayDraft(draft) {
  await debugStage("CONFIGURATION", { sku: draft.sku }, () => hydrateOfferSettings(draft));
  const token = await debugStage("OAUTH", { operation: "accessToken" }, () => accessToken());
  await debugStage("IMAGE_UPLOAD", { sku: draft.sku, inputImageCount: draft.processedImageData?.length || draft.imageUrls?.length || 0 }, () => ensureEbayHostedImages(token, draft));
  const inventoryPayload = {
    availability: { shipToLocationAvailability: { quantity: draft.quantity } },
    condition: "NEW",
    product: {
      title: draft.title,
      description: draft.description,
      imageUrls: draft.imageUrls,
      aspects: draft.itemSpecifics,
      ...(draft.ean ? { ean: [draft.ean] } : {}),
    },
  };
  await debugStage("INVENTORY_ITEM", { sku: draft.sku, payload: payloadSummary(inventoryPayload) }, () =>
    ebayRequest(token, "PUT", `/inventory_item/${encodeURIComponent(draft.sku)}`, inventoryPayload, draft.marketplaceId));

  const requiredOfferSettings = [
    draft.categoryId,
    draft.merchantLocationKey,
    draft.listingPolicies?.fulfillmentPolicyId,
    draft.listingPolicies?.paymentPolicyId,
    draft.listingPolicies?.returnPolicyId,
  ];
  if (requiredOfferSettings.some((value) => !String(value || "").trim())) {
    return { stage: "INVENTORY_ITEM_READY" };
  }

  const offerPayload = {
    sku: draft.sku,
    marketplaceId: draft.marketplaceId || "EBAY_DE",
    format: "FIXED_PRICE",
    availableQuantity: draft.quantity,
    categoryId: draft.categoryId,
    merchantLocationKey: draft.merchantLocationKey,
    listingDescription: draft.description,
    listingPolicies: draft.listingPolicies,
    pricingSummary: { price: { currency: draft.currency || "EUR", value: draft.price } },
  };
  const offer = await debugStage("OFFER_CREATE", { sku: draft.sku, payload: payloadSummary(offerPayload) }, () =>
    ebayRequest(token, "POST", "/offer", offerPayload, draft.marketplaceId));
  return { offerId: offer.offerId, stage: "OFFER_READY" };
}

async function uploadProcessedImage(token, asset, index) {
    const match = String(asset.dataUrl || "").match(/^data:(image\/(?:jpeg|jpg|png));base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) throw new Error("Gorsel DataURL formati gecersiz.");
    const decoded = Buffer.from(match[2], "base64");
    // The extension has already rendered the full gallery at high quality. A second
    // resize/JPEG pass made small label text and symbols visibly soft on eBay.
    const uploadBuffer = decoded;
    const uploadMimeType = match[1];
    const imageMeta = {
      index, width: Number(asset.width || 0), height: Number(asset.height || 0), mimeType: uploadMimeType,
      sourceBytes: decoded.length, uploadBytes: uploadBuffer.length, optimized: false,
    };
    let upload;
    // High-resolution, badge-preserving JPEGs can take longer than 60 seconds
    // on eBay's Media API. Retry with a bounded, production-safe deadline.
    const maxAttempts = Math.min(4, Math.max(1, Number(process.env.EBAY_IMAGE_UPLOAD_ATTEMPTS || 3)));
    const timeoutMs = Math.max(30_000, Number(process.env.EBAY_IMAGE_UPLOAD_TIMEOUT_MS || 150_000));
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      debugEvent("IMAGE_FILE_UPLOAD_START", { ...imageMeta, attempt });
      try {
        const form = new FormData();
        form.append("image", new Blob([uploadBuffer], { type: uploadMimeType }), "alltaghaus.jpg");
        upload = await fetch(`${mediaOrigin}/commerce/media/v1_beta/image/create_image_from_file`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          body: form,
          signal: AbortSignal.timeout(timeoutMs),
        });
        break;
      } catch (cause) {
        debugEvent("IMAGE_FILE_UPLOAD_RETRY", { ...imageMeta, attempt, message: cause?.message || String(cause) });
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          continue;
        }
        const error = new Error(`Gorsel ${index + 1} yuklenemedi: ${cause?.message || cause}`);
        error.code = cause?.name === "TimeoutError" || cause?.name === "AbortError" ? "IMAGE_UPLOAD_TIMEOUT" : "IMAGE_UPLOAD_NETWORK";
        error.stage = "IMAGE_UPLOAD";
        error.operation = `create_image_from_file[${index}]`;
        error.cause = cause;
        throw error;
      }
    }
    if (!upload.ok) {
      const responseText = await upload.text();
      throw createRestError({ response: upload, body: (() => { try { return JSON.parse(responseText); } catch { return { message: responseText.slice(0, 500) }; } })(), stage: "IMAGE_UPLOAD", operation: `create_image_from_file[${index}]`, method: "POST", endpoint: "/commerce/media/v1_beta/image/create_image_from_file" });
    }
    const responseBody = await upload.json().catch(() => ({}));
    let imageUrl = responseBody.imageUrl;
    const location = upload.headers.get("location");
    if (!imageUrl && location) {
      const details = await fetch(new URL(location, mediaOrigin), {
        signal: AbortSignal.timeout(Number(process.env.EBAY_IMAGE_METADATA_TIMEOUT_MS || 20000)),
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const detailsBody = await details.json().catch(() => ({}));
      if (!details.ok) throw createRestError({ response: details, body: detailsBody, stage: "IMAGE_METADATA", operation: `image_details[${index}]`, method: "GET", endpoint: String(location) });
      imageUrl = detailsBody.imageUrl;
    }
    if (!isEbayHostedImageUrl(imageUrl)) {
      throw new Error("eBay Media API guvenli bir eBay gorsel URLsi dondurmedi.");
    }
    debugEvent("IMAGE_UPLOAD_OK", { ...imageMeta, hostedUrlHost: new URL(imageUrl).hostname });
    return { index, imageUrl };
}

async function uploadProcessedImages(token, assets) {
  const list = (assets || []).map((asset, index) => ({ asset, index }));
  const results = [];
  const concurrency = Math.min(3, Math.max(1, Number(process.env.EBAY_IMAGE_UPLOAD_CONCURRENCY || 3)));
  let cursor = 0;
  async function worker() {
    while (cursor < list.length) {
      const entry = list[cursor++];
      results.push(await uploadProcessedImage(token, entry.asset, entry.index));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
  return results.sort((a, b) => a.index - b.index).map((entry) => entry.imageUrl);
}

async function ensureEbayHostedImages(token, draft) {
  if (draft.processedImageData?.length) {
    draft.imageUrls = await uploadProcessedImages(token, draft.processedImageData);
    delete draft.processedImageData;
  }
  if (draft.imageUrls?.length && draft.imageUrls.every(isEbayHostedImageUrl)) return;

  // Legacy drafts can retain a source URL. Recover only images already stored by eBay.
  const current = await ebayRequest(token, "GET", `/inventory_item/${encodeURIComponent(draft.sku)}`, undefined, draft.marketplaceId);
  const recovered = (current.product?.imageUrls || []).filter(isEbayHostedImageUrl).slice(0, 12);
  if (!recovered.length) throw new Error("eBay-hosted, islenmis gorsel olmadan envanter senkronize edilemez.");
  draft.imageUrls = recovered;
}

async function syncEbayDraft(stored, updates) {
  if (!/^DE-INV-\d{6,20}$/.test(String(stored.sku || ""))) {
    throw new Error("Kaynak tanimlayici iceren eski SKU eBay'e senkronize edilemez. Temiz SKU ile yeni taslak olusturun.");
  }
  const quantity = Number(updates.quantity);
  const price = Number(updates.price);
  if (!Number.isInteger(quantity) || quantity < 0) throw new Error("quantity sifir veya pozitif tam sayi olmalidir.");
  if (!Number.isFinite(price) || price <= 0) throw new Error("price pozitif bir sayi olmalidir.");
  const next = { ...stored, quantity, price: price.toFixed(2), updatedAt: new Date().toISOString() };
  if (updates.basicAdRate !== undefined) {
    const rate = Number(updates.basicAdRate);
    if (!Number.isFinite(rate) || rate < 2 || rate > 100 || Math.abs(rate * 10 - Math.round(rate * 10)) > 0.000001) {
      throw new Error("Basic reklam orani 2-100 arasinda, en fazla bir ondalik basamakli olmali.");
    }
    next.promotion = { fundingModel: "COST_PER_SALE", bidPercentage: rate.toFixed(1), status: "PENDING_ACTIVATION" };
  }
  if (mode !== "api") return next;

  const token = await accessToken();
  await ensureEbayHostedImages(token, next);
  await ebayRequest(token, "PUT", `/inventory_item/${encodeURIComponent(next.sku)}`, {
    availability: { shipToLocationAvailability: { quantity: next.quantity } },
    condition: "NEW",
    product: {
      title: next.title,
      description: next.description,
      imageUrls: next.imageUrls,
      aspects: next.itemSpecifics || {},
    },
  }, next.marketplaceId);

  if (next.offerId && !String(next.offerId).startsWith("mock-")) {
    await ebayRequest(token, "PUT", `/offer/${encodeURIComponent(next.offerId)}`, {
      sku: next.sku,
      marketplaceId: next.marketplaceId || "EBAY_DE",
      format: "FIXED_PRICE",
      availableQuantity: next.quantity,
      categoryId: next.categoryId,
      merchantLocationKey: next.merchantLocationKey,
      listingDescription: next.description,
      listingPolicies: next.listingPolicies,
      pricingSummary: { price: { currency: next.currency || "EUR", value: next.price } },
    }, next.marketplaceId);
  }
  return next;
}

async function refreshPublishedEbayDraft(stored, input) {
  if (stored.status !== "PUBLISHED") throw new Error("Yalnızca yayındaki ilan yenilenebilir.");
  if (mode !== "api") throw new Error("Canlı ilan yenileme için eBay API modu gerekli.");
  const assets = Array.isArray(input.processedImageData)
    ? input.processedImageData.filter((asset) => /^data:image\/(jpeg|jpg|png);base64,/i.test(String(asset?.dataUrl || ""))).slice(0, 12)
    : [];
  if (!assets.length) throw new Error("Yenileme için işlenmiş galeri görseli gerekli.");
  const token = await accessToken();
  const next = {
    ...stored,
    description: sanitizeEbayText(input.description || stored.description),
    itemSpecifics: Object.fromEntries(Object.entries(input.itemSpecifics || stored.itemSpecifics || {})
      .map(([key, values]) => [sanitizeEbayText(key).slice(0, 40), (Array.isArray(values) ? values : [values]).map((value) => sanitizeEbayText(value).slice(0, 120)).filter(Boolean).slice(0, 10)])
      .filter(([key, values]) => key && values.length).slice(0, 30)),
    processedImageData: assets,
    imageUrls: [],
    updatedAt: new Date().toISOString(),
  };
  if (input.preserveExistingSecondaryImages === true) {
    // A primary-image repair must not discard an otherwise valid detail gallery.
    const uploadedPrimary = await uploadProcessedImages(token, next.processedImageData);
    next.imageUrls = [...uploadedPrimary, ...(stored.imageUrls || []).slice(1).filter(isEbayHostedImageUrl)].slice(0, 12);
    delete next.processedImageData;
  } else {
    await ensureEbayHostedImages(token, next);
  }
  await ebayRequest(token, "PUT", `/inventory_item/${encodeURIComponent(next.sku)}`, {
    availability: { shipToLocationAvailability: { quantity: next.quantity } },
    condition: "NEW",
    product: { title: next.title, description: next.description, imageUrls: next.imageUrls, aspects: next.itemSpecifics },
  }, next.marketplaceId);
  if (next.offerId && !String(next.offerId).startsWith("mock-")) {
    await ebayRequest(token, "PUT", `/offer/${encodeURIComponent(next.offerId)}`, {
      sku: next.sku, marketplaceId: next.marketplaceId || "EBAY_DE", format: "FIXED_PRICE",
      availableQuantity: next.quantity, categoryId: next.categoryId, merchantLocationKey: next.merchantLocationKey,
      listingDescription: next.description, listingPolicies: next.listingPolicies,
      pricingSummary: { price: { currency: next.currency || "EUR", value: next.price } },
    }, next.marketplaceId);
  }
  return next;
}

async function productionReadiness() {
  const reasons = [];
  const warnings = [];
  const oauth = oauthState();
  if (mode !== "api") reasons.push("eBay bridge API modunda degil.");
  if (environment !== "production") reasons.push("Bridge Production yerine Sandbox ortaminda.");
  if (!oauth.hasAccessToken && !oauth.hasRefreshCredentials) reasons.push("Kullanilabilir Production OAuth bilgisi eksik.");
  if (!oauth.hasRefreshCredentials) warnings.push("Kalici otomasyon refresh token ile yapilandirilmadi; mevcut erisim tokeni gecicidir.");

  if (mode === "api" && (oauth.hasAccessToken || oauth.hasRefreshCredentials)) {
    try {
      const configuration = await getConfiguration("EBAY_DE", true);
      if (!configuration.sellerTemplate.merchantLocationKey) reasons.push("Etkin bir merchant location bulunamadi.");
      if (!configuration.sellerTemplate.fulfillmentPolicyId) reasons.push("Fulfillment policy bulunamadi.");
      if (!configuration.sellerTemplate.paymentPolicyId) reasons.push("Payment policy bulunamadi.");
      if (!configuration.sellerTemplate.returnPolicyId) reasons.push("Return policy bulunamadi.");
    } catch (error) {
      reasons.push(`Production eBay yapilandirmasi okunamadi: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return {
    ready: reasons.length === 0,
    automationReady: oauth.hasRefreshCredentials && reasons.length === 0,
    temporaryAccess: oauth.hasAccessToken && !oauth.hasRefreshCredentials,
    livePublishEnabled: livePublishEnabled(),
    reasons,
    warnings,
  };
}

async function publishEbayDraft(stored) {
  if (!livePublishEnabled()) throw new Error("Canli yayin için Production eBay API modu gerekli.");
  if (stored.status === "PUBLISHED") return stored;
  if (!/^DE-INV-\d{6,20}$/.test(String(stored.sku || ""))) {
    throw new Error("Kaynak tanimlayici iceren eski SKU eBay'e gonderilemez. Temiz SKU ile yeni taslak olusturun.");
  }
  if (!stored.offerId || String(stored.offerId).startsWith("mock-")) throw new Error("Yayinlanabilir bir eBay Offer bulunamadi.");
  if (!Number.isInteger(stored.quantity) || stored.quantity <= 0) throw new Error("Miktari 0 olan taslak yayinlanamaz.");
  let publishable = stored;
  const categoryOverride = categoryOverrideForTitle(stored.title);
  const categoryChanged = Boolean(categoryOverride && categoryOverride !== String(stored.categoryId || ""));
  if (categoryChanged) {
    publishable = { ...publishable, categoryId: categoryOverride, updatedAt: new Date().toISOString() };
    debugEvent("CATEGORY_AUTO_CORRECTED", {
      sku: stored.sku, previousCategoryId: stored.categoryId || "", categoryId: categoryOverride, reason: "BABY_WIPES",
    });
  }
  let requiredAspectsCompleted = [];
  try {
    const rules = await categoryAspectRules(publishable.categoryId, publishable.marketplaceId || "EBAY_DE");
    const completed = completeRequiredAspects(publishable, rules);
    publishable = completed.stored;
    requiredAspectsCompleted = completed.completed;
  } catch (error) {
    debugEvent("ITEM_SPECIFIC_AUTO_COMPLETE_ERROR", { sku: stored.sku, message: error.message });
  }
  const validation = await debugStage("PRE_PUBLISH_VALIDATION", { draftId: publishable.id, sku: publishable.sku }, () => validateEbayDraft(publishable));
  if (!validation.ready) throw new Error(`Yayin oncesi kontrol basarisiz: ${validation.errors.join(" ")}`);
  const token = await accessToken();
  if (categoryChanged) {
    await debugStage("OFFER_CATEGORY_UPDATE", { draftId: publishable.id, sku: publishable.sku, categoryId: publishable.categoryId }, () =>
      ebayRequest(token, "PUT", `/offer/${encodeURIComponent(publishable.offerId)}`, {
        sku: publishable.sku,
        marketplaceId: publishable.marketplaceId || "EBAY_DE",
        format: "FIXED_PRICE",
        availableQuantity: publishable.quantity,
        categoryId: publishable.categoryId,
        merchantLocationKey: publishable.merchantLocationKey,
        listingDescription: publishable.description,
        listingPolicies: publishable.listingPolicies,
        pricingSummary: { price: { currency: publishable.currency || "EUR", value: publishable.price } },
      }, publishable.marketplaceId));
  }
  if (requiredAspectsCompleted.length) {
    await debugStage("INVENTORY_ITEM_ASPECT_UPDATE", { draftId: publishable.id, sku: publishable.sku, aspects: requiredAspectsCompleted.map((item) => item.aspect) }, () =>
      ebayRequest(token, "PUT", `/inventory_item/${encodeURIComponent(publishable.sku)}`, {
        availability: { shipToLocationAvailability: { quantity: publishable.quantity } },
        condition: "NEW",
        product: { title: publishable.title, description: publishable.description, imageUrls: publishable.imageUrls, aspects: publishable.itemSpecifics },
      }, publishable.marketplaceId));
  }
  const result = await debugStage("OFFER_PUBLISH", { draftId: publishable.id, sku: publishable.sku, offerId: publishable.offerId }, () =>
    ebayRequest(token, "POST", `/offer/${encodeURIComponent(publishable.offerId)}/publish`, undefined, publishable.marketplaceId));
  return {
    ...publishable,
    status: "PUBLISHED",
    listingId: result.listingId || null,
    ebay_item_id: result.listingId || null,
    publishedAt: new Date().toISOString(),
  };
}

const server = http.createServer(async (request, response) => {
  const cors = corsHeaders(request);
  if (request.method === "OPTIONS") return send(response, 204, {}, cors);
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  try {
    if (sharedSecret) {
      const supplied = String(request.headers["x-autolister-bridge-key"] || "");
      const expectedBytes = Buffer.from(sharedSecret);
      const suppliedBytes = Buffer.from(supplied);
      if (expectedBytes.length !== suppliedBytes.length || !crypto.timingSafeEqual(expectedBytes, suppliedBytes)) {
        return send(response, 401, { message: "Bridge authorization required." }, cors);
      }
    }
    if (request.method === "GET" && url.pathname === "/api/ebay/oauth/authorize-url") {
      return send(response, 200, createAuthorizationUrl(), cors);
    }
    if (request.method === "GET" && url.pathname === "/api/ebay/oauth/callback") {
      const state = url.searchParams.get("state") || "";
      const code = url.searchParams.get("code") || "";
      const oauthError = url.searchParams.get("error");
      const validUntil = oauthStates.get(state);
      oauthStates.delete(state);
      if (oauthError) throw new Error(`eBay yetkilendirmesi reddedildi: ${oauthError}`);
      if (!state || !validUntil || validUntil <= Date.now()) throw new Error("OAuth state gecersiz veya suresi dolmus.");
      if (!code || code.length > 4096) throw new Error("OAuth authorization code eksik veya gecersiz.");
      await exchangeAuthorizationCode(code);
      return sendHtml(response, 200, "<!doctype html><meta charset=\"utf-8\"><title>Alltaghaus OAuth</title><h1>eBay baglantisi tamamlandi</h1><p>Kalici refresh token guvenli yerel dosyaya kaydedildi. Bu sekmeyi kapatabilirsiniz.</p>");
    }
    if (request.method === "GET" && url.pathname === "/api/health") {
      const oauth = oauthState();
      return send(response, 200, {
        ok: true,
        mode,
        environment,
        service: "alltaghaus-ebay-bridge",
        version: "0.8.3",
        oauthConfigured: oauth.hasAccessToken || oauth.hasRefreshCredentials,
        tokenMode: oauth.hasRefreshCredentials ? "refresh_token" : oauth.hasAccessToken ? "access_token" : "none",
        automationReady: oauth.hasRefreshCredentials,
        supabaseConfigured: supabaseConfigured(),
        monitor: monitorState,
      }, cors);
    }
    if (request.method === "GET" && url.pathname === "/api/ebay/monitor/status") {
      return send(response, 200, monitorState, cors);
    }
    if (request.method === "GET" && url.pathname === "/api/ebay/status") {
      const token = await accessToken();
      const inventory = await ebayRequest(token, "GET", "/inventory_item?limit=1");
      return send(response, 200, {
        ok: true,
        environment,
        inventoryTotal: Number(inventory.total || 0),
      }, cors);
    }
    if (request.method === "GET" && url.pathname === "/api/ebay/configuration") {
      const marketplaceId = url.searchParams.get("marketplaceId") || "EBAY_DE";
      const refresh = url.searchParams.get("refresh") === "true";
      return send(response, 200, await getConfiguration(marketplaceId, refresh), cors);
    }
    if (request.method === "GET" && url.pathname === "/api/ebay/readiness") {
      return send(response, 200, await productionReadiness(), cors);
    }
    if (request.method === "GET" && url.pathname === "/api/debug/events") {
      return send(response, 200, { events: debugEvents.slice(0, 100) }, cors);
    }
    if (request.method === "GET" && url.pathname === "/api/legacy-mappings") {
      if (!supabaseConfigured()) return send(response, 200, { mappings: [], configured: false }, cors);
      const context = await authenticateRequest(request, { required: process.env.SUPABASE_AUTH_REQUIRED === "true" });
      return send(response, 200, { mappings: await listLegacyMappings(context), configured: true }, cors);
    }
    if (request.method === "POST" && url.pathname === "/api/legacy-mappings") {
      const context = await authenticateRequest(request, { required: process.env.SUPABASE_AUTH_REQUIRED === "true" });
      const input = await readJson(request);
      if (!/^\d{9,19}$/.test(String(input.itemId || ""))) throw Object.assign(new Error("Geçerli bir eBay Item ID gerekli."), { status: 400 });
      if (!/^[A-Z0-9]{10}$/.test(String(input.asin || ""))) throw Object.assign(new Error("Geçerli bir Amazon ASIN gerekli."), { status: 400 });
      return send(response, 200, { mapping: await upsertLegacyMapping(context, input) }, cors);
    }
    if (request.method === "DELETE" && url.pathname.startsWith("/api/legacy-mappings/")) {
      const context = await authenticateRequest(request, { required: process.env.SUPABASE_AUTH_REQUIRED === "true" });
      const itemId = decodeURIComponent(url.pathname.split("/").pop());
      return send(response, 200, await deleteLegacyMapping(context, itemId), cors);
    }
    if (request.method === "GET" && url.pathname === "/api/ebay/drafts") {
      const drafts = readDrafts()
        .filter((draft) => ["READY", "DRAFT", "UNPUBLISHED", "STAGING", ""].includes(String(draft.status || "").trim().toUpperCase()))
        .map((draft) => ({ ...draft, status: ["DRAFT", "READY"].includes(String(draft.status || "").toUpperCase()) ? String(draft.status).toUpperCase() : "READY" }));
      return send(response, 200, { drafts }, cors);
    }
    if (request.method === "GET" && url.pathname === "/api/ebay/orders") {
      return send(response, 200, { orders: await getEbayOrders() }, cors);
    }
    if (request.method === "GET" && url.pathname === "/api/ebay/active-listings") {
      return send(response, 200, { listings: enrichActiveListings(await getActiveListings()) }, cors);
    }
    if (request.method === "POST" && url.pathname === "/api/ebay/active-listings/update") {
      return send(response, 200, await updateActiveListing(await readJson(request)), cors);
    }
    if (request.method === "GET" && url.pathname === "/api/ebay/drafts/archive") {
      return send(response, 200, { drafts: readArchivedDrafts() }, cors);
    }
    if (request.method === "POST" && url.pathname === "/api/ebay/drafts/archive/delete") {
      const input = await readJson(request);
      const archive = readArchivedDrafts();
      const index = archive.findIndex((draft) => draft.id === input.draftId);
      if (index < 0) throw new Error("Silinecek arşiv kaydı bulunamadı.");
      const [removed] = archive.splice(index, 1);
      writeArchivedDrafts(archive);
      return send(response, 200, { deleted: true, draftId: removed.id }, cors);
    }
    if (request.method === "GET" && url.pathname === "/api/ebay/drafts/validate") {
      const draftId = url.searchParams.get("draftId");
      const stored = readDrafts().find((draft) => draft.id === draftId);
      if (!stored) throw new Error("Dogrulanacak eBay taslagi bulunamadi.");
      return send(response, 200, await validateEbayDraft(stored), cors);
    }
    if (request.method === "GET" && url.pathname === "/api/ebay/draft-jobs") {
      return send(response, 200, { jobs: [...draftJobs.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, 30) }, cors);
    }
    if (request.method === "GET" && url.pathname.startsWith("/api/ebay/draft-jobs/")) {
      const job = draftJobs.get(url.pathname.split("/").pop());
      return send(response, job ? 200 : 404, job || { message: "Taslak işlemi bulunamadı; Dashboard durumunu kontrol edin." }, cors);
    }
    if (request.method === "POST" && url.pathname === "/api/ebay/drafts") {
      const draft = validateDraft(await readJson(request));
      const execute = async () => {
      const drafts = readDrafts();
      const existing = drafts.find((item) => item.sku === draft.sku || item.sourceId === draft.sourceId);
      const canReplaceExisting = existing
        && existing.status !== "PUBLISHED"
        && (draft.imageUrls.length > 0 || draft.processedImageData.length > 0);
      if (existing && !canReplaceExisting) {
        return {
          draftId: existing.id,
          offerId: existing.offerId || null,
          stage: existing.stage || "OFFER_READY",
          mode: existing.mode || mode,
          status: existing.status || "UNPUBLISHED",
          listingId: existing.listingId || null,
          sku: existing.sku,
          created: false,
        };
      }
      if (!draft.imageUrls.length && !draft.processedImageData.length) {
        throw new Error("En az bir islenmis gorsel gerekli.");
      }
      const id = existing?.id || `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const ebay = mode === "api"
        ? await createEbayDraft(draft)
        : { offerId: `mock-${draft.sku}`, stage: "OFFER_READY" };
      const stored = { id, ...draft, ...ebay, mode, status: "UNPUBLISHED", createdAt: new Date().toISOString() };
      // Re-read after network operations so concurrent products are not lost.
      const latest = readDrafts();
      const savedIndex = latest.findIndex((item) => item.id === id);
      if (savedIndex >= 0) latest[savedIndex] = stored;
      else latest.unshift(stored);
      writeDrafts(latest);
      if (draft.autoPublish === true) {
        const published = await publishEbayDraft(stored);
        const current = readDrafts();
        const publishIndex = current.findIndex((item) => item.id === id);
        if (publishIndex < 0) throw new Error("Yayınlanan taslak sunucu havuzunda bulunamadı.");
        current[publishIndex] = published;
        writeDrafts(current);
        return {
          draftId: id,
          offerId: published.offerId || null,
          listingId: published.listingId || null,
          status: published.status,
          stage: "PUBLISHED",
          sku: published.sku,
          created: !existing,
        };
      }
      return {
        draftId: id,
        offerId: ebay.offerId || null,
        stage: ebay.stage,
        mode,
        status: stored.status,
        sku: stored.sku,
        created: !existing,
        replaced: Boolean(existing),
      };
      };
      if (url.searchParams.get("async") === "1") {
        for (const [id, job] of draftJobs) {
          if (job.status !== "RUNNING" && Date.now() - job.startedAt > 3600000) draftJobs.delete(id);
        }
        const existingJob = [...draftJobs.values()].find((job) => job.sourceId === draft.sourceId && job.status === "RUNNING");
        if (existingJob) return send(response, 202, { jobId: existingJob.jobId }, cors);
        const jobId = crypto.randomUUID();
        const job = { jobId, sourceId: draft.sourceId, status: "RUNNING", startedAt: Date.now() };
        draftJobs.set(jobId, job);
        persistDraftJobs();
        void execute().then((result) => {
          Object.assign(job, { status: "SUCCEEDED", result, completedAt: Date.now() });
          persistDraftJobs();
        }).catch((error) => {
          Object.assign(job, { status: "FAILED", message: error.message, error: toPublicError(error), completedAt: Date.now() });
          persistDraftJobs();
        });
        return send(response, 202, { jobId }, cors);
      }
      const result = await execute();
      return send(response, result.created === false && !result.replaced ? 200 : 201, result, cors);
    }
    if (request.method === "POST" && url.pathname === "/api/ebay/drafts/sync") {
      const input = await readJson(request);
      const drafts = readDrafts();
      const index = drafts.findIndex((draft) => draft.id === input.draftId || draft.sku === input.sku || draft.sourceId === input.sourceId);
      if (index < 0) throw new Error("Senkronize edilecek eBay taslagi bulunamadi.");
      const updated = await syncEbayDraft(drafts[index], input);
      drafts[index] = updated;
      writeDrafts(drafts);
      return send(response, 200, {
        draftId: updated.id,
        offerId: updated.offerId || null,
        stage: updated.stage,
        status: updated.status,
        quantity: updated.quantity,
        price: updated.price,
      }, cors);
    }
    if (request.method === "POST" && url.pathname === "/api/ebay/drafts/delete") {
      const input = await readJson(request);
      const drafts = readDrafts();
      const index = drafts.findIndex((draft) => draft.id === input.draftId || draft.sourceId === input.sourceId);
      if (index < 0) throw new Error("Silinecek eBay taslagi bulunamadi.");
      if (drafts[index].status === "PUBLISHED" && input.localOnly !== true) throw new Error("Yayindaki ilan icin sadece dashboard kaydi kaldirilabilir.");
      const [removed] = drafts.splice(index, 1);
      writeDrafts(drafts);
      if (removed.status !== "PUBLISHED") archiveDrafts([removed], "MANUAL_DELETE");
      return send(response, 200, { deleted: true, draftId: removed.id, sourceId: removed.sourceId || "", localOnly: input.localOnly === true }, cors);
    }
    if (request.method === "POST" && url.pathname === "/api/ebay/drafts/reset") {
      const drafts = readDrafts();
      const removed = drafts.filter((draft) => draft.status !== "PUBLISHED");
      writeDrafts(drafts.filter((draft) => draft.status === "PUBLISHED"));
      archiveDrafts(removed, "STAGING_RESET");
      return send(response, 200, {
        reset: true,
        deletedCount: removed.length,
        deletedDraftIds: removed.map((draft) => draft.id),
        deletedSourceIds: removed.map((draft) => draft.sourceId).filter(Boolean),
      }, cors);
    }
    if (request.method === "POST" && url.pathname === "/api/ebay/drafts/restore") {
      const input = await readJson(request);
      const archive = readArchivedDrafts();
      const index = archive.findIndex((draft) => draft.id === input.draftId);
      if (index < 0) throw new Error("Geri yuklenecek arsiv kaydi bulunamadi.");
      const [restored] = archive.splice(index, 1);
      const drafts = readDrafts();
      const duplicate = drafts.find((draft) => draft.id === restored.id || draft.sourceId === restored.sourceId);
      if (duplicate) throw new Error("Bu urun zaten aktif havuzda bulunuyor.");
      delete restored.archivedAt;
      delete restored.archiveReason;
      restored.status = "UNPUBLISHED";
      restored.restoredAt = new Date().toISOString();
      drafts.unshift(restored);
      writeDrafts(drafts);
      writeArchivedDrafts(archive);
      return send(response, 200, { restored: true, draftId: restored.id, sourceId: restored.sourceId || "" }, cors);
    }
    if (request.method === "POST" && url.pathname === "/api/ebay/drafts/link") {
      const input = await readJson(request);
      const amazonUrl = String(input.amazonUrl || "").split("?")[0];
      if (!/^https:\/\/www\.amazon\.de\/dp\/[A-Z0-9]{10}(?:\/|$)/i.test(amazonUrl)) throw new Error("Geçerli bir amazon.de/dp/ ASIN bağlantısı gerekli.");
      const drafts = readDrafts();
      const index = drafts.findIndex((draft) => draft.id === input.draftId || draft.sourceId === input.sourceId || draft.sku === input.sku);
      if (index < 0) throw new Error("Linki güncellenecek kayıt bulunamadı.");
      drafts[index] = { ...drafts[index], amazonUrl, sourceUrl: amazonUrl, updatedAt: new Date().toISOString() };
      writeDrafts(drafts);
      return send(response, 200, { updated: true, draftId: drafts[index].id, amazonUrl }, cors);
    }
    if (request.method === "POST" && url.pathname === "/api/ebay/drafts/publish") {
      const input = await readJson(request);
      const drafts = readDrafts();
      const index = drafts.findIndex((draft) => draft.id === input.draftId);
      if (index < 0) throw new Error("Yayinlanacak eBay taslagi bulunamadi.");
      const published = await publishEbayDraft(drafts[index]);
      drafts[index] = published;
      writeDrafts(drafts);
      if (published.promotion && published.promotion.status !== "ACTIVE") {
        try {
          drafts[index] = await activatePromotion(published, { accessToken, request: ebayApiRequest });
        } catch (error) {
          drafts[index] = { ...published, promotion: { ...published.promotion, status: "ERROR", error: error.message } };
        }
        writeDrafts(drafts);
      }
      return send(response, 200, {
        draftId: published.id,
        offerId: published.offerId,
        listingId: published.listingId,
        ebay_item_id: published.listingId,
        status: published.status,
        publishedAt: published.publishedAt,
        promotion: drafts[index].promotion || null,
      }, cors);
    }
    if (request.method === "POST" && url.pathname === "/api/ebay/drafts/refresh") {
      const input = await readJson(request);
      const drafts = readDrafts();
      const index = drafts.findIndex((draft) => draft.id === input.draftId);
      if (index < 0) throw new Error("Yenilenecek canlı ilan kaydı bulunamadı.");
      const updated = await refreshPublishedEbayDraft(drafts[index], input);
      drafts[index] = updated;
      writeDrafts(drafts);
      return send(response, 200, { updated: true, draftId: updated.id, listingId: updated.listingId || null, imageCount: updated.imageUrls.length }, cors);
    }
    return send(response, 404, { message: "Endpoint bulunamadi." }, cors);
  } catch (error) {
    const publicError = toPublicError(error);
    console.error("BRIDGE REQUEST ERROR:", { method: request.method, path: url.pathname, ...publicError });
    debugEvent("HTTP_ERROR", { method: request.method, path: url.pathname, error: publicError });
    return send(response, error?.status >= 400 && error.status < 600 ? error.status : 400, publicError, cors);
  }
});

for (const job of readRecords(jobsFile)) {
  if (!job?.jobId) continue;
  if (job.status === "RUNNING") Object.assign(job, { status: "INTERRUPTED", message: "Sunucu işlem sırasında yeniden başladı; taslak durumunu kontrol edin.", completedAt: Date.now() });
  draftJobs.set(job.jobId, job);
}
persistDraftJobs();

server.listen(port, bindHost, () => {
  console.log(`Alltaghaus bridge http://${bindHost}:${port} (${mode}/${environment})`);
});
if (monitorState.enabled) {
  const runMonitor = () => void monitorPublishedProducts().catch((error) => console.error('SERVER MONITOR ERROR:', error.message));
  setTimeout(runMonitor, 120000).unref();
  setInterval(runMonitor, Math.max(300000, Number(process.env.SERVER_MONITOR_INTERVAL_MS || 1800000))).unref();
}

module.exports = { server, validateDraft, productionReadiness, validateEbayDraft, configuredSellerTemplate, createAuthorizationUrl, categoryOverrideForTitle, completeRequiredAspects, explicitShadeFromDraft };
