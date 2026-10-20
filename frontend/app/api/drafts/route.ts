import { NextResponse } from "next/server";
import { repricerAdmin } from "../../../lib/repricer/admin";
import { calculateDraftTargetPrice } from "../../../lib/drafts/pricing";
import { draftRequestUser, parseDraftAmazonUrl, parseDraftImages } from "../../../lib/drafts/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await draftRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await repricerAdmin().from("draft_products")
    .select("*").eq("user_id", user.id).in("status", ["draft", "publishing", "error"])
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ drafts: data || [] }, { headers: { "Cache-Control": "no-store" } });
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
    const images = parseDraftImages(rawImages);
    if (body.apply_custom_frame !== undefined && typeof body.apply_custom_frame !== "boolean") throw new Error("Die Rahmen-Option muss wahr oder falsch sein.");
    const draft = {
      user_id: user.id,
      asin,
      source_url: sourceUrl,
      source_price: sourcePrice,
      profit_margin_percent: margin,
      shipping_cost: shipping,
      target_price: calculateDraftTargetPrice({ source_price: sourcePrice, shipping_cost: shipping, profit_margin_percent: margin }),
      title,
      description_html: String(body.description_html ?? body.descriptionHtml ?? "").slice(0, 50_000),
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
    const { data: rows, error: readError } = await admin.from("draft_products").select("id,source_price,shipping_cost")
      .eq("user_id", user.id).in("id", ids).in("status", ["draft", "error"]).is("ebay_item_id", null);
    if (readError) throw new Error(readError.message);
    const updated: string[] = [];
    for (const row of rows || []) {
      const targetPrice = calculateDraftTargetPrice({ source_price: row.source_price, shipping_cost: row.shipping_cost, profit_margin_percent: margin });
      const { error } = await admin.from("draft_products").update({ profit_margin_percent: margin, target_price: targetPrice, status: "draft", last_error: null, updated_at: new Date().toISOString() })
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
