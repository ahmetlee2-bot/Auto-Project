import { NextRequest, NextResponse } from "next/server";
import { bearerUser } from "../../../../lib/supabase/bearer-user";
import { ebayApiRequest, type MarketplaceId } from "../../../../lib/ebay/multi-store";
import { repricerAdmin } from "../../../../lib/repricer/admin";
import { appendDeliveryStatus, DELIVERY_STATUSES, isDeliveryStatus, nextDeliveryStatus, STATUS_LABELS, type DeliveryStatus } from "../../../../lib/tracking/status-history";

export const runtime = "nodejs";

type EbayOrder = {
  orderId: string;
  orderFulfillmentStatus?: string;
  fulfillmentStartInstructions?: Array<{ shippingStep?: { shipTo?: { fullName?: string; contactAddress?: { city?: string; postalCode?: string } } } }>;
};
type Store = { id: string; user_id: string; marketplace_id: MarketplaceId; status: string };

function cleanText(value: unknown, max: number): string {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
function normalizedName(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function amazonShareUrl(value: unknown): string | null {
  const text = cleanText(value, 1500);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || !/^(?:www\.)?amazon\.de$/i.test(url.hostname)) return null;
    if (!/\/progress-tracker\/package(?:\/|$)|\/gp\/your-account\/ship-track/i.test(url.pathname)) return null;
    return url.toString();
  } catch { return null; }
}

