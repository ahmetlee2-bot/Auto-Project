import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "../../../../lib/dashboard/server-auth";
import { repricerAdmin } from "../../../../lib/repricer/admin";
import type { EbayStore } from "../../../../lib/ebay/multi-store";

export const runtime = "nodejs";

const safeFields = [
  "id", "user_id", "store_name", "seller_username", "marketplace_id", "token_expires_at",
  "refresh_token_expires_at", "daily_listing_limit", "auto_lister_enabled", "auto_pull_from_depot",
  "listing_interval_hours", "default_margin_percent", "merchant_location_key", "fulfillment_policy_id",
  "payment_policy_id", "return_policy_id", "status", "last_listed_at",
  "sku_prefix",
].join(",");

export async function GET() {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  const { data, error } = await repricerAdmin().from("ebay_stores").select(safeFields).eq("user_id", user.id).order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: "eBay mağazaları yüklenemedi." }, { status: 500 });
  return NextResponse.json({ stores: (data || []) as unknown as EbayStore[] }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: NextRequest) {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const storeId = String(body.storeId || "");
    if (!/^[0-9a-f-]{36}$/i.test(storeId)) throw new Error("Mağaza kimliği geçersiz.");
    const patch: Record<string, unknown> = {};
    if (body.storeName !== undefined) {
      const storeName = String(body.storeName).trim();
      if (!storeName || storeName.length > 120) throw new Error("Mağaza adı 1–120 karakter olmalı.");
      patch.store_name = storeName;
    }
    if (body.skuPrefix !== undefined) {
      const skuPrefix = String(body.skuPrefix || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
      if (skuPrefix && !/^[A-Z0-9]{2,6}$/.test(skuPrefix)) throw new Error("SKU-Präfix muss 2–6 Buchstaben oder Ziffern enthalten.");
      patch.sku_prefix = skuPrefix || null;
    }
    if (body.dailyListingLimit !== undefined) {
      const limit = Number(body.dailyListingLimit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("Günlük listeleme limiti 1–500 arasında olmalı.");
      patch.daily_listing_limit = limit;
    }
    if (body.listingIntervalHours !== undefined) {
      const interval = Number(body.listingIntervalHours);
      if (!Number.isInteger(interval) || interval < 1 || interval > 720) throw new Error("Listeleme aralığı 1–720 saat arasında olmalı.");
      patch.listing_interval_hours = interval;
    }
    if (body.defaultMarginPercent !== undefined) {
      const margin = Number(body.defaultMarginPercent);
      if (!Number.isFinite(margin) || margin < 0 || margin > 300) throw new Error("Varsayılan marj 0–300 arasında olmalı.");
      patch.default_margin_percent = margin;
    }
    if (body.autoListerEnabled !== undefined) patch.auto_lister_enabled = body.autoListerEnabled === true;
    if (body.autoPullFromDepot !== undefined) patch.auto_pull_from_depot = body.autoPullFromDepot === true;
    for (const [inputKey, column] of [
      ["merchantLocationKey", "merchant_location_key"],
      ["fulfillmentPolicyId", "fulfillment_policy_id"],
      ["paymentPolicyId", "payment_policy_id"],
      ["returnPolicyId", "return_policy_id"],
    ] as const) {
      if (body[inputKey] !== undefined) patch[column] = String(body[inputKey]).trim() || null;
    }
    if (!Object.keys(patch).length) throw new Error("Kaydedilecek mağaza ayarı bulunamadı.");
    const { data, error } = await repricerAdmin().from("ebay_stores").update(patch).eq("id", storeId).eq("user_id", user.id).select(safeFields).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Mağaza bulunamadı." }, { status: 404 });
    return NextResponse.json({ store: data });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Mağaza ayarları kaydedilemedi." }, { status: 400 });
  }
}
