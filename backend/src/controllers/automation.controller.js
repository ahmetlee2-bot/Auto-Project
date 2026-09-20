const automation = require('../services/automation.service');

const wrap = (handler) => async (req, res) => {
  try { res.json(await handler(req)); }
  catch (error) { res.status(400).json({ error: error.message }); }
};

exports.overview = wrap((req) => automation.overview(req.userId));
exports.inventory = wrap((req) => automation.inventorySummary(req.userId));
exports.margin = wrap((req) => automation.calculateMargin(req.body));
exports.tracking = wrap((req) => automation.trackingSummary(req.userId));
exports.mapping = wrap((req) => automation.saveAmazonMapping(req.userId, req.body));
