import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "../../../../../../../../lib/dashboard/server-auth";
import { ebayApiRequest } from "../../../../../../../../lib/ebay/multi-store";
import { repricerAdmin } from "../../../../../../../../lib/repricer/admin";
import { resolveTracking, type TrackingMode, type TrackingOrderContext } from "../../../../../../../../lib/logistics/trackingAdapter";

export const runtime = "nodejs";

type EbayOrder = {
  orderId: string;
  orderFulfillmentStatus?: string;
  lineItems?: Array<{ lineItemId: string; quantity?: number; title?: string }>;
};

export async function POST(request: NextRequest, context: { params: Promise<{ storeId: string; orderId: string }> }) {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  const { storeId, orderId } = await context.params;
  if (!orderId || orderId.length > 100) return NextResponse.json({ error: "eBay sipariş kimliği geçersiz." }, { status: 400 });
  try {
    const body = await request.json() as {
      mode?: unknown;
      trackingNumber?: unknown;
      carrierCode?: unknown;
      provider?: unknown;
      sourceTrackingId?: unknown;
    };
    const { data: store, error } = await repricerAdmin().from("ebay_stores").select("id,user_id,marketplace_id")
      .eq("id", storeId).eq("user_id", user.id).maybeSingle();
    if (error || !store) return NextResponse.json({ error: "eBay mağazası bulunamadı." }, { status: 404 });
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
    const resolved = await resolveTracking({
      mode: String(body.mode || "direct") as TrackingMode,
      carrierCode: body.carrierCode,
      trackingNumber: body.trackingNumber,
      provider: body.provider,
      sourceTrackingId: body.sourceTrackingId,
      order: orderContext,
    });
    const admin = repricerAdmin();
    const { error: saveError } = await admin.from("order_tracking").upsert({
      user_id: user.id, store_id: storeId, order_id: orderId,
      source_tracking_id: String(body.sourceTrackingId || "").trim() || null,
      tracking_number: resolved.trackingNumber, carrier_code: resolved.ebayCarrierCode,
      provider: resolved.provider, status: "pending", last_error: null, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,store_id,order_id" });
    if (saveError) throw new Error(saveError.message);
    try {
    await ebayApiRequest<null>(scope, `/sell/fulfillment/v1/order/${encodeURIComponent(orderId)}/shipping_fulfillment`, "POST", {
      lineItems,
      shippedDate: new Date().toISOString(),
      shippingCarrierCode: resolved.ebayCarrierCode,
      trackingNumber: resolved.trackingNumber,
    });
    } catch (cause) {
      await admin.from("order_tracking").update({ status: "error", last_error: cause instanceof Error ? cause.message : "eBay gönderimi başarısız." }).eq("user_id", user.id).eq("store_id", storeId).eq("order_id", orderId);
      throw cause;
    }
    const { error: statusError } = await admin.from("order_tracking").update({ status: "submitted", last_error: null, updated_at: new Date().toISOString() }).eq("user_id", user.id).eq("store_id", storeId).eq("order_id", orderId);
    if (statusError) return NextResponse.json({ error: "eBay takip kodunu kabul etti; yerel durum kaydedilemedi. Yeniden göndermeden siparişi yenileyin." }, { status: 502 });
    return NextResponse.json({ submitted: true, orderId, carrierCode: resolved.ebayCarrierCode, provider: resolved.provider });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Takip bilgisi eBay'e gönderilemedi." }, { status: 400 });
  }
}
