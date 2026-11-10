import { NextResponse } from "next/server";
import { draftRequestUser } from "../../../../lib/drafts/server";
import { createDefaultEbayLocation, getEbayListingSetup, saveEbayListingSetup, type EbayListingSetup } from "../../../../lib/repricer/ebay";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await draftRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const storeId = new URL(request.url).searchParams.get("storeId") || undefined;
    const setup = await getEbayListingSetup(user.id, storeId);
    return NextResponse.json(setup, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "eBay-Einstellungen konnten nicht geladen werden." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const user = await draftRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as {
      storeId?: unknown;
      action?: unknown;
      city?: unknown;
      postalCode?: unknown;
      settings?: Partial<Pick<EbayListingSetup["defaults"], "merchantLocationKey" | "fulfillmentPolicyId" | "paymentPolicyId" | "returnPolicyId">>;
    };
    const storeId = String(body.storeId || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(storeId)) return NextResponse.json({ error: "Bitte wähle einen gültigen eBay-Shop aus." }, { status: 400 });
    if (body.action === "createDefaultLocation") {
      const merchantLocationKey = await createDefaultEbayLocation(user.id, storeId, String(body.city || "Augsburg").trim(), String(body.postalCode || "86150").trim());
      return NextResponse.json({ merchantLocationKey }, { headers: { "Cache-Control": "no-store" } });
    }
    const settings = {
      merchantLocationKey: String(body.settings?.merchantLocationKey || "").trim(),
      fulfillmentPolicyId: String(body.settings?.fulfillmentPolicyId || "").trim(),
      paymentPolicyId: String(body.settings?.paymentPolicyId || "").trim(),
      returnPolicyId: String(body.settings?.returnPolicyId || "").trim(),
    };
    if (!settings.merchantLocationKey || !settings.fulfillmentPolicyId || !settings.paymentPolicyId || !settings.returnPolicyId) {
      return NextResponse.json({ error: "Standort sowie Versand-, Zahlungs- und Rückgaberichtlinie müssen gesetzt sein." }, { status: 400 });
    }
    await saveEbayListingSetup(user.id, storeId, settings);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "eBay-Einstellungen konnten nicht gespeichert werden." }, { status: 502 });
  }
}
