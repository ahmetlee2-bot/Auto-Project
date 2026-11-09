import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, isAutolisterAdmin } from "../../../../lib/dashboard/server-auth";
import { createClient } from "../../../../lib/supabase/server";
import { ebayApiRequest } from "../../../../lib/ebay/multi-store";
import { repricerAdmin } from "../../../../lib/repricer/admin";
import { resolveTracking, type TrackingOrderContext } from "../../../../lib/logistics/trackingAdapter";
import { trackingConverterProvider, type ThreePlProviderName } from "../../../../lib/tracking/providers/threePlProvider";

export const runtime = "nodejs";

type EbayAddress = { postalCode?: string; city?: string; countryCode?: string };
type EbayOrder = {
  orderId: string;
  orderFulfillmentStatus?: string;
  lineItems?: Array<{ lineItemId: string; quantity?: number; title?: string }>;
  fulfillmentStartInstructions?: Array<{
    shippingStep?: { shipTo?: { fullName?: string; contactAddress?: EbayAddress } };
  }>;
};

function cleanTrackingNumber(value: unknown): string {
  const trackingNumber = String(value ?? "").replace(/[^a-zA-Z0-9]/g, "");
  if (!/^[a-zA-Z0-9]{6,60}$/.test(trackingNumber)) throw new Error("Gib eine echte Sendungsnummer mit 6–60 Buchstaben oder Ziffern ein.");
  return trackingNumber;
}

function amazonUrl(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  let url: URL;
  try { url = new URL(text); } catch { return undefined; }
  const host = url.hostname.toLowerCase();
  const amazonHost = /^(?:[a-z0-9-]+\.)?amazon\.(?:de|com|co\.uk|fr|it|es|nl|pl|se|com\.tr|ca|com\.au)$/i.test(host);
  const swishipHost = /^(?:[a-z0-9-]+\.)?swiship\.(?:de|com)$/i.test(host);
  if (url.protocol !== "https:" || (!amazonHost && !swishipHost)) return undefined;
  return url.toString();
}

