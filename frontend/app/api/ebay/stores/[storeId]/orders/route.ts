import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "../../../../../../lib/dashboard/server-auth";
import { ebayApiRequest } from "../../../../../../lib/ebay/multi-store";
import { repricerAdmin } from "../../../../../../lib/repricer/admin";

export const runtime = "nodejs";

type EbayOrder = {
  orderId: string;
  orderFulfillmentStatus?: string;
  orderPaymentStatus?: string;
  creationDate?: string;
  lineItems?: Array<{ lineItemId: string; title?: string; quantity?: number }>;
  fulfillmentStartInstructions?: Array<{ shippingStep?: { shipTo?: { fullName?: string } } }>;
};

export async function GET(request: NextRequest, context: { params: Promise<{ storeId: string }> }) {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  const { storeId } = await context.params;
  const { data: store, error } = await repricerAdmin().from("ebay_stores").select("id,user_id,marketplace_id")
    .eq("id", storeId).eq("user_id", user.id).maybeSingle();
  if (error || !store) return NextResponse.json({ error: "eBay mağazası bulunamadı." }, { status: 404 });
  const params = new URLSearchParams({ limit: "50" });
  try {
    const body = await ebayApiRequest<{ orders?: EbayOrder[] }>({ id: store.id, user_id: store.user_id, marketplace_id: store.marketplace_id }, `/sell/fulfillment/v1/order?${params}`, "GET");
    const admin = repricerAdmin();
    const { data: tracking, error: trackingError } = await admin.from("order_tracking").select("order_id,source_tracking_id,tracking_number,carrier_code,provider,status,last_error").eq("user_id", user.id).eq("store_id", storeId);
    if (trackingError) throw new Error(trackingError.message);
    const { data: supplierTracking, error: supplierTrackingError } = await admin.from("supplier_order_tracking")
      .select("ebay_order_id,supplier_order_id,recipient_name,source_carrier,source_tracking_number,amazon_share_url,estimated_delivery_date,synced_at")
      .eq("user_id", user.id).eq("store_id", storeId);
    if (supplierTrackingError) throw new Error(supplierTrackingError.message);
    return NextResponse.json({ orders: (body.orders || []).map(order => ({
      ...order,
      tracking: tracking?.find(row => row.order_id === order.orderId) || null,
      supplierTracking: supplierTracking?.find(row => row.ebay_order_id === order.orderId) || null,
    })), storeId }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "eBay siparişleri yüklenemedi." }, { status: 502 });
  }
}
