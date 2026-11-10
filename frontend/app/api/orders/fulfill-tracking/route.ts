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
  buyer?: { username?: string };
  lineItems?: Array<{ lineItemId: string; legacyItemId?: string; quantity?: number; title?: string }>;
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

    const is3PlMode = body.mode === "adapter" || String(body.mode ?? "").toUpperCase() === "3PL";

    if (is3PlMode) {
      sourceTrackingId = String(body.sourceTrackingId ?? "").trim();
      if (!sourceTrackingId || sourceTrackingId.length > 120) throw new Error("Gib die ursprüngliche Sendungsnummer des Lieferanten ein.");
      const providerValue = String(body.provider ?? "AQUILINE").trim().toUpperCase();
      if (providerValue !== "AQUILINE" && providerValue !== "BLUECARE_EXPRESS") throw new Error("Wähle Aquiline oder BlueCare Express als 3PL-Anbieter.");
      const selectedProvider = providerValue as ThreePlProviderName;
      const recipient = order.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.contactAddress;
      const recipientZip = String(recipient?.postalCode ?? "").trim() || "00000";
      const recipientCity = String(recipient?.city ?? "").trim() || "Deutschland";
      const recipientCountry = String(recipient?.countryCode ?? "DE").trim().toUpperCase() || "DE";
      if (recipientCountry !== "DE") {
        throw new Error("Für die 3PL-Konvertierung wird eine deutsche Lieferadresse benötigt.");
      }

      const shareUrl = amazonUrl(body.amazonShareUrl) || amazonUrl(sourceTrackingId);
      const supplierTrackingNumber = shareUrl
        ? sourceTrackingId.replace(shareUrl, "").trim() || new URL(shareUrl).searchParams.get("trackingId") || "amazon-share-link"
        : sourceTrackingId;
      sourceTrackingId = supplierTrackingNumber;
      const { data: cached, error: cacheError } = await admin.from("tracking_conversions")
        .select("id,converted_carrier,converted_tracking_number,status")
        .eq("user_id", user.id).eq("ebay_order_id", orderId).eq("source_tracking_number", supplierTrackingNumber)
        .in("status", ["CONVERTED", "SENT_TO_EBAY"]).maybeSingle();
      if (cacheError) throw new Error(cacheError.message);

      let convertedCarrier: string;
      let convertedTracking: string;
      if (cached) {
        convertedCarrier = cached.converted_carrier || "Aquiline";
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

      provider = convertedCarrier.toUpperCase().includes("AQUILINE") ? "Aquiline" : convertedCarrier;
      carrierCode = provider || "Aquiline";
      trackingNumber = convertedTracking.replace(/[^a-zA-Z0-9]/g, "");
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

    const sanitizedTrackingNumber = trackingNumber.replace(/[^a-zA-Z0-9]/g, "");

    const { error: saveError } = await admin.from("order_tracking").upsert({
      user_id: user.id,
      store_id: storeId,
      order_id: orderId,
      source_tracking_id: sourceTrackingId,
      tracking_number: sanitizedTrackingNumber,
      carrier_code: carrierCode,
      provider,
      status: "pending",
      last_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,store_id,order_id" });
    if (saveError) throw new Error(saveError.message);

    try {
      const shippedDate = new Date().toISOString();
      try {
        await ebayApiRequest<null>(scope, `/sell/fulfillment/v1/order/${encodeURIComponent(orderId)}/shipping_fulfillment`, "POST", {
          lineItems,
          shippedDate,
          shippingCarrierCode: is3PlMode ? "Aquiline" : carrierCode,
          trackingNumber: sanitizedTrackingNumber,
        });
      } catch (firstError) {
        if (!is3PlMode) throw firstError;
        await ebayApiRequest<null>(scope, `/sell/fulfillment/v1/order/${encodeURIComponent(orderId)}/shipping_fulfillment`, "POST", {
          lineItems,
          shippedDate,
          shippingCarrierCode: "OTHER",
          trackingNumber: sanitizedTrackingNumber,
        });
      }
    } catch (cause) {
      await admin.from("order_tracking").update({ status: "error", last_error: cause instanceof Error ? cause.message : "eBay gönderimi başarısız." })
        .eq("user_id", user.id).eq("store_id", storeId).eq("order_id", orderId);
      throw cause;
    }

    const { error: statusError } = await admin.from("order_tracking").update({ status: "submitted", last_error: null, updated_at: new Date().toISOString() })
      .eq("user_id", user.id).eq("store_id", storeId).eq("order_id", orderId);
    if (statusError) return NextResponse.json({ error: "eBay takip kodunu kabul etti; yerel durum kaydedilemedi. Siparişi yenileyin.", trackingNumber: sanitizedTrackingNumber, carrierCode, walletBalance }, { status: 502 });
    if (conversionId) await admin.from("tracking_conversions").update({ status: "SENT_TO_EBAY" }).eq("id", conversionId).eq("user_id", user.id);

    let buyerMessageSent = false;
    let buyerMessageText: string | null = null;
    const notifyBuyer = body.notifyBuyer !== false;
    const { data: portal } = await admin.from("supplier_order_tracking")
      .select("public_tracking_number,buyer_notified_at")
      .eq("user_id", user.id).eq("store_id", storeId).eq("ebay_order_id", orderId).maybeSingle();
    const portalTrackingCode = is3PlMode ? sanitizedTrackingNumber : (portal?.public_tracking_number || null);
    if (portalTrackingCode) {
      const trackingUrl = `https://autolister-app.de/track/${encodeURIComponent(portalTrackingCode)}`;
      const recipientName = String(order.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.fullName || "").trim();
      buyerMessageText = `Hallo${recipientName ? ` ${recipientName}` : ""}, Ihre Bestellung wurde auf eBay als versandt markiert. Ihre Sendungsnummer lautet ${portalTrackingCode} (${provider || carrierCode}). Den aktuellen Lieferstatus finden Sie unter ${trackingUrl}. Vielen Dank für Ihren Einkauf!`;
      if (notifyBuyer && order.buyer?.username) {
        const itemId = order.lineItems?.find(item => item.legacyItemId)?.legacyItemId;
        try {
          await ebayApiRequest<unknown>(scope, "/commerce/message/v1/send_message", "POST", {
            otherPartyUsername: order.buyer.username,
            messageText: buyerMessageText,
            ...(itemId ? { reference: { referenceType: "LISTING", referenceId: itemId } } : {}),
          });
          buyerMessageSent = true;
          if (portal?.public_tracking_number) {
            await admin.from("supplier_order_tracking").update({ buyer_notified_at: new Date().toISOString() })
              .eq("user_id", user.id).eq("store_id", storeId).eq("ebay_order_id", orderId);
          }
        } catch {
          // Message permission/scopes are optional. Keep the successful fulfillment and expose copyable text.
        }
      }
    }

    return NextResponse.json({
      submitted: true,
      orderId,
      orderFulfillmentStatus: "FULFILLED",
      carrierCode,
      provider,
      trackingNumber: sanitizedTrackingNumber,
      sourceTrackingId,
      trackingUrl: portalTrackingCode ? `/track/${encodeURIComponent(portalTrackingCode)}` : null,
      walletBalance,
      buyerMessageSent,
      buyerMessageText,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Takip bilgisi eBay'e gönderilemedi.";
    const status = message === "INSUFFICIENT_CREDITS" ? 402 : 400;
    return NextResponse.json({ error: message === "INSUFFICIENT_CREDITS" ? "Yetersiz jeton bakiyesi. Lütfen cüzdanınıza kredi ekleyin." : message }, { status });
  }
}
