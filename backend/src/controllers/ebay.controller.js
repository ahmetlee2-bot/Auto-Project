const ebay = require('../services/ebay.service');
const wrap = (handler) => async (req, res) => { try { res.json(await handler(req)); } catch (error) { res.status(400).json({ error: error.message }); } };
exports.authUrl = wrap(() => ebay.authUrl());
exports.draft = wrap((req) => ebay.createDraft(req.body, req.userId));
exports.publish = wrap((req) => ebay.publishDraft(req.body, req.userId));
exports.drafts = wrap(async (req) => ({ drafts: await ebay.listDrafts(req.userId) }));
exports.orders = wrap((req) => ebay.listOrders(req.userId));
exports.activeListings = wrap((req) => ebay.listActiveListings(req.userId));
