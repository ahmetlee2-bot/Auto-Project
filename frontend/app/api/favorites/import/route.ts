import { NextResponse } from "next/server";
import { draftRequestUser } from "../../../../lib/drafts/server";
import { fetchAmazonProductDetails, parseAsin } from "../../../../lib/repricer/amazon";
import { repricerAdmin } from "../../../../lib/repricer/admin";
import { premiumDescription } from "../../../../lib/ebay/premium-description";
import { calculateDraftTargetPrice } from "../../../../lib/drafts/pricing";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const user = await draftRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const asin = parseAsin(String(body.amazonUrl || ""));
    const margin = Number(body.targetMarginPercent ?? 20), quantity = Number(body.quantity ?? 1);
    if (!Number.isFinite(margin) || margin < 0 || margin > 300 || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new Error("Marj %0–300, adet 1–999 arasında olmalı.");
    if (body.imageRightsConfirmed !== true) throw new Error("Görsel kullanım haklarını onaylayın.");
    const product = await fetchAmazonProductDetails(asin, "AMZ_DE");
    const { data, error } = await repricerAdmin().from("favorite_products").upsert({
      user_id: user.id, asin, title: product.title, image_url: product.images[0] || null, images: product.images,
      amazon_url: `https://www.amazon.de/dp/${asin}`, amazon_price: product.price,
      description_html: premiumDescription(product), profit_margin_percent: margin, quantity,
      suggested_ebay_price: calculateDraftTargetPrice({ source_price: product.price, shipping_cost: product.shipping, profit_margin_percent: margin }),
    }, { onConflict: "user_id,asin" }).select("id").single();
    if (error) throw error;
    return NextResponse.json({ favoriteId: data.id }, { status: 201 });
  } catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Amazon ürünü alınamadı." }, { status: 400 }); }
}
