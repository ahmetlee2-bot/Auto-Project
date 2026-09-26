const ebay = require('../services/ebay.service');
const bridge = require('../services/ebay-bridge.service');
const wrap = (handler) => async (req, res) => { try { res.json(await handler(req)); } catch (error) { res.status(400).json({ error: error.message }); } };
exports.authUrl = wrap(() => ebay.authUrl());
const sendBridge = (path, options) => async (req, res) => {
  try {
    const result = await bridge.request(req.userId, typeof path === 'function' ? path(req) : path, {
      method: options?.method || 'GET',
      body: options?.method === 'POST' ? req.body : undefined,
      timeoutMs: options?.timeoutMs || 30000,
    });
    res.status(result.status).json(result.data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, code: error.code || '', stage: error.stage || '', requestId: error.requestId || '', details: error.details || [] });
  }
};
exports.draft = sendBridge('/ebay/drafts?async=1', { method: 'POST' });
exports.importAmazon = sendBridge('/ebay/import-amazon', { method: 'POST', timeoutMs: 30000 });
exports.publish = sendBridge('/ebay/drafts/publish', { method: 'POST', timeoutMs: 120000 });
exports.draftJob = sendBridge((req) => bridge.jobPath(req.params.jobId));
exports.draftJobs = sendBridge('/ebay/draft-jobs');
exports.readiness = sendBridge('/ebay/readiness', { timeoutMs: 60000 });
exports.monitorStatus = sendBridge('/ebay/monitor/status');
exports.drafts = sendBridge('/ebay/drafts');
exports.orders = sendBridge('/ebay/orders', { timeoutMs: 60000 });
exports.activeListings = sendBridge('/ebay/active-listings', { timeoutMs: 60000 });
