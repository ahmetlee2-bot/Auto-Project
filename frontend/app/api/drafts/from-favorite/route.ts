import { NextResponse } from "next/server";
import { repricerAdmin } from "../../../../lib/repricer/admin";
import { calculateDraftTargetPrice } from "../../../../lib/drafts/pricing";
import { draftRequestUser, parseDraftImages } from "../../../../lib/drafts/server";

export const runtime = "nodejs";

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

    const sourcePrice = favorite.amazon_price == null ? null : Number(favorite.amazon_price);
    const margin = 20;
    const { data: draft, error: insertError } = await admin.from("draft_products").insert({
      user_id: user.id,
      asin: favorite.asin,
      source_url: favorite.amazon_url,
      source_price: sourcePrice,
      target_price: calculateDraftTargetPrice({ source_price: sourcePrice, shipping_cost: 0, profit_margin_percent: margin }),
      profit_margin_percent: margin,
      shipping_cost: 0,
      title: String(favorite.title || favorite.asin).slice(0, 80),
      description_html: "",
      images: parseDraftImages(Array.isArray(favorite.images) && favorite.images.length ? favorite.images : favorite.image_url ? [favorite.image_url] : []),
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
