import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { repricerAdmin } from "../../../lib/repricer/admin";
import { parseAsin } from "../../../lib/repricer/amazon";

export const runtime = "nodejs";

async function currentUser() {
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { client, id: data.user.id };
}

export async function GET() {
  const auth = await currentUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const products = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await auth.client.from("tracked_products").select("*").order("created_at", { ascending: false }).order("id").range(offset, offset + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    products.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return NextResponse.json({ products }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const auth = await currentUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const itemId = String(body.ebayItemId || "").trim();
    if (!/^[0-9]{9,15}$/.test(itemId)) throw new Error("Gültige eBay Item ID erforderlich.");
    const asin = parseAsin(String(body.amazonUrl || ""));
    const margin = Number(body.targetMarginPercent ?? 20);
    if (!Number.isFinite(margin) || margin < 0 || margin > 300) throw new Error("Marge muss zwischen 0 und 300 % liegen.");

    // The existing API lists only items owned by this authenticated eBay seller.
    const { data: sessionData } = await auth.client.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return NextResponse.json({ error: "Sitzung abgelaufen." }, { status: 401 });
    const apiBase = (process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.autolister-app.de").replace(/\/$/, "");
    const listingResponse = await fetch(`${apiBase}/api/v1/ebay/active-listings`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    const listingBody = await listingResponse.json().catch(() => ({}));
    if (!listingResponse.ok) throw new Error(listingBody.error || "eBay-Inhaberschaft konnte nicht geprüft werden.");
    const listing = (listingBody.listings || []).find((entry: { listingId?: string }) => entry.listingId === itemId);
    if (!listing) return NextResponse.json({ error: "Das eBay-Angebot gehört nicht zu diesem verbundenen Verkäuferkonto." }, { status: 403 });

    const { data, error } = await repricerAdmin().from("tracked_products").insert({
      user_id: auth.id, ebay_item_id: itemId, ebay_url: `https://www.ebay.de/itm/${itemId}`,
      amazon_asin: asin, amazon_url: `https://www.amazon.de/dp/${asin}`,
      title: String(listing.title || asin), image_url: listing.imageUrls?.[0] || null,
      ebay_price: Number(listing.price) || null, ebay_quantity: Math.max(0, Number(listing.quantity) || 0),
      target_margin_percent: margin, active: true, last_error: "Noch nicht geprüft.",
    }).select("*").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ product: data }, { status: 201 });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Produkt konnte nicht hinzugefügt werden." }, { status: 400 });
  }
}
