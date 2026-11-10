import { NextResponse } from "next/server";
import { premiumDescription } from "../../../../lib/ebay/premium-description";
import { repricerAdmin } from "../../../../lib/repricer/admin";
import { calculateDraftTargetPrice } from "../../../../lib/drafts/pricing";
import { draftRequestUser, parseDraftImages } from "../../../../lib/drafts/server";
import { fetchAmazonProductDetails } from "../../../../lib/repricer/amazon";
import { dedupeSimilarProductImages } from "../../../../lib/images/dedupeSimilarProductImages";
import { generateProductCopy, type ProductFacts } from "../../../../lib/ai/gemini-product";
import { ebayHtmlTemplate } from "../../../../lib/ebay/ebayHtmlTemplate";
import { cleanEbayTitle } from "../../../../lib/ebay/seo-title";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(request: Request) {
  const user = await draftRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { favoriteId?: unknown };
    const favoriteId = String(body.favoriteId || "");
    if (!/^[0-9a-f-]{36}$/i.test(favoriteId)) throw new Error("Ungültiger Favorit.");
    const admin = repricerAdmin();
    const { data: favorite, error: favoriteError } = await admin.from("favorite_products").select("*")
      .eq("id", favoriteId).eq("user_id", user.id).maybeSingle();
    if (favoriteError) throw new Error(favoriteError.message);
    if (!favorite) return NextResponse.json({ error: "Produkt im Favoritenpool nicht gefunden." }, { status: 404 });
    const { data: existing, error: lookupError } = await admin.from("draft_products").select("id")
      .eq("user_id", user.id).eq("asin", favorite.asin).in("status", ["draft", "publishing", "error"]).maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    if (existing) {
      await admin.from("favorite_products").delete().eq("id", favoriteId).eq("user_id", user.id);
      return NextResponse.json({ draftId: existing.id, alreadyExists: true });
    }

    let sourcePrice = favorite.amazon_price == null ? null : Number(favorite.amazon_price);
    let amazonProduct: Awaited<ReturnType<typeof fetchAmazonProductDetails>> | null = null;
    try { amazonProduct = await fetchAmazonProductDetails(String(favorite.asin), "AMZ_DE"); }
    catch (cause) {
      if (sourcePrice == null || !Number.isFinite(sourcePrice) || sourcePrice <= 0) throw cause;
    }
    if (amazonProduct) {
      sourcePrice = amazonProduct.price;
      await admin.from("favorite_products").update({ amazon_price: sourcePrice }).eq("id", favoriteId).eq("user_id", user.id);
    }
    if (sourcePrice == null || !Number.isFinite(sourcePrice) || sourcePrice <= 0) throw new Error("Ein gültiger Amazon-Einkaufspreis fehlt.");
    const margin = Number(favorite.profit_margin_percent ?? 20);
    const rawTitle = String(amazonProduct?.title || favorite.title || favorite.asin);
    const sourceSpecifics = amazonProduct?.itemSpecifics || {};
    const rawDescription = String(amazonProduct?.description || favorite.description_html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5000);
    const facts: ProductFacts = {
      raw_title: rawTitle,
      features: amazonProduct?.description.split(/\n|[•●▪]/).map((part) => part.trim()).filter(Boolean).slice(0, 20) || [],
      specifications: sourceSpecifics,
      description: rawDescription,
    };
    const copy = process.env.GEMINI_API_KEY?.trim() ? await generateProductCopy(facts).catch(() => null) : null;
    const generatedSpecifics = Object.fromEntries((copy?.item_specifics || []).map((item) => [item.key, [item.value]]));
    const mergedSpecifics = { ...generatedSpecifics, ...sourceSpecifics };
    const { data: draft, error: insertError } = await admin.from("draft_products").insert({
      user_id: user.id,
      asin: favorite.asin,
      source_url: favorite.amazon_url,
      source_price: sourcePrice,
      target_price: calculateDraftTargetPrice({ source_price: sourcePrice, shipping_cost: 0, profit_margin_percent: margin }),
      profit_margin_percent: margin,
      shipping_cost: 0,
      title: copy?.seo_title ? cleanEbayTitle(copy.seo_title, 80) : rawTitle.slice(0, 80),
      description_html: copy ? ebayHtmlTemplate(copy) : favorite.description_html || premiumDescription({ title: rawTitle, asin: favorite.asin, description: rawDescription, itemSpecifics: sourceSpecifics }),
      item_specifics: mergedSpecifics,
      quantity: favorite.quantity || 1,
      images: await dedupeSimilarProductImages(parseDraftImages(Array.isArray(favorite.images) && favorite.images.length ? favorite.images : favorite.image_url ? [favorite.image_url] : [])),
      manual_sale_price: null,
      apply_custom_frame: true,
      status: "draft",
    }).select("id").single();
    if (insertError) throw new Error(insertError.message);
    const { error: deleteError } = await admin.from("favorite_products").delete().eq("id", favoriteId).eq("user_id", user.id);
    if (deleteError) throw new Error(`Entwurf wurde angelegt, Favorit konnte aber nicht aus dem Sourcing-Pool entfernt werden: ${deleteError.message}`);
    return NextResponse.json({ draftId: draft.id }, { status: 201 });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Favorit konnte nicht in einen Entwurf umgewandelt werden." }, { status: 400 });
  }
}
