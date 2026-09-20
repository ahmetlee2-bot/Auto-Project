const express = require('express');
const rateLimit = require('express-rate-limit');
const { supabaseAdmin } = require('../config/supabase');
const ebayController = require('../controllers/ebay.controller');
const { requireAuth } = require('../middleware/auth');
const listingController = require('../controllers/listing.controller');
const automationController = require('../controllers/automation.controller');
const authController = require('../controllers/auth.controller');

const router = express.Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false, message: { success: false, data: null, error: 'Zu viele Versuche. Bitte später erneut versuchen.' } });

router.get('/health', (_req, res) => res.json({ ok: true, service: 'alltaghaus-ebay-backend' }));
router.get('/auth/config', require('../controllers/auth-config.controller').config);
router.post('/auth/register', authLimiter, authController.register);
router.post('/auth/verify-otp', authLimiter, authController.verifyOtp);
router.post('/auth/resend-otp', authLimiter, authController.resendOtp);
router.get('/auth/google', authController.google);
router.use(['/ebay', '/listings', '/automation'], requireAuth);
router.get('/ebay/auth-url', ebayController.authUrl);
router.post('/ebay/draft', ebayController.draft);
router.post('/ebay/publish', ebayController.publish);
router.get('/ebay/drafts', ebayController.drafts);
router.get('/ebay/orders', ebayController.orders);
router.get('/ebay/active-listings', ebayController.activeListings);

router.post('/listings/create', listingController.create);
router.get('/listings/status', (req, res) => res.json({ authenticated: true, userId: req.userId }));
router.get('/automation/overview', automationController.overview);
router.get('/automation/inventory', automationController.inventory);
router.post('/automation/margin/calculate', automationController.margin);
router.get('/automation/tracking', automationController.tracking);
router.post('/automation/mapping', automationController.mapping);
/* legacy inline implementation removed; listingController owns Storage + persistence. */
/*
async function legacyCreate(req, res, next) {
  try {
    const userId = req.userId;
    const { asin, itemId, title, images, price, stock, status = 'DRAFT' } = req.body || {};
    if (!/^[A-Z0-9]{10}$/.test(String(asin || '').toUpperCase())) return res.status(400).json({ error: 'Geçerli bir ASIN gerekli.' });
    if (itemId !== undefined && itemId !== null && !/^\d{9,19}$/.test(String(itemId))) return res.status(400).json({ error: 'Geçerli bir eBay ItemID gerekli.' });
    if (!Number.isFinite(Number(price)) || Number(price) < 0) return res.status(400).json({ error: 'Price geçerli değil.' });
    if (!Number.isInteger(Number(stock)) || Number(stock) < 0) return res.status(400).json({ error: 'Stock geçerli değil.' });
    const normalizedImages = Array.isArray(images) ? images.filter((image) => typeof image === 'string' && image.trim()).slice(0, 24) : [];
    const product = { user_id: userId, asin: String(asin).toUpperCase(), title: String(title || '').trim() || null, images: normalizedImages, item_id: itemId ? String(itemId) : null, price: Number(price), stock: Number(stock), status: String(status).toUpperCase() };
    const { data, error } = await supabaseAdmin.from('products').upsert(product, { onConflict: 'asin' }).select().single();
    if (error) return next(error);
    res.status(201).json({ product: data });
  } catch (error) { next(error); }
}
*/

module.exports = router;
