const { supabaseAdmin } = require('../config/supabase');
const ebay = require('./ebay.service');

const numeric = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

async function inventorySummary(userId) {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('id, asin, title, price, stock, status, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;

  const products = data || [];
  const lowStock = products.filter((product) => numeric(product.stock) > 0 && numeric(product.stock) <= 3);
  const outOfStock = products.filter((product) => numeric(product.stock) === 0);
  const active = products.filter((product) => ['ACTIVE', 'PUBLISHED', 'GELISTET'].includes(String(product.status || '').toUpperCase()));
  return {
    total: products.length,
    active: active.length,
    lowStock: lowStock.length,
    outOfStock: outOfStock.length,
    lastUpdatedAt: products[0]?.updated_at || null,
    attention: [...outOfStock, ...lowStock].slice(0, 5).map((product) => ({
      id: product.id,
      title: product.title || product.asin,
      asin: product.asin,
      stock: numeric(product.stock),
      status: product.status,
    })),
  };
}

function calculateMargin(input = {}) {
  const sourcePrice = numeric(input.sourcePrice, NaN);
  const sellingPrice = numeric(input.sellingPrice, NaN);
  const targetMarginPercent = numeric(input.targetMarginPercent, 20);
  const ebayFeePercent = numeric(input.ebayFeePercent, 13);
  const fixedFee = numeric(input.fixedFee, 0.35);
  if (!Number.isFinite(sourcePrice) || sourcePrice < 0) throw new Error('Geçerli bir Amazon alış fiyatı gerekli.');
  if (targetMarginPercent < 0 || targetMarginPercent >= 100) throw new Error('Hedef marj %0 ile %100 arasında olmalıdır.');
  if (ebayFeePercent < 0 || ebayFeePercent >= 100 || fixedFee < 0) throw new Error('Komisyon değerleri geçersiz.');
  const recommendedSalePrice = Number(((sourcePrice + fixedFee) / (1 - ebayFeePercent / 100 - targetMarginPercent / 100)).toFixed(2));
  const finalSellingPrice = Number.isFinite(sellingPrice) && sellingPrice > 0 ? sellingPrice : recommendedSalePrice;
  const ebayFee = Number((finalSellingPrice * ebayFeePercent / 100 + fixedFee).toFixed(2));
  const profit = Number((finalSellingPrice - sourcePrice - ebayFee).toFixed(2));
  const marginPercent = finalSellingPrice > 0 ? Number((profit / finalSellingPrice * 100).toFixed(2)) : 0;
  return { sourcePrice, sellingPrice: finalSellingPrice, recommendedSalePrice, ebayFeePercent, fixedFee, ebayFee, profit, marginPercent, targetMarginPercent };
}

function trackingNumber(order) {
  const fulfillment = order.fulfillmentHrefs || order.fulfillmentStartInstructions || [];
  return order.trackingNumber || order.shippingFulfillments?.[0]?.shipmentTrackingNumber || fulfillment?.[0]?.trackingNumber || null;
}

async function trackingSummary(userId) {
  const result = await ebay.listOrders(userId);
  const orders = result.orders || [];
  const shipments = orders.map((order) => ({
    orderId: order.orderId || order.legacyOrderId || '',
    status: order.orderFulfillmentStatus || order.orderPaymentStatus || 'UNKNOWN',
    trackingNumber: trackingNumber(order),
    createdAt: order.creationDate || null,
  }));
  return {
    configured: Boolean(result.configured),
    total: shipments.length,
    withTracking: shipments.filter((shipment) => shipment.trackingNumber).length,
    awaitingTracking: shipments.filter((shipment) => !shipment.trackingNumber && !/CANCELLED/i.test(shipment.status)).length,
    shipments: shipments.slice(0, 10),
  };
}

async function overview(userId) {
  const inventory = await inventorySummary(userId);
  let tracking;
  try { tracking = await trackingSummary(userId); }
  catch (error) { tracking = { configured: false, total: 0, withTracking: 0, awaitingTracking: 0, shipments: [], error: error.message }; }
  return { inventory, margin: calculateMargin({ sourcePrice: 20, targetMarginPercent: 20 }), tracking };
}

async function saveAmazonMapping(userId, input = {}) {
  const itemId = String(input.itemId || '').trim();
  const amazonUrl = String(input.amazonUrl || '').trim();
  const asin = amazonUrl.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)?.[1] || amazonUrl.match(/^([A-Z0-9]{10})$/i)?.[1];
  if (!/^\d{9,19}$/.test(itemId) || !asin) throw new Error('eBay Item ID und eine gültige Amazon ASIN/URL sind erforderlich.');
  const ownListings = await ebay.listActiveListings(userId);
  if (!ownListings.listings.some((listing) => String(listing.listingId || listing.listing?.listingId) === itemId)) {
    throw new Error('Dieses Angebot gehört nicht zum verbundenen eBay-Konto.');
  }
  const { data, error } = await supabaseAdmin.from('legacy_listings').upsert({ user_id: userId, item_id: itemId, asin: asin.toUpperCase() }, { onConflict: 'user_id,item_id' }).select().single();
  if (error) throw error;
  return { mapping: data };
}

module.exports = { inventorySummary, calculateMargin, trackingSummary, overview, saveAmazonMapping };
