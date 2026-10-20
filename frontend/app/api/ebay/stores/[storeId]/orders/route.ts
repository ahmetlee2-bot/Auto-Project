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
  const params = new URLSearchParams({ limit: "50", filter: "orderfulfillmentstatus:{NOT_STARTED|IN_PROGRESS}" });
  try {
    const body = await ebayApiRequest<{ orders?: EbayOrder[] }>({ id: store.id, user_id: store.user_id, marketplace_id: store.marketplace_id }, `/sell/fulfillment/v1/order?${params}`, "GET");
    return NextResponse.json({ orders: body.orders || [], storeId }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "eBay siparişleri yüklenemedi." }, { status: 502 });
  }
}
