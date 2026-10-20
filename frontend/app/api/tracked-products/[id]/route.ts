import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { repricerAdmin } from "../../../../lib/repricer/admin";
import { syncProductById } from "../../../../lib/repricer/sync";
import { endEbayListing, fetchEbayListing } from "../../../../lib/repricer/ebay";

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
    const patch: Record<string, number | boolean | null> = {};
    if (body.targetMarginPercent !== undefined) {
      const value = Number(body.targetMarginPercent);
      if (!Number.isFinite(value) || value < 0 || value > 300) throw new Error("Marge muss zwischen 0 und 300 % liegen.");
      patch.target_margin_percent = value;
    }
    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") throw new Error("Ungültiger Aktiv-Status.");
      patch.active = body.active;
    }
    if (body.estimatedShipping !== undefined) {
      const value = Number(body.estimatedShipping);
      if (!Number.isFinite(value) || value < 0 || value > 10000) throw new Error("Kargo ücreti 0 ile 10.000 € arasında olmalı.");
      patch.estimated_shipping = value;
    }
    if (body.minimumSalePrice !== undefined) {
      const value = Number(body.minimumSalePrice);
      if (!Number.isFinite(value) || value < 0 || value > 1000000) throw new Error("Minimum fiyat geçersiz.");
      patch.minimum_sale_price = value;
    }
    if (body.manualQuantityOverride !== undefined) {
      if (body.manualQuantityOverride === null || body.manualQuantityOverride === "") patch.manual_quantity_override = null;
      else {
        const value = Number(body.manualQuantityOverride);
        if (!Number.isInteger(value) || value < 0 || value > 10000) throw new Error("eBay stoğu 0 ile 10.000 arasında tam sayı olmalı.");
        patch.manual_quantity_override = value;
      }
    }
    if (!Object.keys(patch).length) throw new Error("Keine gültige Änderung übermittelt.");
    const admin = repricerAdmin();
    const { data, error } = await admin.from("tracked_products").update({ ...patch, sync_status: "error", last_error: "Einstellungen geändert; Synchronisierung ausstehend.", last_checked_at: null, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId).or(`sync_lease_until.is.null,sync_lease_until.lt.${new Date().toISOString()}`).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Synchronisierung läuft. Änderung anschließend erneut speichern." }, { status: 409 });
    if (body.recalculate === true && data.active) {
      try {
        const result = await syncProductById(id, userId);
        return NextResponse.json({ product: result.product || data, syncSkipped: result.skipped === true });
      } catch (cause) {
        return NextResponse.json({ product: data, syncError: cause instanceof Error ? cause.message : "Senkronizasyon başarısız." }, { status: 502 });
      }
    }
    return NextResponse.json({ product: data });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Änderung fehlgeschlagen." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const userId = await owner(id);
  if (!userId) return NextResponse.json({ error: "Produkt nicht gefunden." }, { status: 404 });
  let endListing = false;
  try { endListing = (await request.json()).endEbayListing === true; } catch { /* Empty DELETE body means only remove tracking. */ }
  if (endListing) {
    const { data: product, error: readError } = await repricerAdmin().from("tracked_products").select("ebay_item_id,amazon_asin").eq("id", id).eq("user_id", userId).maybeSingle();
    if (readError || !product) return NextResponse.json({ error: readError?.message || "Produkt nicht gefunden." }, { status: 404 });
    try {
      const live = await fetchEbayListing(userId, product.ebay_item_id, product.amazon_asin);
      await endEbayListing(userId, product.ebay_item_id, live.sku);
    }
    catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "eBay-Angebot konnte nicht beendet werden." }, { status: 502 }); }
  }
  const { data, error } = await repricerAdmin().from("tracked_products").delete().eq("id", id).eq("user_id", userId).or(`sync_lease_until.is.null,sync_lease_until.lt.${new Date().toISOString()}`).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "Synchronisierung läuft. Löschen anschließend erneut versuchen." }, { status: 409 });
  return NextResponse.json({ deleted: true });
}
