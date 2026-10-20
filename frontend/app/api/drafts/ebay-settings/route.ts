import { NextResponse } from "next/server";
import { draftRequestUser } from "../../../../lib/drafts/server";
import { getEbayListingSetup } from "../../../../lib/repricer/ebay";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await draftRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const setup = await getEbayListingSetup(user.id);
    return NextResponse.json(setup, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "eBay-Einstellungen konnten nicht geladen werden." }, { status: 502 });
  }
}
