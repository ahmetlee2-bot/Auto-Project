import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { isJoybuyTrackedProduct, syncProductById } from "../../../../../lib/repricer/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await createClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await client.from("tracked_products").select("id,supplier,amazon_asin,active").eq("id", id).maybeSingle();
  if (data && isJoybuyTrackedProduct(data)) {
    return NextResponse.json({ extensionSync: true, active: data.active, message: data.active ? "Joybuy is synchronized by the signed-in browser extension." : "Joybuy extension sync is paused for this listing." });
  }
  if (!data?.active) return NextResponse.json({ error: "Aktives Produkt nicht gefunden." }, { status: 404 });
  try {
    const result = await syncProductById(id, auth.user.id);
    if (result.skipped) return NextResponse.json({ error: "Synchronisierung läuft bereits." }, { status: 409 });
    return NextResponse.json(result);
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Synchronisierung fehlgeschlagen." }, { status: 502 });
  }
}
