const crypto = require('node:crypto');
const { supabaseAdmin } = require('../config/supabase');

const BUCKET = 'product-images';
let bucketReady;

async function ensureBucket() {
  if (bucketReady) return bucketReady;
  bucketReady = (async () => {
    const { data, error } = await supabaseAdmin.storage.getBucket(BUCKET);
    if (error || !data) {
      const created = await supabaseAdmin.storage.createBucket(BUCKET, { public: true, fileSizeLimit: '10MB', allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] });
      if (created.error && !/already exists/i.test(created.error.message || '')) throw created.error;
    } else if (!data.public) {
      const updated = await supabaseAdmin.storage.updateBucket(BUCKET, { public: true });
      if (updated.error) throw updated.error;
    }
    return BUCKET;
  })();
  return bucketReady;
}

async function toBuffer(source) {
  if (typeof source !== 'string') throw new Error('Görsel kaynağı geçersiz.');
  const dataUrl = source.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (dataUrl) return { buffer: Buffer.from(dataUrl[2].replace(/\s/g, ''), 'base64'), contentType: dataUrl[1].toLowerCase() };
  const parsed = new URL(source);
  const trustedHost = /(^|\.)(media-amazon\.com|ssl-images-amazon\.com|ebayimg\.com)$/i.test(parsed.hostname);
  if (parsed.protocol !== 'https:' || !trustedHost || parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) throw new Error('Görsel kaynağı izinli değil.');
  const response = await fetch(parsed, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Görsel indirilemedi: HTTP ${response.status}`);
  const contentType = (response.headers.get('content-type') || 'image/jpeg').split(';')[0].toLowerCase();
  if (!contentType.startsWith('image/')) throw new Error('Kaynak dosya görsel değil.');
  return { buffer: Buffer.from(await response.arrayBuffer()), contentType };
}

async function uploadProductImages(sources, userId, asin) {
  if (!userId) throw new Error('Authenticated image owner required.');
  await ensureBucket();
  const urls = [];
  for (let index = 0; index < Math.min(24, Array.isArray(sources) ? sources.length : 0); index += 1) {
    try {
      const { buffer, contentType } = await toBuffer(sources[index]);
      if (!buffer.length || buffer.length > 10 * 1024 * 1024) continue;
      const ext = contentType.split('/')[1].replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${userId || 'anonymous'}/${String(asin).toUpperCase()}/${crypto.randomUUID()}-${index}.${ext}`;
      const uploaded = await supabaseAdmin.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: false, cacheControl: '31536000' });
      if (uploaded.error) throw uploaded.error;
      const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
      if (data?.publicUrl) urls.push(data.publicUrl);
    } catch (error) { throw Object.assign(new Error(`Görsel ${index + 1} kaydedilemedi: ${error.message}`), { status: 422 }); }
  }
  return urls;
}

module.exports = { BUCKET, ensureBucket, uploadProductImages };
