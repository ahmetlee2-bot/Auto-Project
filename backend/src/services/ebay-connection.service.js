const { supabaseAdmin } = require('../config/supabase');

function requireUser(userId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(userId || ''))) {
    throw new Error('Authenticated user required.');
  }
  return userId;
}

// Never fall back to the server seller account for an arbitrary signed-in user.
// Connections are provisioned by the server, not by client-controlled metadata.
async function connectionFor(userId) {
  requireUser(userId);
  const { data, error } = await supabaseAdmin.from('ebay_connections')
    .select('access_token,refresh_token').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (data) return data;
  if (userId !== process.env.EBAY_LEGACY_OWNER_USER_ID) return null;
  return {
    access_token: String(process.env.EBAY_USER_TOKEN || process.env.EBAY_ACCESS_TOKEN || '').trim(),
    refresh_token: String(process.env.EBAY_REFRESH_TOKEN || '').trim(),
  };
}

module.exports = { requireUser, connectionFor };
