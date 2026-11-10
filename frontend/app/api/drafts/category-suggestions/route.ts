import { NextResponse } from "next/server";
import { draftRequestUser } from "../../../../lib/drafts/server";
import { repricerAdmin } from "../../../../lib/repricer/admin";
import { suggestEbayCategories } from "../../../../lib/repricer/ebay";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await draftRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const url = new URL(request.url);
    const draftId = String(url.searchParams.get("draftId") || "");
    const storeId = String(url.searchParams.get("storeId") || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(draftId)) throw new Error("Ungültiger Entwurf.");
    if (!/^[0-9a-f-]{36}$/i.test(storeId)) throw new Error("Wähle zuerst einen aktiven eBay-DE-Shop aus.");
    const { data: draft, error } = await repricerAdmin().from("draft_products")
      .select("title,asin").eq("id", draftId).eq("user_id", user.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!draft) return NextResponse.json({ error: "Entwurf nicht gefunden." }, { status: 404 });
    const categories = await suggestEbayCategories(user.id, String(draft.title || draft.asin), storeId);
    return NextResponse.json({ categories }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "eBay-Kategorien konnten nicht geladen werden." }, { status: 502 });
  }
}
