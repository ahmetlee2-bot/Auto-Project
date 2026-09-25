(() => {
  function normalizeImageUrl(value) {
    try {
      const url = new URL(String(value || ""));
      if (url.protocol !== "https:") return "";
      if (!/(^|\.)(media-amazon\.com|ssl-images-amazon\.com)$/.test(url.hostname)) return url.href;
      if (!/\/images\/I\//.test(url.pathname)) return "";
      const match = url.pathname.match(/^(.*\/images\/I\/[^/]+?)(?:\._[^/]+_)?\.(?:jpe?g|png|webp)$/i);
      if (!match) return "";
      url.pathname = `${match[1]}._AC_SL1500_.jpg`;
      url.search = "";
      url.hash = "";
      return url.href;
    } catch { return ""; }
  }
  function imageCandidates(value) {
    const normalized = normalizeImageUrl(value);
    if (!normalized) return [];
    const url = new URL(normalized);
    if (!/(^|\.)(media-amazon\.com|ssl-images-amazon\.com)$/.test(url.hostname)) return [normalized];
    return [...new Set([
      normalized.replace('._AC_SL1500_.jpg', '.jpg'),
      normalized,
      normalized.replace('._AC_SL1500_.jpg', '._SL1500_.jpg'),
    ])];
  }
  globalThis.AlltaghausAmazonParser = { normalizeImageUrl, imageCandidates };
})();
