const { supabaseAdmin } = require('../config/supabase');
async function requireAuth(req, res, next) {
  res.set('Cache-Control', 'private, no-store');
  const token = String(req.headers.authorization || '').match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: 'Bearer token gerekli.', code: 'AUTH_REQUIRED' });
  try { const { data, error } = await supabaseAdmin.auth.getUser(token); if (error || !data.user) return res.status(401).json({ error: 'Oturum geçersiz.', code: 'TOKEN_EXPIRED_OR_INVALID' }); req.user = data.user; req.userId = data.user.id; next(); }
  catch (_error) { return res.status(401).json({ error: 'Oturum doğrulanamadı.', code: 'TOKEN_EXPIRED_OR_INVALID' }); }
}
module.exports = { requireAuth };
