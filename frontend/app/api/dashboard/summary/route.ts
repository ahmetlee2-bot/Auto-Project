import { NextResponse } from "next/server";
import { draftRequestUser } from "../../../../lib/drafts/server";
import { repricerAdmin } from "../../../../lib/repricer/admin";
export async function GET(request: Request) {
  const user = await draftRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = repricerAdmin();
  const results = await Promise.all([
    admin.from("favorite_products").select("asin").eq("user_id", user.id),
    admin.from("draft_products").select("asin").eq("user_id", user.id).in("status", ["draft", "publishing", "error"]),
    admin.from("tracked_products").select("id,sync_status,last_error").eq("user_id", user.id).eq("active", true),
  ]);
  const failure = results.find(r => r.error)?.error;
  if (failure) return NextResponse.json({ error: failure.message }, { status: 500 });
  const [pool, drafts, tracked] = results;
  return NextResponse.json({ pending: new Set([...(pool.data || []), ...(drafts.data || [])].map(p => p.asin)).size,
    listed: tracked.data?.length || 0, warnings: (tracked.data || []).filter(p => (p.sync_status === "error" || p.sync_status === "out_of_stock") && !p.last_error?.startsWith("VERIFICATION_PENDING:")).length,
  }, { headers: { "Cache-Control": "no-store" } });
}
