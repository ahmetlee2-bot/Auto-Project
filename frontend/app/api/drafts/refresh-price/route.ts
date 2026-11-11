import { NextResponse } from "next/server";
import { calculateDraftTargetPrice, estimateDraftNetProfit, resolveEffectiveDraftPrice } from "../../../../lib/drafts/pricing";
import { draftRequestUser } from "../../../../lib/drafts/server";
import { repricerAdmin } from "../../../../lib/repricer/admin";
import { fetchAmazonProductDetails } from "../../../../lib/repricer/amazon";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await draftRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { draftId?: unknown };
    const draftId = String(body.draftId || "");
    if (!/^[0-9a-f-]{36}$/i.test(draftId)) throw new Error("Ungültiger Entwurf.");
    const admin = repricerAdmin();
    const { data: draft, error: readError } = await admin.from("draft_products")
      .select("id,asin,profit_margin_percent,shipping_cost,manual_sale_price,status,ebay_item_id")
      .eq("id", draftId).eq("user_id", user.id).maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!draft) return NextResponse.json({ error: "Entwurf nicht gefunden." }, { status: 404 });
    if (draft.ebay_item_id || !["draft", "error"].includes(draft.status)) throw new Error("Der Preis kann für diesen Entwurf nicht mehr geändert werden.");
    const product = await fetchAmazonProductDetails(String(draft.asin), "AMZ_DE");
    const targetPrice = calculateDraftTargetPrice({
      source_price: product.price,
      shipping_cost: draft.shipping_cost,
      profit_margin_percent: draft.profit_margin_percent,
    });
    const manualProfit = draft.manual_sale_price != null
      ? estimateDraftNetProfit(
          { source_price: product.price, shipping_cost: draft.shipping_cost, profit_margin_percent: draft.profit_margin_percent },
          draft.manual_sale_price,
        )
      : null;
    const clearLossManual = manualProfit !== null && manualProfit < 0 && Number(draft.profit_margin_percent ?? 20) > 0;
    const nextManual = clearLossManual ? null : draft.manual_sale_price;
    const effectiveTarget = resolveEffectiveDraftPrice({
      source_price: product.price,
      shipping_cost: draft.shipping_cost,
      profit_margin_percent: draft.profit_margin_percent,
      manual_sale_price: nextManual,
      target_price: targetPrice,
    });
    const { error: updateError } = await admin.from("draft_products").update({
      source_price: product.price,
      manual_sale_price: nextManual,
      target_price: effectiveTarget ?? targetPrice,
      updated_at: new Date().toISOString(),
    }).eq("id", draftId).eq("user_id", user.id).is("ebay_item_id", null);
    if (updateError) throw new Error(updateError.message);
    return NextResponse.json({ sourcePrice: product.price, targetPrice: effectiveTarget ?? targetPrice });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Amazon-Preis konnte nicht aktualisiert werden." }, { status: 400 });
  }
}