export async function POST(request: NextRequest) {
  const user = await bearerUser(request);
  if (!user) return NextResponse.json({ error: "AutoLister-Anmeldung ist abgelaufen. Bitte Erweiterung erneut anmelden." }, { status: 401 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const supplierOrderId = cleanText(body.supplierOrderId, 80);
    const recipientName = cleanText(body.recipientName, 160);
    const sourceCarrier = cleanText(body.sourceCarrier, 80);
    const sourceTrackingNumber = cleanText(body.sourceTrackingNumber, 80).replace(/\s/g, "");
    const shareTrackingUrl = amazonShareUrl(body.shareTrackingUrl);
    const estimatedDeliveryDate = cleanText(body.estimatedDeliveryDate, 10);
    const requestedStatus = cleanText(body.deliveryStatus, 40).toUpperCase();
    const deliveryStatus: DeliveryStatus = isDeliveryStatus(requestedStatus) ? requestedStatus : "ORDER_RECEIVED";
    const requestedStoreId = cleanText(body.ebayStoreId, 80);
    const requestedOrderId = cleanText(body.ebayOrderId, 100);
    if (!/^\d{3}-\d{7}-\d{7}$/.test(supplierOrderId)) return NextResponse.json({ error: "Amazon-Bestellnummer ist ungültig." }, { status: 400 });
    if (!recipientName || !/^[a-z0-9]{6,60}$/i.test(sourceTrackingNumber)) return NextResponse.json({ error: "Empfänger oder Trackingnummer ist nicht vollständig." }, { status: 400 });
    if (estimatedDeliveryDate && !/^\d{4}-\d{2}-\d{2}$/.test(estimatedDeliveryDate)) return NextResponse.json({ error: "Voraussichtliches Lieferdatum ist ungültig." }, { status: 400 });

    const admin = repricerAdmin();
    const existing = await admin.from("supplier_order_tracking")
      .select("store_id,ebay_order_id,public_tracking_number,delivery_status,status_history").eq("user_id", user.id).eq("supplier", "amazon")
      .eq("supplier_order_id", supplierOrderId).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) {
      const oldStatus = isDeliveryStatus(existing.data.delivery_status) ? existing.data.delivery_status : "ORDER_RECEIVED";
      const effectiveStatus = nextDeliveryStatus(oldStatus, deliveryStatus);
      const { data, error } = await admin.from("supplier_order_tracking").update({
        recipient_name: recipientName, source_carrier: sourceCarrier || null,
        source_tracking_number: sourceTrackingNumber, amazon_share_url: shareTrackingUrl,
        estimated_delivery_date: estimatedDeliveryDate || null, estimated_delivery: estimatedDeliveryDate || null,
        recipient_zip: cleanText(body.recipientZip, 20) || null, recipient_city: cleanText(body.recipientCity, 100) || null,
        delivery_status: effectiveStatus, status_history: appendDeliveryStatus(existing.data.status_history, oldStatus, effectiveStatus),
        synced_at: new Date().toISOString(), last_synced_at: new Date().toISOString(),
      }).eq("user_id", user.id).eq("supplier_order_id", supplierOrderId)
        .select("store_id,ebay_order_id,public_tracking_number,delivery_status").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ synced: true, updated: true, ebayOrderId: data.ebay_order_id, storeId: data.store_id, trackingReference: data.public_tracking_number, deliveryStatus: data.delivery_status });
    }

    const { data: stores, error: storesError } = await admin.from("ebay_stores")
      .select("id,user_id,marketplace_id,status").eq("user_id", user.id).eq("status", "active");
    if (storesError) throw new Error(storesError.message);
    const candidates: Array<{ store: Store; order: EbayOrder }> = [];
    const wanted = normalizedName(recipientName);
    for (const store of (stores || []) as Store[]) {
      if (requestedStoreId && store.id !== requestedStoreId) continue;
      const params = new URLSearchParams({ limit: "50" });
      const result = await ebayApiRequest<{ orders?: EbayOrder[] }>(store, `/sell/fulfillment/v1/order?${params}`, "GET");
      for (const order of result.orders || []) {
        if (order.orderFulfillmentStatus === "FULFILLED") continue;
        if (requestedOrderId && order.orderId !== requestedOrderId) continue;
        const name = normalizedName(order.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.fullName || "");
        if (name && name === wanted) candidates.push({ store, order });
      }
    }
    if (!candidates.length) return NextResponse.json({ error: "Kein offener eBay-Auftrag mit exakt passendem Empfängernamen gefunden. Tracking wurde nicht gespeichert." }, { status: 404 });
    if (candidates.length !== 1) return NextResponse.json({ error: "Mehrere offene eBay-Aufträge passen zum Empfänger. Tracking wurde nicht gespeichert, um eine falsche Bestellung zu vermeiden." }, { status: 409 });

    const { store, order } = candidates[0];
    const destination = order.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.contactAddress;
    const observedAt = new Date().toISOString();
    const { data, error } = await admin.from("supplier_order_tracking").insert({
      user_id: user.id, store_id: store.id, ebay_order_id: order.orderId, supplier: "amazon",
      supplier_order_id: supplierOrderId, recipient_name: recipientName, source_carrier: sourceCarrier || null,
      source_tracking_number: sourceTrackingNumber, amazon_share_url: shareTrackingUrl,
      estimated_delivery_date: estimatedDeliveryDate || null, estimated_delivery: estimatedDeliveryDate || null,
      recipient_zip: cleanText(body.recipientZip || destination?.postalCode, 20) || null,
      recipient_city: cleanText(body.recipientCity || destination?.city, 100) || null,
      delivery_status: deliveryStatus,
      status_history: [{ at: observedAt, status: deliveryStatus, description: STATUS_LABELS[deliveryStatus] }],
      last_synced_at: observedAt,
    }).select("public_tracking_number,delivery_status").single();
    if (error?.code === "23505") return NextResponse.json({ error: "Diese Amazon-Bestellung wurde bereits einem eBay-Auftrag zugeordnet." }, { status: 409 });
    if (error) throw new Error(error.message);
    return NextResponse.json({ synced: true, updated: false, ebayOrderId: order.orderId, storeId: store.id, trackingReference: data?.public_tracking_number, deliveryStatus: data?.delivery_status });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Lieferanten-Tracking konnte nicht synchronisiert werden." }, { status: 502 });
  }
}
