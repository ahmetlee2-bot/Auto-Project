import { NextResponse } from "next/server";
import { premiumDescription } from "../../../lib/ebay/premium-description";
import { ebayHtmlTemplate } from "../../../lib/ebay/ebayHtmlTemplate";
import { generateProductCopy, type ProductFacts } from "../../../lib/ai/gemini-product";
import { cleanEbayTitle } from "../../../lib/ebay/seo-title";
import { repricerAdmin } from "../../../lib/repricer/admin";
import { calculateDraftTargetPrice, estimateDraftNetProfit, resolveEffectiveDraftPrice } from "../../../lib/drafts/pricing";
import { draftRequestUser, parseDraftAmazonUrl, parseDraftImages } from "../../../lib/drafts/server";
import { dedupeSimilarProductImages } from "../../../lib/images/dedupeSimilarProductImages";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function GET(request: Request) {
  const user = await draftRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = repricerAdmin();
  const { data, error } = await admin.from("draft_products")
    .select("*").eq("user_id", user.id).in("status", ["draft", "publishing", "error"])
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const drafts = (data || []).map((row) => {
    const effectiveTarget = resolveEffectiveDraftPrice(row);
    const manualProfit = row.manual_sale_price != null
      ? estimateDraftNetProfit(row, row.manual_sale_price)
      : null;
    const clearLossManual = manualProfit !== null && manualProfit < 0 && Number(row.profit_margin_percent ?? 20) > 0;
    return {
      ...row,
      manual_sale_price: clearLossManual ? null : row.manual_sale_price,
      target_price: effectiveTarget ?? row.target_price,
    };
  });
  return NextResponse.json({ drafts }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await draftRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const { asin, sourceUrl } = parseDraftAmazonUrl(body.source_url ?? body.sourceUrl, body.asin);
    const title = String(body.title || "").trim();
    if (!title || title.length > 80) throw new Error("Der eBay-Titel muss zwischen 1 und 80 Zeichen lang sein.");
    const rawSourcePrice = body.source_price ?? body.sourcePrice;
    const sourcePrice = rawSourcePrice == null || rawSourcePrice === "" ? null : Number(rawSourcePrice);
    if (sourcePrice !== null && (!Number.isFinite(sourcePrice) || sourcePrice < 0 || sourcePrice > 1_000_000)) throw new Error("Amazon-Einkaufspreis ist ungültig.");
    const margin = Number(body.profit_margin_percent ?? body.profitMarginPercent ?? 20);
    const shipping = Number(body.shipping_cost ?? body.shippingCost ?? 0);
    if (!Number.isFinite(margin) || margin < 0 || margin > 300) throw new Error("Die Zielmarge muss zwischen 0 und 300 % liegen.");
    if (!Number.isFinite(shipping) || shipping < 0 || shipping > 100_000) throw new Error("Die Versandkosten sind ungültig.");
    const rawImages = body.images ?? (body.image_url || body.imageUrl ? [body.image_url || body.imageUrl] : []);
    const images = await dedupeSimilarProductImages(parseDraftImages(rawImages));
    if (body.apply_custom_frame !== undefined && typeof body.apply_custom_frame !== "boolean") throw new Error("Die Rahmen-Option muss wahr oder falsch sein.");
    const features = Array.isArray(body.features) ? body.features.map((value) => String(value).trim()).filter(Boolean).slice(0, 20) : [];
    const rawSpecifications = body.specifications && typeof body.specifications === "object" && !Array.isArray(body.specifications)
      ? body.specifications as Record<string, unknown> : {};
    const specifications = Object.fromEntries(Object.entries(rawSpecifications).flatMap(([key, rawValue]) => {
      const values = (Array.isArray(rawValue) ? rawValue : [rawValue]).map((value) => String(value).trim()).filter(Boolean).slice(0, 10);
      return values.length ? [[key.slice(0, 100), values]] : [];
    }));
    const rawTitle = String(body.raw_title || title).trim().slice(0, 500);
    const rawDescription = String(body.raw_description ?? body.description ?? "").trim().slice(0, 5000);
    const facts: ProductFacts = { raw_title: rawTitle, features, specifications, description: rawDescription };
    const copy = process.env.GEMINI_API_KEY?.trim() ? await generateProductCopy(facts).catch(() => null) : null;
    const generatedSpecifics = Object.fromEntries((copy?.item_specifics || []).map((item) => [item.key, [item.value]]));
    const itemSpecifics = { ...generatedSpecifics, ...specifications };
    const listingTitle = copy?.seo_title ? cleanEbayTitle(copy.seo_title, 80) : title;
    const draft = {
      user_id: user.id,
      asin,
      source_url: sourceUrl,
      source_price: sourcePrice,
      manual_sale_price: null,
      profit_margin_percent: margin,
      shipping_cost: shipping,
      target_price: calculateDraftTargetPrice({ source_price: sourcePrice, shipping_cost: shipping, profit_margin_percent: margin }),
      title: listingTitle,
      description_html: copy ? ebayHtmlTemplate(copy) : premiumDescription({ title: rawTitle || title, asin, description: rawDescription, features, itemSpecifics }),
      item_specifics: itemSpecifics,
      images,
      apply_custom_frame: body.apply_custom_frame ?? true,
      selected_category_id: String(body.selected_category_id ?? body.categoryId ?? "").trim() || null,
      status: "draft",
      updated_at: new Date().toISOString(),
    };
    const admin = repricerAdmin();
    const { data: existing, error: lookupError } = await admin.from("draft_products").select("id,status")
      .eq("user_id", user.id).eq("asin", asin).in("status", ["draft", "publishing", "error"]).maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    if (existing) return NextResponse.json({ error: "Diese ASIN befindet sich bereits in deinen Entwürfen.", draftId: existing.id }, { status: 409 });
    const { data, error } = await admin.from("draft_products").insert(draft).select("*").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ draft: data }, { status: 201 });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Entwurf konnte nicht erstellt werden." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const user = await draftRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const ids = [...new Set(Array.isArray(body.ids) ? body.ids.map(String) : [])];
    const margin = Number(body.profit_margin_percent ?? body.profitMarginPercent);
    if (!ids.length || ids.length > 200 || ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) throw new Error("Bitte wähle gültige Entwürfe aus.");
    if (!Number.isFinite(margin) || margin < 0 || margin > 300) throw new Error("Die Zielmarge muss zwischen 0 und 300 % liegen.");
    const admin = repricerAdmin();
    const { data: rows, error: readError } = await admin.from("draft_products").select("id,source_price,shipping_cost,manual_sale_price")
      .eq("user_id", user.id).in("id", ids).in("status", ["draft", "error"]).is("ebay_item_id", null);
    if (readError) throw new Error(readError.message);
    const updated: string[] = [];
    for (const row of rows || []) {
      const targetPrice = calculateDraftTargetPrice({ source_price: row.source_price, shipping_cost: row.shipping_cost, profit_margin_percent: margin });
      const { error } = await admin.from("draft_products").update({ profit_margin_percent: margin, manual_sale_price: null, target_price: targetPrice, status: "draft", last_error: null, updated_at: new Date().toISOString() })
        .eq("id", row.id).eq("user_id", user.id).in("status", ["draft", "error"]).is("ebay_item_id", null);
      if (error) throw new Error(error.message);
      updated.push(row.id);
    }
    return NextResponse.json({ updatedIds: updated, skippedIds: ids.filter((id) => !updated.includes(id)) });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Zielmarge konnte nicht aktualisiert werden." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const user = await draftRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { ids?: unknown };
    const ids = [...new Set(Array.isArray(body.ids) ? body.ids.map(String) : [])];
    if (!ids.length || ids.length > 200 || ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) throw new Error("Bitte wähle gültige Entwürfe aus.");
    const { data, error } = await repricerAdmin().from("draft_products").delete().eq("user_id", user.id)
      .in("id", ids).in("status", ["draft", "error"]).is("ebay_item_id", null).select("id");
    if (error) throw new Error(error.message);
    const deletedIds = (data || []).map((row: { id: string }) => row.id);
    return NextResponse.json({ deletedIds, skippedIds: ids.filter((id) => !deletedIds.includes(id)) });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Entwürfe konnten nicht gelöscht werden." }, { status: 400 });
  }
}
