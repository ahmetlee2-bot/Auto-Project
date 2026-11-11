import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "../../../../../../lib/dashboard/server-auth";
import { ebayApiRequest } from "../../../../../../lib/ebay/multi-store";
import { repricerAdmin } from "../../../../../../lib/repricer/admin";

export const runtime = "nodejs";

type EbayOrderShipTo = {
  fullName?: string;
  contactAddress?: {
    addressLine1?: string;
    addressLine2?: string;
    postalCode?: string;
    city?: string;
    stateOrProvince?: string;
    countryCode?: string;
  };
  primaryPhone?: {
    phoneNumber?: string;
  };
  email?: string;
};

type EbayOrderLineItem = {
  lineItemId: string;
  sku?: string;
  legacyItemId?: string;
  title?: string;
  quantity?: number;
};

type EbayOrder = {
  orderId: string;
  orderFulfillmentStatus?: string;
  orderPaymentStatus?: string;
  creationDate?: string;
  lineItems?: EbayOrderLineItem[];
  fulfillmentStartInstructions?: Array<{ shippingStep?: { shipTo?: EbayOrderShipTo } }>;
};

export async function GET(_request: NextRequest, context: { params: Promise<{ storeId: string }> }) {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  const { storeId } = await context.params;
  const admin = repricerAdmin();
  const { data: store, error } = await admin
    .from("ebay_stores")
    .select("id,user_id,marketplace_id")
    .eq("id", storeId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !store) return NextResponse.json({ error: "eBay mağazası bulunamadı." }, { status: 404 });
  const params = new URLSearchParams({ limit: "50" });
  try {
    const body = await ebayApiRequest<{ orders?: EbayOrder[] }>(
      { id: store.id, user_id: store.user_id, marketplace_id: store.marketplace_id },
      `/sell/fulfillment/v1/order?${params}`,
      "GET",
    );
    const [trackingResult, supplierTrackingResult, trackedProductsResult, storeListingsResult] = await Promise.all([
      admin
        .from("order_tracking")
        .select("order_id,source_tracking_id,tracking_number,carrier_code,provider,status,last_error")
        .eq("user_id", user.id)
        .eq("store_id", storeId),
      admin
        .from("supplier_order_tracking")
        .select(
          "ebay_order_id,supplier_order_id,recipient_name,source_carrier,source_tracking_number,amazon_share_url,estimated_delivery_date,synced_at,public_tracking_number,delivery_status,last_synced_at,recipient_city,recipient_zip,estimated_delivery,buyer_notified_at",
        )
        .eq("user_id", user.id)
        .eq("store_id", storeId),
      admin
        .from("tracked_products")
        .select("amazon_asin,ebay_item_id,sku,title,supplier,source_url")
        .eq("user_id", user.id),
      admin
        .from("store_listings")
        .select("asin,ebay_item_id,ebay_sku,title")
        .eq("user_id", user.id)
        .eq("store_id", storeId),
    ]);

    if (trackingResult.error) throw new Error(trackingResult.error.message);
    if (supplierTrackingResult.error) throw new Error(supplierTrackingResult.error.message);

    const tracking = trackingResult.data || [];
    const supplierTracking = supplierTrackingResult.data || [];
    const trackedProducts = trackedProductsResult.data || [];
    const storeListings = storeListingsResult.data || [];

    const resolveSupplierForLine = (line: EbayOrderLineItem) => {
      const sku = (line.sku || "").trim();
      const itemId = (line.legacyItemId || "").trim();
      const lineTitle = (line.title || "").trim().toLowerCase();

      const fromStoreListing = storeListings.find(
        (sl) =>
          (itemId && sl.ebay_item_id === itemId) ||
          (sku && sl.ebay_sku === sku) ||
          (lineTitle && sl.title && sl.title.toLowerCase().slice(0, 35) === lineTitle.slice(0, 35)),
      );
      const fromTracked = trackedProducts.find(
        (tp) =>
          (itemId && tp.ebay_item_id === itemId) ||
          (sku && tp.sku === sku) ||
          (lineTitle && tp.title && tp.title.toLowerCase().slice(0, 35) === lineTitle.slice(0, 35)),
      );

      let asin = fromStoreListing?.asin || fromTracked?.amazon_asin || null;
      if (!asin && sku) {
        const matchAsin = sku.match(/(B0[A-Z0-9]{8}|JB-\d{6,15})/i);
        if (matchAsin) asin = matchAsin[1].toUpperCase();
      }

      const qty = Math.max(1, Number(line.quantity || 1));
      if (asin) {
        const isJoybuy = asin.toUpperCase().startsWith("JB-");
        const supplierUrl =
          fromTracked?.source_url ||
          (isJoybuy
            ? `https://www.joybuy.de/dg/${asin.replace(/^JB-/i, "")}`
            : `https://www.amazon.de/dp/${asin}`);
        const amazonCartUrl = isJoybuy
          ? null
          : `https://www.amazon.de/gp/aws/cart/add.html?ASIN.1=${encodeURIComponent(asin)}&Quantity.1=${qty}`;
        return {
          sourceAsin: asin,
          supplier: isJoybuy ? "joybuy_de" : "amazon_de",
          supplierUrl,
          amazonCartUrl,
        };
      }

      const fallbackSearchUrl = line.title
        ? `https://www.amazon.de/s?k=${encodeURIComponent(line.title.slice(0, 65))}`
        : "https://www.amazon.de";

      return {
        sourceAsin: null,
        supplier: "amazon_de",
        supplierUrl: fallbackSearchUrl,
        amazonCartUrl: null,
      };
    };

    return NextResponse.json(
      {
        orders: (body.orders || []).map((order) => {
          const trackingRow = tracking.find((row) => row.order_id === order.orderId) || null;
          const shipTo = order.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo;
          const addr = shipTo?.contactAddress;
          const enrichedLines = (order.lineItems || []).map((line) => ({
            ...line,
            ...resolveSupplierForLine(line),
          }));
          return {
            ...order,
            lineItems: enrichedLines,
            shippingAddress: shipTo
              ? {
                  fullName: shipTo.fullName || "",
                  addressLine1: addr?.addressLine1 || "",
                  addressLine2: addr?.addressLine2 || "",
                  postalCode: addr?.postalCode || "",
                  city: addr?.city || "",
                  countryCode: addr?.countryCode || "DE",
                  phoneNumber: shipTo.primaryPhone?.phoneNumber || "",
                }
              : null,
            orderFulfillmentStatus:
              trackingRow?.status === "submitted" || trackingRow?.status === "delivered"
                ? "FULFILLED"
                : order.orderFulfillmentStatus,
            tracking: trackingRow,
            supplierTracking: supplierTracking.find((row) => row.ebay_order_id === order.orderId) || null,
          };
        }),
        storeId,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "eBay siparişleri yüklenemedi." },
      { status: 502 },
    );
  }
}
