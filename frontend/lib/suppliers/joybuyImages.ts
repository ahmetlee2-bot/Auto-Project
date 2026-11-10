const PRODUCT_IMAGE = /(^|\.)joy-sourcing\.com$/i;
const SIZE_PREFIX = /\/product\/s\d+x\d+_(?=jfsintlpro-)/i;

export function normalizeJoybuyImages(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const images: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || !PRODUCT_IMAGE.test(url.hostname) || !SIZE_PREFIX.test(url.pathname)) continue;
      url.pathname = url.pathname.replace(SIZE_PREFIX, "/product/s1248x1248_");
      if (!images.includes(url.toString())) images.push(url.toString());
    } catch { /* Ignore non-image values such as a product page URL. */ }
  }
  return images.slice(0, 12);
}

export async function verifiedJoybuyImages(values: unknown): Promise<string[]> {
  const candidates = normalizeJoybuyImages(values);
  const results = await Promise.all(candidates.map(async (url) => {
    try {
      const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(8000), cache: "no-store" });
      return response.ok && (response.headers.get("content-type") || "").startsWith("image/") ? url : "";
    } catch { return ""; }
  }));
  return results.filter(Boolean);
}
