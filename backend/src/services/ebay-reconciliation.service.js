const { supabaseAdmin } = require('../config/supabase');
const bridge = require('./ebay-bridge.service');

async function reconcilePublishedListings() {
  if (!bridge.configured()) return { checked: 0, updated: 0 };
  const ownerId = String(process.env.EBAY_LEGACY_OWNER_USER_ID || '').trim();
  if (!ownerId) return { checked: 0, updated: 0 };
  const { data } = await bridge.request(ownerId, '/ebay/active-listings', { timeoutMs: 90000 });
  let updated = 0;
  for (const listing of data.listings || []) {
    const asin = String(listing.sourceId || listing.amazonAsin || '').toUpperCase();
    const itemId = String(listing.listingId || '');
    if (!/^[A-Z0-9]{10}$/.test(asin) || !/^\d{9,19}$/.test(itemId)) continue;
    const existing = await supabaseAdmin.from('products').select('item_id,status').eq('user_id', ownerId).eq('asin', asin).maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data || (existing.data.item_id === itemId && existing.data.status === 'ACTIVE')) continue;
    const { error } = await supabaseAdmin.from('products').update({
      item_id: itemId,
      status: 'ACTIVE',
      updated_at: new Date().toISOString(),
    }).eq('user_id', ownerId).eq('asin', asin);
    if (error) throw error;
    updated += 1;
  }
  return { checked: (data.listings || []).length, updated };
}

function startReconciliation() {
  if (!bridge.configured()) return;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await reconcilePublishedListings(); }
    catch (error) { console.error('eBay reconciliation failed:', error.message); }
    finally { running = false; }
  };
  setTimeout(run, 30000).unref();
  setInterval(run, 10 * 60 * 1000).unref();
}

module.exports = { reconcilePublishedListings, startReconciliation };
