import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { repricerAdmin } from "../repricer/admin";
import { normalizeProductImageUrl } from "./normalizeProductImages";

const SIZE = 1500;
const MAX_SOURCE_BYTES = 18_000_000;
const BUCKET = "product-images";

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function fallbackOverlay(): Buffer {
  const top = escapeXml((process.env.OVERLAY_TOP_LEFT_TEXT || "AutoLister").slice(0, 20));
  const bottom = escapeXml((process.env.OVERLAY_BOTTOM_RIGHT_TEXT || "autolister-app.de").slice(0, 24));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="1500" viewBox="0 0 1500 1500">
    <rect x="34" y="34" width="470" height="92" rx="25" fill="#0B0F17" fill-opacity=".91"/>
    <text x="66" y="97" fill="#FFFFFF" font-family="Arial,sans-serif" font-size="43" font-weight="700">${top}</text>
    <rect x="912" y="1374" width="554" height="92" rx="25" fill="#0B0F17" fill-opacity=".91"/>
    <text x="1432" y="1437" text-anchor="end" fill="#FFFFFF" font-family="Arial,sans-serif" font-size="39" font-weight="700">${bottom}</text>
  </svg>`;
  return Buffer.from(svg);
}

async function overlayInput(): Promise<Buffer> {
  const overlayPath = path.join(process.cwd(), "public", "assets", "frame-overlay.png");
  try {
    const png = await readFile(overlayPath);
    const metadata = await sharp(png).metadata();
    if (metadata.format !== "png" || metadata.width !== SIZE || metadata.height !== SIZE || !metadata.hasAlpha) {
      throw new Error("frame-overlay.png must be a transparent 1500x1500 PNG");
    }
    return png;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("Invalid frame overlay; using SVG fallback:", cause);
    }
    return fallbackOverlay();
  }
}

function allowedSource(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  if (/(^|\.)(media-amazon\.com|ssl-images-amazon\.com|images-amazon\.com|ebayimg\.com)$/i.test(url.hostname)) return true;
  if (/(^|\.)joy-sourcing\.com$/i.test(url.hostname)) return true;
  const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : "";
  return Boolean(supabaseHost && url.hostname === supabaseHost && url.pathname.startsWith("/storage/v1/object/public/"));
}

async function downloadImage(source: string): Promise<Buffer> {
  let url = new URL(source);
  for (let redirect = 0; redirect < 4; redirect += 1) {
    if (!allowedSource(url)) throw new Error("Image source host is not allowed for server-side processing");
    const response = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      headers: { Accept: "image/jpeg,image/png,image/webp,image/avif" },
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Image redirect has no location");
      url = new URL(location, url);
      continue;
    }
    if (!response.ok || !response.body) throw new Error(`Image download returned HTTP ${response.status}`);
    const type = response.headers.get("content-type") || "";
    if (!/^image\/(jpeg|png|webp|avif)\b/i.test(type)) throw new Error("Image response has an unsupported content type");
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > MAX_SOURCE_BYTES) throw new Error("Source image is too large");
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_SOURCE_BYTES) throw new Error("Source image is too large");
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks, size);
  }
  throw new Error("Image URL redirected too many times");
}

export async function processMainImage(mainImageUrl: string, identifier: string): Promise<string> {
  let original = mainImageUrl;
  try {
    original = normalizeProductImageUrl(mainImageUrl);
    const safeIdentifier = identifier.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
    if (!safeIdentifier) throw new Error("A product identifier is required");
    const source = await downloadImage(original);
    const metadata = await sharp(source, { limitInputPixels: 80_000_000 }).metadata();
    if (!metadata.width || !metadata.height) throw new Error("Image dimensions are missing");
    const jpeg = await sharp(source, { limitInputPixels: 80_000_000, failOn: "error" })
      .rotate()
      .resize(SIZE, SIZE, { fit: "contain", position: "centre", background: "#FFFFFF" })
      .composite([{ input: await overlayInput(), top: 0, left: 0 }])
      .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
      .toBuffer();
    const key = `covers/cover_${safeIdentifier}_${Date.now()}.jpg`;
    const storage = repricerAdmin().storage.from(BUCKET);
    const { error } = await storage.upload(key, jpeg, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
    if (error) throw new Error(`Cover upload failed: ${error.message}`);
    const { data } = storage.getPublicUrl(key);
    if (!data.publicUrl.startsWith("https://")) throw new Error("Cover public URL is invalid");
    return data.publicUrl;
  } catch (cause) {
    console.warn("Cover composition failed; keeping the original product image:", cause);
    return original;
  }
}
