function assertOwner(userId) {
  const ownerId = String(process.env.EBAY_LEGACY_OWNER_USER_ID || '').trim();
  if (!ownerId) throw Object.assign(new Error('eBay sunucu hesabı henüz bir AutoLister kullanıcısına bağlanmadı.'), { status: 503 });
  if (String(userId) !== ownerId) throw Object.assign(new Error('Bu eBay hesabına erişim izniniz yok.'), { status: 403 });
}

function configured() {
  return Boolean(process.env.EBAY_BRIDGE_URL);
}

async function request(userId, path, { method = 'GET', body, timeoutMs = 30000 } = {}) {
  assertOwner(userId);
  const baseUrl = String(process.env.EBAY_BRIDGE_URL || '').replace(/\/$/, '');
  const secret = String(process.env.EBAY_BRIDGE_SHARED_SECRET || '');
  if (!baseUrl || !secret) throw Object.assign(new Error('eBay sunucu köprüsü yapılandırılmadı.'), { status: 503 });
  const endpoint = new URL(`${baseUrl}${path}`);
  if (!['http:', 'https:'].includes(endpoint.protocol)) throw Object.assign(new Error('Geçersiz eBay köprü adresi.'), { status: 503 });
  let response;
  try {
    response = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-autolister-bridge-key': secret },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    throw Object.assign(new Error('eBay sunucu servisine ulaşılamadı.'), { status: 503, cause });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || data.error || `eBay köprüsü HTTP ${response.status}`);
    error.status = response.status;
    error.code = data.code || '';
    error.stage = data.stage || '';
    error.requestId = data.requestId || '';
    error.details = data.details || [];
    throw error;
  }
  return { status: response.status, data };
}

function jobPath(jobId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(jobId || ''))) {
    throw Object.assign(new Error('Geçersiz iş kimliği.'), { status: 400 });
  }
  return `/ebay/draft-jobs/${encodeURIComponent(jobId)}`;
}

module.exports = { configured, request, jobPath };
