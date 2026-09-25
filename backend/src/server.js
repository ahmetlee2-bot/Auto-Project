require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const api = require('./routes/api');

const app = express();
app.disable('x-powered-by');
// The application is reached through exactly one local Nginx reverse proxy.
// This makes rate limiting use the real client IP from X-Forwarded-For.
app.set('trust proxy', 1);
app.use(helmet());
const allowedOrigins = (process.env.CORS_ORIGIN || 'https://autolister-app.de,http://localhost:3000,http://127.0.0.1:3000')
  .split(',').map((item) => item.trim()).filter(Boolean);
const extensionOrigins = (process.env.EXTENSION_IDS || 'dpifgdobjahfpppjlhbjnlmldnbmiija')
  .split(',').map((id) => id.trim()).filter((id) => /^[a-p]{32}$/.test(id)).map((id) => `chrome-extension://${id}`);
app.use(cors({ origin: (origin, callback) => {
  if (!origin || allowedOrigins.includes(origin) || extensionOrigins.includes(origin)) return callback(null, true);
  return callback(Object.assign(new Error('CORS origin izinli değil.'), { status: 403 }));
} }));
// Processed gallery images arrive as base64 data URLs. The extension limits the
// decoded gallery to 18 MB; base64 and JSON overhead require a larger transport
// limit. This is still bounded to prevent unbounded request bodies.
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '28mb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-8', legacyHeaders: false }));
app.post('/api/contact', (req, res) => {
  const { name, email, subject, message } = req.body || {};
  if (![name, email, subject, message].every((value) => typeof value === 'string' && value.trim())) {
    return res.status(400).json({ error: 'Name, E-Mail, Betreff und Nachricht sind erforderlich.' });
  }
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) return res.status(400).json({ error: 'Ungültige E-Mail-Adresse.' });
  console.log(JSON.stringify({ event: 'contact_message', targetEmail: 'contact.autolister@gmail.com', name: name.trim(), email: email.trim(), subject: subject.trim(), message: message.trim(), receivedAt: new Date().toISOString() }));
  return res.status(202).json({ ok: true, message: 'Nachricht erfolgreich empfangen.' });
});
app.use('/api/v1', api);
app.use((error, _req, res, _next) => { console.error('API error:', error.message); res.status(error.status || 500).json({ error: error.status && error.status < 500 ? error.message : 'Sunucu hatası.' }); });

const port = Number(process.env.PORT || 3000);
if (require.main === module) app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
  require('./services/ebay-reconciliation.service').startReconciliation();
});
module.exports = app;
