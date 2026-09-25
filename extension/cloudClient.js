// Only the service worker owns credentials. No tokens in page scripts or localStorage.
(() => {
  const API = 'https://api.autolister-app.de/api/v1';
  const SESSION_KEY = 'autolisterCloudSession';
  let refreshPromise;
  let configPromise;
  const config = () => configPromise ||= fetch(`${API}/auth/config`, { cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) throw new Error('Cloud-Anmeldung derzeit nicht verfügbar.');
      const body = await response.json();
      if (body.url !== 'https://rdwqrygkkzzouiamrxwq.supabase.co') throw new Error('Unbekannter Auth-Server.');
      return body;
    }).catch((error) => { configPromise = null; throw error; });
  async function session() { return (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY]; }
  async function authenticate(grant, payload) {
    const { url, publishableKey } = await config();
    const response = await fetch(`${url}/auth/v1/token?grant_type=${grant}`, {
      method: 'POST', headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(20000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
      if (grant === 'refresh_token' && [400, 401].includes(response.status)) await logout();
      throw new Error('Anmeldung fehlgeschlagen. Bitte erneut anmelden.');
    }
    await chrome.storage.session.set({ [SESSION_KEY]: {
      access_token: data.access_token, refresh_token: data.refresh_token,
      expires_at: Date.now() + Number(data.expires_in) * 1000, email: data.user?.email,
    } });
    return data.access_token;
  }
  async function accessToken(force = false) {
    const current = await session();
    if (!current) throw new Error('Bitte zuerst mit deinem AutoLister-Konto anmelden.');
    if (!force && current.expires_at > Date.now() + 60000) return current.access_token;
    if (!refreshPromise) refreshPromise = authenticate('refresh_token', { refresh_token: current.refresh_token }).finally(() => { refreshPromise = null; });
    return refreshPromise;
  }
  async function request(path, payload) {
    let token = await accessToken();
    const send = () => fetch(`${API}${path}`, {
      method: payload === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload), signal: AbortSignal.timeout(120000),
    });
    let response = await send();
    if (response.status === 401) { token = await accessToken(true); response = await send(); }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Cloud HTTP ${response.status}`);
    return body;
  }
  async function logout() {
    await chrome.storage.session.remove(SESSION_KEY);
    await chrome.storage.local.remove(['backendAccessToken', 'supabaseSession']);
  }
  async function saveProduct(product) {
    const result = await request('/listings/create', {
      asin: product.asin, title: product.title,
      images: Array.isArray(product.images) ? product.images.slice(0, 12) : [],
      price: Number(product.salePrice ?? product.price),
      stock: product.inStock === false || product.lowStock ? 0 : Number(product.stock ?? product.quantity ?? 1),
      status: 'DRAFT',
    });
    if (!result.product?.id) throw new Error('Cloud hat die Speicherung nicht bestätigt.');
    return { ...result, status: result.product.status, draftId: result.product.id, savedToCloud: true };
  }
  async function createEbayDraft(product) {
    const saved = await saveProduct(product);
    const draft = await request('/ebay/draft', {
      sourceId: product.asin,
      amazonUrl: product.sourceUrl || `https://www.amazon.de/dp/${product.asin}`,
      title: product.ebayTitle || product.suggestedTitle || product.title,
      description: product.ebayDescription || product.descriptionHtml || product.description || '',
      price: product.salePrice,
      quantity: product.quantity,
      itemSpecifics: product.itemSpecifics || {},
      ean: product.ean || '',
      marketplaceId: product.marketplaceId || 'EBAY_DE',
      currency: product.currency || 'EUR',
      categoryId: product.categoryId || '',
      merchantLocationKey: product.merchantLocationKey || '',
      listingPolicies: product.listingPolicies || {},
      processedImageData: product.processedImageData || [],
      imageRightsConfirmed: product.imageRightsConfirmed === true,
      autoPublish: product.autoPublish === true,
      targetMarginPercent: product.targetMarginPercent,
      manualSalePrice: product.manualSalePrice,
      sourcePriceText: product.priceText || '',
      desiredQuantity: 1,
    });
    if (!draft.jobId) throw new Error('Sunucu eBay işini kabul etmedi.');
    return { ...saved, ...draft, status: 'PROCESSING', serverQueued: true };
  }
  globalThis.AutoListerCloud = {
    request, saveProduct, createEbayDraft, logout,
    async login(email, password) { await authenticate('password', { email, password }); return { email: (await session()).email }; },
    async status() { const current = await session(); return { authenticated: Boolean(current), email: current?.email || '' }; },
    async check() {
      await accessToken();
      const readiness = await request('/ebay/readiness');
      if (!readiness.ready || !readiness.livePublishEnabled) {
        throw new Error((readiness.reasons || []).join(' ') || 'Sunucuda eBay yayını henüz hazır değil.');
      }
      return readiness;
    },
  };
})();
