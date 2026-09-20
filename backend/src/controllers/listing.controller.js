const { supabaseAdmin } = require('../config/supabase');
const { uploadProductImages } = require('../services/storage.service');

async function create(req, res, next) {
  try {
    const { asin, itemId, title, images, price, stock, status = 'DRAFT' } = req.body || {};
    if (itemId || !['DRAFT', 'READY'].includes(String(status).toUpperCase())) return res.status(400).json({ error: 'Bu rota yalnızca taslak kaydeder; eBay yayın durumu sunucuda doğrulanır.' });
    const normalizedAsin = String(asin || '').toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(normalizedAsin)) return res.status(400).json({ error: 'Geçerli bir ASIN gerekli.' });
    if (itemId !== undefined && itemId !== null && !/^\d{9,19}$/.test(String(itemId))) return res.status(400).json({ error: 'Geçerli bir eBay ItemID gerekli.' });
    if (price === null || price === '' || !Number.isFinite(Number(price)) || Number(price) < 0) return res.status(400).json({ error: 'Price geçerli değil.' });
    if (stock === null || stock === '' || !Number.isInteger(Number(stock)) || Number(stock) < 0) return res.status(400).json({ error: 'Stock geçerli değil.' });
    if (!Array.isArray(images) || images.length > 24) return res.status(400).json({ error: 'En fazla 24 görsel gönderilebilir.' });
    const existing = await supabaseAdmin.from('products').select('*').eq('user_id', req.userId).eq('asin', normalizedAsin).maybeSingle();
    if (existing.error) throw existing.error;
    // Saving again is idempotent and cannot demote or overwrite a live listing.
    if (existing.data) return res.status(200).json({ product: existing.data, imageUrls: existing.data.images, existing: true });
    const imageUrls = await uploadProductImages(images, req.userId, normalizedAsin);
    const product = { user_id: req.userId, asin: normalizedAsin, title: String(title || '').trim() || null, images: imageUrls, item_id: itemId ? String(itemId) : null, price: Number(price), stock: Number(stock), status: String(status).toUpperCase() };
    const { error } = await supabaseAdmin.from('products').upsert(product, { onConflict: 'user_id,asin', ignoreDuplicates: true });
    if (error) return next(error);
    const { data, error: readError } = await supabaseAdmin.from('products').select('*').eq('user_id', req.userId).eq('asin', normalizedAsin).single();
    if (readError) throw readError;
    res.status(201).json({ product: data, imageUrls });
  } catch (error) { next(error); }
}
module.exports = { create };
