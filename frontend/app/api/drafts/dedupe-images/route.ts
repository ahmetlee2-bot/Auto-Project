import { NextResponse } from "next/server";
import { draftRequestUser, parseDraftImages } from "../../../../lib/drafts/server";
import { repricerAdmin } from "../../../../lib/repricer/admin";
import { dedupeSimilarProductImages } from "../../../../lib/images/dedupeSimilarProductImages";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const user = await draftRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { draftId?: unknown };
    const draftId = String(body.draftId || "");
    if (!/^[0-9a-f-]{36}$/i.test(draftId)) throw new Error("Ungültiger Entwurf.");
    const admin = repricerAdmin();
    const { data: draft, error: readError } = await admin.from("draft_products")
      .select("images,status,ebay_item_id").eq("id", draftId).eq("user_id", user.id).maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!draft) return NextResponse.json({ error: "Entwurf nicht gefunden." }, { status: 404 });
    if (draft.ebay_item_id || !["draft", "error"].includes(draft.status)) throw new Error("Die Bilder dieses Entwurfs können nicht mehr geändert werden.");
    const images = await dedupeSimilarProductImages(parseDraftImages(draft.images));
    if (images.length < parseDraftImages(draft.images).length) {
      const { error: updateError } = await admin.from("draft_products").update({ images, updated_at: new Date().toISOString() })
        .eq("id", draftId).eq("user_id", user.id).in("status", ["draft", "error"]).is("ebay_item_id", null);
      if (updateError) throw new Error(updateError.message);
    }
    return NextResponse.json({ images, removed: parseDraftImages(draft.images).length - images.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Doppelte Produktbilder konnten nicht entfernt werden." }, { status: 400 });
  }
}
