const crypto = require('node:crypto');
const { supabaseAdmin } = require('../config/supabase');
const { requireUser, connectionFor } = require('./ebay-connection.service');

const apiOrigin = String(process.env.EBAY_ENV || 'production').toLowerCase() === 'sandbox'
  ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
const marketplaceId = process.env.EBAY_MARKETPLACE_ID || 'EBAY_DE';
const mediaOrigin = String(process.env.EBAY_ENV || 'production').toLowerCase() === 'sandbox'
  ? 'https://apim.sandbox.ebay.com' : 'https://apim.ebay.com';
const imageUploadTimeoutMs = Math.max(30_000, Number(process.env.EBAY_IMAGE_UPLOAD_TIMEOUT_MS || 150_000));
const imageUploadAttempts = Math.min(4, Math.max(1, Number(process.env.EBAY_IMAGE_UPLOAD_ATTEMPTS || 3)));

function credentials() {
  return { clientId: process.env.EBAY_APP_ID || process.env.EBAY_CLIENT_ID, clientSecret: process.env.EBAY_CERT_ID || process.env.EBAY_CLIENT_SECRET, ruName: process.env.EBAY_RU_NAME };
}
const tokenCache = new Map();
let applicationToken = null;
let applicationTokenExpiresAt = 0;
async function browseToken() {
  const clientId = String(process.env.EBAY_CLIENT_ID || process.env.EBAY_APP_ID || '').trim();
  const clientSecret = String(process.env.EBAY_CLIENT_SECRET || process.env.EBAY_CERT_ID || '').trim();
  if (!clientId || !clientSecret) return null;
  if (applicationToken && applicationTokenExpiresAt > Date.now() + 60_000) return applicationToken;
  const response = await fetch(`${apiOrigin}/identity/v1/oauth2/token`, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'https://api.ebay.com/oauth/api_scope/buy.item.bulk' }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) return null;
  applicationToken = body.access_token; applicationTokenExpiresAt = Date.now() + Number(body.expires_in || 7200) * 1000;
  return applicationToken;
}
async function accessToken(userId) {
  const connection = await connectionFor(userId);
  if (!connection) return null;
  const cached = tokenCache.get(userId);
  const configured = String(connection.access_token || '').trim();
  const clientId = String(process.env.EBAY_CLIENT_ID || process.env.EBAY_APP_ID || '').trim();
  const clientSecret = String(process.env.EBAY_CLIENT_SECRET || process.env.EBAY_CERT_ID || '').trim();
  const refreshToken = String(connection.refresh_token || '').trim();
  if (cached?.refreshToken === refreshToken && cached.expiresAt > Date.now() + 60_000) return cached.token;
  if (refreshToken && clientId && clientSecret) {
    const response = await fetch(`${apiOrigin}/identity/v1/oauth2/token`, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, scope: 'https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.fulfillment https://api.ebay.com/oauth/api_scope/sell.account' }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.access_token) throw new Error(body.error_description || body.error || `eBay OAuth HTTP ${response.status}`);
    tokenCache.set(userId, { token: body.access_token, refreshToken, expiresAt: Date.now() + Number(body.expires_in || 7200) * 1000 });
    return body.access_token;
  }
  return configured;
}
function authUrl() {
  const { clientId, ruName } = credentials();
  if (!clientId || !ruName) throw new Error('EBAY_APP_ID ve EBAY_RU_NAME eksik.');
  const state = crypto.randomBytes(18).toString('hex');
  const url = new URL('https://auth.ebay.com/oauth2/authorize');
  url.searchParams.set('client_id', clientId); url.searchParams.set('redirect_uri', ruName); url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account'); url.searchParams.set('state', state);
  return { url: url.toString(), state };
}
async function request(userId, method, path, body) {
  const token = await accessToken(userId); if (!token) throw new Error('EBAY OAuth/Access Token eksik.');
  const response = await fetch(`${apiOrigin}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Language': 'de-DE', 'Content-Language': 'de-DE', 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_DE' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.errors?.[0]?.message || data.message || `eBay HTTP ${response.status}`); return data;
}
function imageAssetToBlob(asset, index) {
  const match = String(asset?.dataUrl || '').match(/^data:(image\/(?:jpeg|jpg|png));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw new Error(`Görsel ${index + 1} geçerli bir JPEG veya PNG verisi içermiyor.`);
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw new Error(`Görsel ${index + 1} eBay'in 10 MB sınırını aşıyor.`);
  return { buffer, mimeType: match[1].toLowerCase().replace('jpg', 'jpeg') };
}
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function uploadProcessedImage(token, asset, index) {
  const { buffer, mimeType } = imageAssetToBlob(asset, index);
  let lastError;
  for (let attempt = 1; attempt <= imageUploadAttempts; attempt += 1) {
    try {
      const form = new FormData();
      form.append('image', new Blob([buffer], { type: mimeType }), `product-${index + 1}.${mimeType === 'image/png' ? 'png' : 'jpg'}`);
      const response = await fetch(`${mediaOrigin}/commerce/media/v1_beta/image/create_image_from_file`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, body: form,
        signal: AbortSignal.timeout(imageUploadTimeoutMs),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.errors?.[0]?.message || body.message || `eBay Media HTTP ${response.status}`);
      let imageUrl = body.imageUrl;
      const location = response.headers.get('location');
      if (!imageUrl && location) {
        const details = await fetch(new URL(location, mediaOrigin), {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(30_000),
        });
        const detailBody = await details.json().catch(() => ({}));
        if (!details.ok) throw new Error(detailBody.errors?.[0]?.message || detailBody.message || `eBay image metadata HTTP ${details.status}`);
        imageUrl = detailBody.imageUrl;
      }
      if (!/^https:\/\/i\.ebayimg\.com\//i.test(String(imageUrl || ''))) throw new Error('eBay geçerli bir barındırılan görsel URLsi döndürmedi.');
      return imageUrl;
    } catch (error) {
      lastError = error;
      if (attempt < imageUploadAttempts) await wait(1_000 * attempt);
    }
  }
  const timeout = lastError?.name === 'TimeoutError' || lastError?.name === 'AbortError';
  throw new Error(`Görsel ${index + 1} yüklenemedi${timeout ? `: eBay ${Math.round(imageUploadTimeoutMs / 1000)} saniye içinde yanıt vermedi.` : `: ${lastError?.message || 'bilinmeyen ağ hatası'}`}`);
}
async function uploadProcessedImages(token, assets) {
  const list = Array.isArray(assets) ? assets.slice(0, 12) : [];
  if (!list.length) return [];
  // eBay Media API'sine sıralı gönderim bağlantı dalgalanmalarında ilk görselin
  // yarım kalmasını engeller; tüm ikon/etiket ayrıntıları kaynak JPEG'de korunur.
  const urls = [];
  for (let index = 0; index < list.length; index += 1) urls.push(await uploadProcessedImage(token, list[index], index));
  return urls;
}
async function createDraft(input = {}, userId) {
  const sku = String(input.sku || `DE-${Date.now()}`); const quantity = Number(input.quantity ?? input.stock ?? 1);
  const token = await accessToken(userId); if (!token) throw new Error('EBAY OAuth/Access Token eksik.');
  const processedImages = Array.isArray(input.processedImageData) ? input.processedImageData : [];
  const imageUrls = processedImages.length ? await uploadProcessedImages(token, processedImages) : (Array.isArray(input.imageUrls || input.images) ? (input.imageUrls || input.images) : []);
  if (!imageUrls.length) throw new Error('eBay taslağı için en az bir işlenmiş görsel gerekli.');
  const inventory = { availability: { shipToLocationAvailability: { quantity } }, product: { title: input.title || 'Produkt', description: input.description || '', imageUrls, aspects: input.itemSpecifics || {} } };
  await request(userId, 'PUT', `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, inventory);
  const offer = await request(userId, 'POST', '/sell/inventory/v1/offer', { sku, marketplaceId, format: 'FIXED_PRICE', availableQuantity: quantity, categoryId: String(input.categoryId || ''), merchantLocationKey: input.merchantLocationKey || process.env.EBAY_MERCHANT_LOCATION_KEY, listingDescription: input.description || '', listingPolicies: input.listingPolicies || {}, pricingSummary: { price: { currency: input.currency || 'EUR', value: String(input.price || '0.00') } } });
  return { ...offer, sku, status: 'DRAFT' };
}
async function markProductPublished(userId, input, publishResult) {
  const ebayItemId = String(
    publishResult?.listingId || publishResult?.itemId || publishResult?.ebayItemId || input.ebayItemId || '',
  ).trim();
  const productId = String(input.productId || '').trim();
  const sku = String(input.sku || input.asin || '').trim().toUpperCase();
  if (!ebayItemId) throw new Error('eBay yayın yanıtında Item ID bulunamadı; ürün yerel olarak aktif işaretlenmedi.');

  let query = supabaseAdmin.from('products').update({
    item_id: ebayItemId,
    status: 'ACTIVE',
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId);
  if (productId) query = query.eq('id', productId);
  else if (sku) query = query.eq('asin', sku);
  else throw new Error('Yayınlanan ürünü eşleştirmek için productId veya sku gerekli.');

  const { data, error } = await query.select('id,user_id,asin,title,images,item_id,price,stock,status,updated_at').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Yayınlanan ürün bu kullanıcıya ait yerel ürün havuzunda bulunamadı.');
  return data;
}
async function publishDraft(input = {}, userId) {
  if (!input.offerId) throw new Error('offerId gerekli.');
  const published = await request(userId, 'POST', `/sell/inventory/v1/offer/${encodeURIComponent(input.offerId)}/publish`);
  const product = await markProductPublished(userId, input, published);
  return {
    ...published,
    status: 'PUBLISHED',
    publishedAt: new Date().toISOString(),
    ebay_item_id: product.item_id,
    product,
  };
}
async function listDrafts(userId) {
  requireUser(userId);
  const query = supabaseAdmin.from('products').select('*').eq('user_id', userId).in('status', ['DRAFT', 'READY']).order('created_at', { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row) => ({ ...row, id: row.id, sku: row.asin, sourceId: row.asin, title: row.title || row.asin, imageUrls: row.images || [], quantity: row.stock, price: String(row.price), status: row.status }));
}
function xmlValue(xml, tag) { const match = String(xml).match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')); return match ? match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() : ''; }
function xmlActiveItems(xml) { return [...String(xml).matchAll(/<Item\b[^>]*>([\s\S]*?)<\/Item>/gi)].map((match) => { const item = match[1]; const pictureUrls = [...String(item).matchAll(/<(?:[A-Za-z0-9_]+:)?(?:GalleryURL|PictureURL)\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?(?:GalleryURL|PictureURL)>/gi)].map((picture) => picture[1].replace(/&amp;/g, '&').trim()).filter((url) => /^https?:\/\//i.test(url)); return { sku: xmlValue(item, 'SKU'), offerId: '', listingId: xmlValue(item, 'ItemID'), status: 'PUBLISHED', title: xmlValue(item, 'Title'), quantity: Number(xmlValue(item, 'QuantityAvailable') || xmlValue(item, 'Quantity') || 0), price: xmlValue(item, 'CurrentPrice') || xmlValue(item, 'StartPrice') || '0.00', currency: 'EUR', imageUrls: [...new Set(pictureUrls)].slice(0, 5), source: 'trading' }; }); }
async function publicListingImages(itemId) {
  const response = await fetch(`https://www.ebay.de/itm/${encodeURIComponent(itemId)}`, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AutoLister/1.0)', 'Accept-Language': 'de-DE,de;q=0.9' }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) return [];
  const html = await response.text();
  return [...html.matchAll(/https:\/\/i\.ebayimg\.com\/images\/g\/[^"'\s<&]+/gi)].map((match) => match[0].replace(/&amp;/g, '&'));
}
async function browseListingImages(itemId) {
  const token = await browseToken();
  if (!token) return [];
  const response = await fetch(`${apiOrigin}/buy/browse/v1/item/v1|${encodeURIComponent(itemId)}|0`, { headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': marketplaceId, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return [];
  return [body.image?.imageUrl, ...(body.additionalImages || []).map((image) => image?.imageUrl)].filter((url) => /^https:\/\/i\.ebayimg\.com\//i.test(String(url)));
}
async function hydrateListingImages(listings, userId) {
  const result = [];
  for (let index = 0; index < listings.length; index += 4) {
    const chunk = listings.slice(index, index + 4);
    result.push(...await Promise.all(chunk.map(async (listing) => {
      if (listing.imageUrls?.length || !listing.sku) return listing;
      try {
        const inventory = await request(userId, 'GET', `/sell/inventory/v1/inventory_item/${encodeURIComponent(listing.sku)}`);
        const imageUrls = inventory.product?.imageUrls || [];
        if (imageUrls.length) return { ...listing, title: inventory.product?.title || listing.title, imageUrls };
      } catch (error) {
        console.warn('eBay inventory image unavailable:', { sku: listing.sku, message: error.message });
      }
      try {
        const body = `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${String(listing.listingId).replace(/[^0-9]/g, '')}</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeItemSpecifics>false</IncludeItemSpecifics></GetItemRequest>`;
        const response = await fetch(`${apiOrigin}/ws/api.dll`, { method: 'POST', headers: { 'Content-Type': 'text/xml', 'X-EBAY-API-CALL-NAME': 'GetItem', 'X-EBAY-API-SITEID': '77', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1423', 'X-EBAY-API-IAF-TOKEN': await accessToken(userId) }, body });
        const xml = await response.text();
        const imageUrls = [...xml.matchAll(/<(?:[A-Za-z0-9_]+:)?(?:GalleryURL|PictureURL)\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?(?:GalleryURL|PictureURL)>/gi)].map((entry) => entry[1].replace(/&amp;/g, '&').trim()).filter((url) => /^https?:\/\//i.test(url));
        return { ...listing, imageUrls: [...new Set(imageUrls)].slice(0, 12) };
      } catch (error) { console.warn('eBay GetItem image unavailable:', { itemId: listing.listingId, message: error.message }); }
      try {
        const browseImages = await browseListingImages(listing.listingId);
        if (browseImages.length) return { ...listing, imageUrls: [...new Set(browseImages)].slice(0, 12) };
        return { ...listing, imageUrls: [...new Set(await publicListingImages(listing.listingId))].slice(0, 12) };
      }
      catch (error) { console.warn('eBay public listing image unavailable:', { itemId: listing.listingId, message: error.message }); return listing; }
    })));
  }
  return result;
}
async function listTradingActiveListings(userId) { const token = await accessToken(userId); if (!token) return []; const body = '<?xml version="1.0" encoding="utf-8"?><GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>1</PageNumber></Pagination></ActiveList></GetMyeBaySellingRequest>'; const response = await fetch(`${apiOrigin}/ws/api.dll`, { method: 'POST', headers: { 'Content-Type': 'text/xml', 'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling', 'X-EBAY-API-SITEID': '77', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1423', 'X-EBAY-API-IAF-TOKEN': token }, body }); const xml = await response.text(); if (!response.ok || /<Ack>Failure<\/Ack>/i.test(xml)) throw new Error(`eBay aktif ilanlar alınamadı (HTTP ${response.status}).`); return xmlActiveItems(xml); }
async function listOrders(userId) { if (!(await accessToken(userId))) return { orders: [], configured: false }; return { orders: (await request(userId, 'GET', '/sell/fulfillment/v1/order?limit=100&fieldGroups=TAX_BREAKDOWN')).orders || [], configured: true }; }
async function mergeStoredListingImages(listings, userId) {
  if (!userId) return listings;
  const { data, error } = await supabaseAdmin.from('products').select('item_id,title,images,stock,price,status').eq('user_id', userId).not('item_id', 'is', null);
  if (error) throw error;
  const byItemId = new Map((data || []).map((product) => [String(product.item_id), product]));
  return listings.map((listing) => {
    const stored = byItemId.get(String(listing.listingId || ''));
    if (!stored) return listing;
    return { ...listing, title: listing.title || stored.title, imageUrls: listing.imageUrls?.length ? listing.imageUrls : (stored.images || []) };
  });
}
async function listActiveListings(userId) {
  if (!(await accessToken(userId))) return { listings: [], configured: false };
  try { const listings = await listTradingActiveListings(userId); if (listings.length) return { listings: await mergeStoredListingImages(listings, userId), configured: true, source: 'ebay-trading' }; } catch (error) { console.warn('eBay Trading active list unavailable:', error.message); }
  const result = await request(userId, 'GET', `/sell/inventory/v1/offer?marketplace_id=${encodeURIComponent(marketplaceId)}&limit=200`);
  return { listings: await mergeStoredListingImages(result.offers || [], userId), configured: true, source: 'ebay-inventory' };
}
module.exports = { authUrl, createDraft, publishDraft, listDrafts, listOrders, listActiveListings };
