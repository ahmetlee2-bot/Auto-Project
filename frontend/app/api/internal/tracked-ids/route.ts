import { NextRequest, NextResponse } from "next/server";
import { repricerAdmin } from "../../../../lib/repricer/admin";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ownerId = process.env.EBAY_LEGACY_OWNER_USER_ID;
  if (!ownerId) return NextResponse.json({ ids: [] }, { headers: { "Cache-Control": "no-store" } });
  const admin = repricerAdmin();
  const ids: string[] = [];
  for (let offset = 0; offset < 100_000; offset += 1000) {
    const { data, error } = await admin.from("tracked_products").select("ebay_item_id").eq("user_id", ownerId).order("id").range(offset, offset + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    ids.push(...(data || []).map((row) => row.ebay_item_id));
    if (!data || data.length < 1000) break;
  }
  return NextResponse.json({ ids }, { headers: { "Cache-Control": "no-store" } });
}
