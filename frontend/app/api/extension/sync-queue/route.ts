import { NextResponse } from "next/server";
import { draftRequestUser } from "../../../../lib/drafts/server";
import { repricerAdmin } from "../../../../lib/repricer/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await draftRequestUser(request);
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  const force = new URL(request.url).searchParams.get("force") === "1";
  const cutoff = new Date(Date.now() - (force ? 5 : 60) * 60_000).toISOString();
  const admin = repricerAdmin();
  const { data, error } = await admin.from("tracked_products")
    .select("id,amazon_url,amazon_asin,amazon_price,amazon_stock_status,ebay_item_id,ebay_price,ebay_quantity,last_checked_at,active,supplier")
    .eq("user_id", user.id).eq("supplier", "joybuy_de").eq("active", true)
    .or(`last_checked_at.is.null,last_checked_at.lt.${cutoff}`)
    .order("last_checked_at", { ascending: true, nullsFirst: true }).limit(8);
  if (error) return NextResponse.json({ error: "Joybuy-Synchronisierungswarteschlange konnte nicht geladen werden." }, { status: 500 });
  const rows = data || [];
  const itemIds = rows.map((row) => String(row.ebay_item_id || "")).filter(Boolean);
  const { data: drafts, error: draftError } = itemIds.length
    ? await admin.from("draft_products").select("ebay_item_id,ebay_sku").eq("user_id", user.id).in("ebay_item_id", itemIds)
    : { data: [], error: null };
  if (draftError) return NextResponse.json({ error: "eBay-SKUs konnten nicht geladen werden." }, { status: 500 });
  const skuByItem = new Map((drafts || []).map((draft) => [String(draft.ebay_item_id), String(draft.ebay_sku || "")]));
  return NextResponse.json({ items: rows.map((row) => ({
    id: row.id,
    source_url: row.amazon_url,
    sku: skuByItem.get(String(row.ebay_item_id)) || "",
    current_source_price: row.amazon_price,
    current_stock: row.amazon_stock_status,
    ebay_item_id: row.ebay_item_id,
    last_checked_at: row.last_checked_at,
  })) }, { headers: { "Cache-Control": "no-store" } });
}
