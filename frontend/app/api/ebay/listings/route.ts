import { NextResponse } from "next/server";
import { getRequestUser } from "../../../../lib/dashboard/server-auth";
import { activeListingsForUser } from "../../../../lib/ebay/active-listings";
export const runtime = "nodejs";
export async function GET() {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json(await activeListingsForUser(user.id), { headers: { "Cache-Control": "no-store" } }); }
  catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "eBay ilanları alınamadı." }, { status: 502 }); }
}