export async function POST(request: NextRequest) {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const storeId = String(body.storeId ?? "").trim();
    const orderId = String(body.orderId ?? "").trim();
    if (!storeId || !orderId || orderId.length > 100) return NextResponse.json({ error: "eBay mağazası veya sipariş kimliği geçersiz." }, { status: 400 });

    const admin = repricerAdmin();
    const { data: store, error: storeError } = await admin.from("ebay_stores")
      .select("id,user_id,marketplace_id").eq("id", storeId).eq("user_id", user.id).maybeSingle();
    if (storeError || !store) return NextResponse.json({ error: "eBay mağazası bulunamadı." }, { status: 404 });
    const scope = { id: store.id, user_id: store.user_id, marketplace_id: store.marketplace_id };
    const order = await ebayApiRequest<EbayOrder>(scope, `/sell/fulfillment/v1/order/${encodeURIComponent(orderId)}`, "GET");
    if (order.orderFulfillmentStatus === "FULFILLED") throw new Error("Bu sipariş eBay'de zaten gönderildi olarak işaretlenmiş.");

    const lineItems = (order.lineItems || []).filter((item) => item.lineItemId && Number(item.quantity) > 0)
      .map((item) => ({ lineItemId: item.lineItemId, quantity: Number(item.quantity) }));
    if (!lineItems.length) throw new Error("eBay siparişinde gönderilecek kalem bulunamadı.");
    const orderContext: TrackingOrderContext = {
      orderId,
      marketplaceId: scope.marketplace_id,
      lineItems: (order.lineItems || []).filter((item) => item.lineItemId && Number(item.quantity) > 0)
        .map((item) => ({ lineItemId: item.lineItemId, quantity: Number(item.quantity), title: item.title })),
    };

    let carrierCode: string;
    let provider: string | null = null;
    let trackingNumber: string;
    let walletBalance: number | null = null;
    let conversionId: string | null = null;
    let sourceTrackingId: string | null = null;

    if (body.mode === "adapter") {
      sourceTrackingId = String(body.sourceTrackingId ?? "").trim();
      if (!sourceTrackingId || sourceTrackingId.length > 120) throw new Error("Gib die ursprüngliche Sendungsnummer des Lieferanten ein.");
      const providerValue = String(body.provider ?? "BLUECARE_EXPRESS").trim().toUpperCase();
      if (providerValue !== "AQUILINE" && providerValue !== "BLUECARE_EXPRESS") throw new Error("Wähle Aquiline oder BlueCare Express als 3PL-Anbieter.");
      const selectedProvider = providerValue as ThreePlProviderName;
      const recipient = order.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.contactAddress;
      const recipientZip = String(recipient?.postalCode ?? "").trim();
      const recipientCity = String(recipient?.city ?? "").trim();
      const recipientCountry = String(recipient?.countryCode ?? "").trim().toUpperCase();
      if (!recipientZip || !recipientCity || recipientCountry !== "DE") {
        throw new Error("Für die 3PL-Konvertierung werden eine deutsche Lieferadresse mit Postleitzahl und Ort benötigt.");
      }

      const shareUrl = amazonUrl(body.amazonShareUrl) || amazonUrl(sourceTrackingId);
      const supplierTrackingNumber = shareUrl
        ? sourceTrackingId.replace(shareUrl, "").trim() || new URL(shareUrl).searchParams.get("trackingId") || "amazon-share-link"
        : sourceTrackingId;
      const { data: cached, error: cacheError } = await admin.from("tracking_conversions")
        .select("id,converted_carrier,converted_tracking_number,status")
        .eq("user_id", user.id).eq("ebay_order_id", orderId).eq("source_tracking_number", supplierTrackingNumber)
        .in("status", ["CONVERTED", "SENT_TO_EBAY"]).maybeSingle();
      if (cacheError) throw new Error(cacheError.message);

      let convertedCarrier: string;
      let convertedTracking: string;
      let convertedEbayCarrierCode = "OTHER";
      if (cached) {
        convertedCarrier = cached.converted_carrier;
        convertedTracking = cleanTrackingNumber(cached.converted_tracking_number);
        conversionId = cached.id;
      } else {
        const converted = await trackingConverterProvider.convert({
          sourceTrackingNumber: supplierTrackingNumber,
          amazonShareUrl: shareUrl,
          recipientZip,
          recipientCity,
          recipientCountry: "DE",
          ebayOrderId: orderId,
          provider: selectedProvider,
        });
        if (!converted.success) throw new Error("Die Sendungsnummer konnte nicht umgewandelt werden.");
        convertedEbayCarrierCode = converted.ebayCarrierCode;

        // Local mock mode must never turn a fake tracking number into a real
        // eBay fulfillment or persist it in the shared production database.
        if (/^(1|true|yes)$/i.test(process.env.TRACKING_MOCK_MODE?.trim() || "false")) {
          return NextResponse.json({
            submitted: false,
            mockMode: true,
            orderId,
            carrierCode: convertedEbayCarrierCode,
            provider: converted.carrierName,
            trackingNumber: converted.convertedTrackingNumber,
          });
        }

        const { error: walletInsertError } = await admin.from("user_wallets").insert({
          user_id: user.id,
          credit_balance: 0,
          is_unlimited: isAutolisterAdmin(user.id),
        });
        if (walletInsertError && walletInsertError.code !== "23505") throw new Error(walletInsertError.message);
        const { error: walletAdminError } = await admin.from("user_wallets")
          .update({ is_unlimited: isAutolisterAdmin(user.id), updated_at: new Date().toISOString() }).eq("user_id", user.id);
        if (walletAdminError) throw new Error(walletAdminError.message);

        const supabase = await createClient();
        const { data: debit, error: debitError } = await supabase.rpc("deduct_tracking_credit", {
          p_user_id: user.id,
          p_ebay_order_id: orderId,
          p_source_tracking: supplierTrackingNumber,
          p_converted_carrier: converted.carrierName,
          p_converted_tracking_number: converted.convertedTrackingNumber,
          p_recipient_zip: recipientZip,
          p_amazon_share_url: shareUrl ?? null,
        });
        if (debitError) {
          if (debitError.message.includes("INSUFFICIENT_CREDITS")) throw new Error("INSUFFICIENT_CREDITS");
          throw new Error(`Guthaben konnte nicht abgebucht werden: ${debitError.message}`);
        }
        const debitResult = debit as {
          credit_balance?: number;
          conversion?: { id?: string; converted_carrier?: string; converted_tracking_number?: string };
        };
        walletBalance = Number(debitResult.credit_balance ?? 0);
        conversionId = debitResult.conversion?.id ?? null;
        convertedCarrier = String(debitResult.conversion?.converted_carrier ?? converted.carrierName);
        convertedTracking = cleanTrackingNumber(debitResult.conversion?.converted_tracking_number ?? converted.convertedTrackingNumber);
      }

      provider = convertedCarrier.toUpperCase().includes("AQUILINE") ? "AQUILINE" : "BLUECARE_EXPRESS";
      // Cached rows retain the provider name but not a vendor-specific eBay code;
      // use the documented generic value for those rows.
      carrierCode = convertedEbayCarrierCode === "BLUECARE" && provider === "BLUECARE_EXPRESS" ? "BLUECARE" : "Other";
      trackingNumber = convertedTracking;
      if (!conversionId) throw new Error("Die Tracking-Konvertierung konnte nicht dauerhaft gespeichert werden.");
    } else {
      const resolved = await resolveTracking({
        mode: "direct",
        carrierCode: body.carrierCode,
        trackingNumber: body.trackingNumber,
        order: orderContext,
      });
      carrierCode = resolved.ebayCarrierCode;
      provider = resolved.provider;
      trackingNumber = cleanTrackingNumber(resolved.trackingNumber);
      sourceTrackingId = String(body.sourceTrackingId ?? "").trim() || null;
    }

    const { error: saveError } = await admin.from("order_tracking").upsert({
      user_id: user.id,
      store_id: storeId,
      order_id: orderId,
      source_tracking_id: sourceTrackingId,
      tracking_number: trackingNumber,
      carrier_code: carrierCode,
      provider,
      status: "pending",
      last_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,store_id,order_id" });
    if (saveError) throw new Error(saveError.message);

    try {
      await ebayApiRequest<null>(scope, `/sell/fulfillment/v1/order/${encodeURIComponent(orderId)}/shipping_fulfillment`, "POST", {
        lineItems,
        shippedDate: new Date().toISOString(),
        shippingCarrierCode: carrierCode,
        trackingNumber,
      });
    } catch (cause) {
      await admin.from("order_tracking").update({ status: "error", last_error: cause instanceof Error ? cause.message : "eBay gönderimi başarısız." })
        .eq("user_id", user.id).eq("store_id", storeId).eq("order_id", orderId);
      throw cause;
    }

    const { error: statusError } = await admin.from("order_tracking").update({ status: "submitted", last_error: null, updated_at: new Date().toISOString() })
      .eq("user_id", user.id).eq("store_id", storeId).eq("order_id", orderId);
    if (statusError) return NextResponse.json({ error: "eBay takip kodunu kabul etti; yerel durum kaydedilemedi. Siparişi yenileyin.", trackingNumber, carrierCode, walletBalance }, { status: 502 });
    if (conversionId) await admin.from("tracking_conversions").update({ status: "SENT_TO_EBAY" }).eq("id", conversionId).eq("user_id", user.id);

    return NextResponse.json({ submitted: true, orderId, carrierCode, provider, trackingNumber, walletBalance });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Takip bilgisi eBay'e gönderilemedi.";
    const status = message === "INSUFFICIENT_CREDITS" ? 402 : 400;
    return NextResponse.json({ error: message === "INSUFFICIENT_CREDITS" ? "Yetersiz jeton bakiyesi. Lütfen cüzdanınıza kredi ekleyin." : message }, { status });
  }
}
