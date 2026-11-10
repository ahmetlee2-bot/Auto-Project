import { NextResponse } from "next/server";
import { draftRequestUser } from "../../../../lib/drafts/server";
import { repricerAdmin } from "../../../../lib/repricer/admin";
import { getDraftRequiredAspects } from "../../../../lib/repricer/ebay";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await draftRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const query = new URL(request.url).searchParams;
    const draftId = String(query.get("draftId") || "");
    const categoryId = String(query.get("categoryId") || "").trim();
    const storeId = String(query.get("storeId") || "").trim() || undefined;
    if (!/^[0-9a-f-]{36}$/i.test(draftId)) throw new Error("Ungültiger Entwurf.");
    if (!/^\d{1,20}$/.test(categoryId)) throw new Error("Wähle zuerst eine gültige eBay-Kategorie.");
    const { data: draft, error } = await repricerAdmin().from("draft_products")
      .select("title,description_html,item_specifics").eq("id", draftId).eq("user_id", user.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!draft) return NextResponse.json({ error: "Entwurf nicht gefunden." }, { status: 404 });
    const itemSpecifics = draft.item_specifics && typeof draft.item_specifics === "object" && !Array.isArray(draft.item_specifics)
      ? draft.item_specifics as Record<string, string[]> : {};
    const aspects = await getDraftRequiredAspects(user.id, storeId, categoryId, String(draft.title || ""), String(draft.description_html || ""), itemSpecifics);
    return NextResponse.json({ aspects }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "eBay-Pflichtmerkmale konnten nicht geladen werden." }, { status: 502 });
  }
}
