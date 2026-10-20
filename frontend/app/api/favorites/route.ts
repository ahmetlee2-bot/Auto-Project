import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { bearerUser } from "../../../lib/supabase/bearer-user";
import { repricerAdmin } from "../../../lib/repricer/admin";
import { normalizeProductImages } from "../../../lib/images/normalizeProductImages";

export const runtime = "nodejs";

function cors(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  const allowed = /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
  return allowed ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Vary": "Origin" } : {};
}

export async function OPTIONS(request: Request) { return new NextResponse(null, { status: 204, headers: cors(request) }); }

export async function GET(request: Request) {
  const client = await createClient();
  const user = await bearerUser(request);
  const { data: auth } = user ? { data: { user } } : await client.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: cors(request) });
  const { data, error } = await repricerAdmin().from("favorite_products").select("*").eq("user_id", auth.user.id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cors(request) });
  return NextResponse.json({ favorites: data || [] }, { headers: { "Cache-Control": "no-store", ...cors(request) } });
}

export async function POST(request: NextRequest) {
  const client = await createClient();
  const user = await bearerUser(request);
  const { data: auth } = user ? { data: { user } } : await client.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: cors(request) });
  try {
    const body = await request.json();
    const asin = String(body.asin || "").trim().toUpperCase();
    const title = String(body.title || "").trim().slice(0, 500);
    const imageUrl = String(body.imageUrl || "").trim();
    const rawImages = Array.isArray(body.images) ? body.images : Array.isArray(body.imageUrls) ? body.imageUrls : [];
    const images = normalizeProductImages([...rawImages, imageUrl].filter(Boolean).slice(0, 12));
    const rawAmazonUrl = String(body.amazonUrl || `https://www.amazon.de/dp/${asin}`);
    if (!/^[A-Z0-9]{10}$/.test(asin)) throw new Error("Geçerli Amazon ASIN gerekli.");
    if (!title) throw new Error("Ürün başlığı gerekli.");
    const amazonUrl = new URL(rawAmazonUrl);
    if (amazonUrl.protocol !== "https:" || !/(^|\.)amazon\.de$/i.test(amazonUrl.hostname)) throw new Error("Amazon.de ürün bağlantısı gerekli.");
    for (const candidate of images) {
      const image = new URL(candidate);
      if (image.protocol !== "https:" || !/(^|\.)(media-amazon\.com|ssl-images-amazon\.com|images-amazon\.com)$/i.test(image.hostname)) throw new Error("Amazon kaynaklı güvenli görsel URL'si gerekli.");
    }
    const primaryImage = images[0] || imageUrl;
    const parsed = body.amazonPrice === null || body.amazonPrice === undefined || body.amazonPrice === "" ? null : Number(body.amazonPrice);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000000)) throw new Error("Amazon fiyatı geçersiz.");
    const suggested = parsed === null ? null : Math.ceil((parsed * 1.2 / 0.85) * 100) / 100;
    const { data, error } = await repricerAdmin().from("favorite_products").upsert({
      user_id: auth.user.id, asin, title, image_url: primaryImage || null, images,
      amazon_url: `https://www.amazon.de/dp/${asin}`, amazon_price: parsed,
      is_prime: body.isPrime === true, suggested_ebay_price: suggested,
    }, { onConflict: "user_id,asin" }).select("*").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ favorite: data }, { status: 201, headers: cors(request) });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Favori kaydedilemedi." }, { status: 400, headers: cors(request) });
  }
}
