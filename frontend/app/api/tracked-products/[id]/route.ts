import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { repricerAdmin } from "../../../../lib/repricer/admin";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

async function owner(id: string) {
  const client = await createClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return null;
  const { data } = await client.from("tracked_products").select("id,user_id").eq("id", id).maybeSingle();
  return data?.user_id === auth.user.id ? auth.user.id : null;
}

export async function PATCH(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const userId = await owner(id);
  if (!userId) return NextResponse.json({ error: "Produkt nicht gefunden." }, { status: 404 });
  try {
    const body = await request.json();
    const patch: Record<string, number | boolean> = {};
    if (body.targetMarginPercent !== undefined) {
      const value = Number(body.targetMarginPercent);
      if (!Number.isFinite(value) || value < 0 || value > 300) throw new Error("Marge muss zwischen 0 und 300 % liegen.");
      patch.target_margin_percent = value;
    }
    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") throw new Error("Ungültiger Aktiv-Status.");
      patch.active = body.active;
    }
    if (!Object.keys(patch).length) throw new Error("Keine gültige Änderung übermittelt.");
    const { data, error } = await repricerAdmin().from("tracked_products").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId).or(`sync_lease_until.is.null,sync_lease_until.lt.${new Date().toISOString()}`).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Synchronisierung läuft. Änderung anschließend erneut speichern." }, { status: 409 });
    return NextResponse.json({ product: data });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Änderung fehlgeschlagen." }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  const { id } = await context.params;
  const userId = await owner(id);
  if (!userId) return NextResponse.json({ error: "Produkt nicht gefunden." }, { status: 404 });
  const { data, error } = await repricerAdmin().from("tracked_products").delete().eq("id", id).eq("user_id", userId).or(`sync_lease_until.is.null,sync_lease_until.lt.${new Date().toISOString()}`).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "Synchronisierung läuft. Löschen anschließend erneut versuchen." }, { status: 409 });
  return NextResponse.json({ deleted: true });
}
