'use strict';
// Run inside the bridge container: credentials stay in its environment.
const ITEM = '407248235879';
const OFFER = '278558984011';
async function main() {
  const env = process.env;
  const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: env.EBAY_REFRESH_TOKEN, scope: 'https://api.ebay.com/oauth/api_scope/sell.inventory' }), signal: AbortSignal.timeout(20000),
  });
  const auth = await response.json();
  if (!response.ok || !auth.access_token) throw new Error('eBay token renewal failed');
  async function request(suffix = '', method = 'GET') {
    const res = await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${OFFER}${suffix}`, { method, headers: { Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json', 'Accept-Language': 'de-DE', 'Content-Language': 'de-DE' }, signal: AbortSignal.timeout(30000) });
    const body = await res.text();
    if (!res.ok) throw new Error(`eBay HTTP ${res.status}: ${body}`);
    return body ? JSON.parse(body) : {};
  }
  const before = await request();
  if (before.status === 'UNPUBLISHED') { console.log(JSON.stringify({ itemId: ITEM, status: 'ALREADY_UNPUBLISHED' })); return; }
  if (String(before.listing?.listingId) !== ITEM) throw new Error('Offer/ItemID mismatch: refusing withdrawal');
  if (!process.argv.includes('--execute')) { console.log(JSON.stringify({ itemId: ITEM, offerId: OFFER, status: before.status, mode: 'preview' })); return; }
  await request('/withdraw', 'POST');
  const after = await request();
  if (after.status !== 'UNPUBLISHED') throw new Error('Withdrawal not confirmed; inspect eBay before retrying');
  console.log(JSON.stringify({ itemId: ITEM, offerId: OFFER, status: after.status }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
