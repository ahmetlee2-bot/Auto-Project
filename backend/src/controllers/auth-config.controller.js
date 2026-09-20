exports.config = (_req, res) => {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || '';
  let publicKey = publishableKey.startsWith('sb_publishable_');
  if (!publicKey) {
    try { publicKey = JSON.parse(Buffer.from(publishableKey.split('.')[1], 'base64url')).role === 'anon'; } catch {}
  }
  if (!url || !publicKey) return res.status(503).json({ error: 'Extension login configuration unavailable.' });
  res.json({ url, publishableKey });
};
