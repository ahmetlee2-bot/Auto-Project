const AMAZON_IMAGE_HOST = /(^|\.)(media-amazon\.com|ssl-images-amazon\.com|images-amazon\.com)$/i;

export function normalizeProductImageUrl(value: unknown): string {
  const url = new URL(String(value || "").trim());
  if (url.protocol !== "https:") throw new Error("Produktbilder müssen HTTPS verwenden.");
  if (AMAZON_IMAGE_HOST.test(url.hostname) && /\/images\/I\//i.test(url.pathname)) {
    // Amazon's ._AC_US40_ / ._SL500_ fragments request a thumbnail. The URL
    // without these fragments addresses the original image on the same CDN.
    url.pathname = url.pathname.replace(/(?:\._[^/]*_)+(?=\.(?:jpe?g|png|webp)$)/i, "");
    url.search = "";
    url.hash = "";
  }
  return url.toString();
}

export function normalizeProductImages(value: unknown, limit = 12): string[] {
  if (!Array.isArray(value)) throw new Error("Bilder müssen als URL-Liste gesendet werden.");
  if (value.length > limit) throw new Error(`Es sind maximal ${limit} Produktbilder erlaubt.`);
  return [...new Set(value.map(normalizeProductImageUrl))];
}
