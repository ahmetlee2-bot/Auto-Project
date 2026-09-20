const { createClient } = require('@supabase/supabase-js');

const url = String(process.env.SUPABASE_URL || '').trim();
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!url || !serviceRoleKey) {
  throw new Error('SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY backend ortamında tanımlanmalıdır.');
}

// Bu modül yalnızca backend içinde kullanılır. Service role anahtarı extension içine taşınmaz.
const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

module.exports = { supabaseAdmin };
