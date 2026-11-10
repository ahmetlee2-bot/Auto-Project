import { NextResponse } from "next/server";
import { repricerAdmin } from "../../../../lib/repricer/admin";
import { calculateDraftTargetPrice } from "../../../../lib/drafts/pricing";
import { draftRequestUser, parseDraftImages } from "../../../../lib/drafts/server";
import { dedupeSimilarProductImages } from "../../../../lib/images/dedupeSimilarProductImages";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const user = await draftRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Ungültige Entwurfs-ID." }, { status: 400 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const admin = repricerAdmin();
    const { data: current, error: readError } = await admin.from("draft_products").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!current) return NextResponse.json({ error: "Entwurf nicht gefunden." }, { status: 404 });
    if (current.ebay_item_id) return NextResponse.json({ error: "Dieses Angebot ist bereits live. Verwende „Jetzt veröffentlichen“ erneut, um die Überwachung zu verknüpfen." }, { status: 409 });
    if (!["draft", "error"].includes(current.status)) return NextResponse.json({ error: "Dieser Entwurf wird gerade veröffentlicht oder wurde bereits veröffentlicht." }, { status: 409 });

    const title = String(body.title ?? current.title).trim();
    if (!title || title.length > 80) throw new Error("Der eBay-Titel muss zwischen 1 und 80 Zeichen lang sein.");
    const margin = Number(body.profit_margin_percent ?? current.profit_margin_percent);
    const shipping = Number(body.shipping_cost ?? current.shipping_cost);
    if (!Number.isFinite(margin) || margin < 0 || margin > 300) throw new Error("Die Zielmarge muss zwischen 0 und 300 % liegen.");
    if (!Number.isFinite(shipping) || shipping < 0 || shipping > 100_000) throw new Error("Die Versandkosten sind ungültig.");
    const images = await dedupeSimilarProductImages(parseDraftImages(body.images === undefined ? current.images : body.images));
    if (body.apply_custom_frame !== undefined && typeof body.apply_custom_frame !== "boolean") throw new Error("Die Rahmen-Option muss wahr oder falsch sein.");
    const description = String(body.description_html ?? current.description_html ?? "");
    if (description.length > 50_000) throw new Error("Die Beschreibung darf maximal 50.000 Zeichen enthalten.");
    const category = String(body.selected_category_id ?? current.selected_category_id ?? "").trim();
    const rawSpecifics = body.item_specifics === undefined ? current.item_specifics : body.item_specifics;
    if (!rawSpecifics || typeof rawSpecifics !== "object" || Array.isArray(rawSpecifics)) throw new Error("Die eBay-Produktmerkmale sind ungültig.");
    const itemSpecifics: Record<string, string[]> = {};
    for (const [key, rawValues] of Object.entries(rawSpecifics as Record<string, unknown>).slice(0, 100)) {
      const name = key.trim().slice(0, 100);
      const values = Array.isArray(rawValues) ? rawValues : [rawValues];
      const clean = values.map((value) => String(value ?? "").trim().slice(0, 100)).filter(Boolean).slice(0, 5);
      if (name && clean.length) itemSpecifics[name] = clean;
    }
    const rawManualPrice = body.manual_sale_price === undefined ? current.manual_sale_price : body.manual_sale_price;
    const manualSalePrice = rawManualPrice == null || rawManualPrice === "" ? null : Number(rawManualPrice);
    if (manualSalePrice !== null && (!Number.isFinite(manualSalePrice) || manualSalePrice <= 0 || manualSalePrice > 1_000_000)) throw new Error("Der manuelle eBay-Verkaufspreis muss zwischen 0,01 € und 1.000.000 € liegen.");
    const changes = {
      title,
      description_html: description,
      images,
      apply_custom_frame: body.apply_custom_frame ?? current.apply_custom_frame,
      cover_image_url: null,
      cover_source_url: null,
      published_images: [],
      selected_category_id: category || null,
      item_specifics: itemSpecifics,
      manual_sale_price: manualSalePrice,
      profit_margin_percent: margin,
      shipping_cost: shipping,
      target_price: manualSalePrice ?? calculateDraftTargetPrice({ source_price: current.source_price, shipping_cost: shipping, profit_margin_percent: margin }),
      status: "draft",
      last_error: null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await admin.from("draft_products").update(changes).eq("id", id).eq("user_id", user.id)
      .in("status", ["draft", "error"]).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Der Entwurf wurde gleichzeitig geändert. Bitte lade die Liste neu." }, { status: 409 });
    return NextResponse.json({ draft: data });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Entwurf konnte nicht gespeichert werden." }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const user = await draftRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data, error } = await repricerAdmin().from("draft_products").delete().eq("id", id).eq("user_id", user.id)
    .in("status", ["draft", "error"]).is("ebay_item_id", null).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Entwurf wurde nicht gefunden oder wird gerade veröffentlicht." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
