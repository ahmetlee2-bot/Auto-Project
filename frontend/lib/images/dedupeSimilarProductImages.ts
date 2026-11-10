import "server-only";
import sharp from "sharp";
import { normalizeProductImageUrl } from "./normalizeProductImages";

const AMAZON_IMAGE_HOST = /(^|\.)(media-amazon\.com|ssl-images-amazon\.com|images-amazon\.com)$/i;
const MAX_BYTES = 1_000_000;
const hashCache = new Map<string, Promise<bigint | null>>();

async function readBounded(response: Response): Promise<Buffer | null> {
  const contentType = response.headers.get("content-type") || "";
  if (!/^image\/(jpeg|png|webp|avif)\b/i.test(contentType)) return null;
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_BYTES || !response.body) return null;
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BYTES) { await reader.cancel(); return null; }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, length);
}

async function imageHash(source: string): Promise<bigint | null> {
  const canonical = normalizeProductImageUrl(source);
  const cached = hashCache.get(canonical);
  if (cached) return cached;
  const pending = (async () => {
    try {
      const url = new URL(canonical);
      if (!AMAZON_IMAGE_HOST.test(url.hostname) || !/\/images\/I\//i.test(url.pathname)) return null;
      url.pathname = url.pathname.replace(/(\.(?:jpe?g|png|webp))$/i, "._SL160_$1");
      const response = await fetch(url, { cache: "force-cache", signal: AbortSignal.timeout(5_000), headers: { Accept: "image/jpeg,image/png,image/webp,image/avif" } });
      if (!response.ok) return null;
      const bytes = await readBounded(response);
      if (!bytes) return null;
      const { data } = await sharp(bytes, { limitInputPixels: 2_000_000, failOn: "none" })
        .resize(9, 8, { fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true });
      let bits = 0n;
      let index = 0n;
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          if (data[y * 9 + x] > data[y * 9 + x + 1]) bits |= 1n << index;
          index += 1n;
        }
      }
      return bits;
    } catch {
      return null;
    }
  })();
  hashCache.set(canonical, pending);
  if (hashCache.size > 500) hashCache.delete(hashCache.keys().next().value as string);
  return pending;
}

function hammingDistance(left: bigint, right: bigint): number {
  let bits = left ^ right;
  let distance = 0;
  while (bits) { distance += 1; bits &= bits - 1n; }
  return distance;
}

export async function dedupeSimilarProductImages(images: string[]): Promise<string[]> {
  const unique = [...new Set(images.map(normalizeProductImageUrl))].slice(0, 12);
  const hashes = new Array<bigint | null>(unique.length).fill(null);
  let next = 0;
  const workers = Array.from({ length: Math.min(3, unique.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= unique.length) return;
      hashes[index] = await imageHash(unique[index]);
    }
  });
  await Promise.all(workers);
  const kept: string[] = [];
  const keptHashes: Array<bigint | null> = [];
  for (let index = 0; index < unique.length; index += 1) {
    const hash = hashes[index];
    const isDuplicate = hash !== null && keptHashes.some((previous) => previous !== null && hammingDistance(hash, previous) <= 5);
    if (!isDuplicate) { kept.push(unique[index]); keptHashes.push(hash); }
  }
  return kept;
}
