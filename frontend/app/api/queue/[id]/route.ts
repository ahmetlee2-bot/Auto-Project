import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "../../../../lib/dashboard/server-auth";
import { publishPoolProduct, type EbayStoreCredentials } from "../../../../lib/ebay/multi-store";
import { repricerAdmin } from "../../../../lib/repricer/admin";
import { ALL_CURATED_DEPOT_PRODUCTS } from "../../../../lib/depot/curatedCatalog";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Kuyruk kimliği geçersiz." }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const admin = repricerAdmin();

  if (body.action === "retry") {
    const { data, error } = await admin
      .from("listing_queue")
      .update({ status: "pending", scheduled_for: new Date().toISOString(), error_message: null })
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("status", "failed")
      .select("id,store_listing_id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Kuyruk öğesi yeniden başlatılamadı." }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Yalnızca başarısız kuyruk öğeleri yeniden denenebilir." }, { status: 409 });
    if (data.store_listing_id) {
      await admin
        .from("store_listings")
        .update({ status: "queued", error_message: null })
        .eq("id", data.store_listing_id)
        .eq("user_id", user.id);
    }
    return NextResponse.json({ retried: true });
  }

  if (body.action === "publish_now") {
    const { data: queueRow, error: qError } = await admin
      .from("listing_queue")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .in("status", ["pending", "failed"])
      .maybeSingle();
    if (qError) return NextResponse.json({ error: "Kuyruk öğesi okunamadı." }, { status: 500 });
    if (!queueRow) return NextResponse.json({ error: "Kuyruk öğesi bulunamadı veya zaten yayınlandı." }, { status: 404 });

    const { data: storeRow, error: sError } = await admin
      .from("ebay_stores")
      .select("*")
      .eq("id", queueRow.store_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (sError || !storeRow) return NextResponse.json({ error: "eBay mağazası bulunamadı." }, { status: 404 });

    const { data: poolRow } = queueRow.pool_product_id
      ? await admin.from("product_pool").select("*").eq("id", queueRow.pool_product_id).maybeSingle()
      : { data: null };
    const curatedFallback = ALL_CURATED_DEPOT_PRODUCTS.find(
      (item) => item.id === queueRow.pool_product_id || item.asin === queueRow.asin,
    );
    const product = poolRow || curatedFallback;
    if (!product) {
      return NextResponse.json({ error: "Ürün bilgileri product_pool içinde bulunamadı." }, { status: 404 });
    }

    await admin
      .from("listing_queue")
      .update({
        status: "processing",
        processing_attempts: Number(queueRow.processing_attempts || 0) + 1,
        error_message: null,
      })
      .eq("id", id)
      .eq("user_id", user.id);

    try {
      const result = await publishPoolProduct({
        store: storeRow as EbayStoreCredentials,
        product: {
          asin: String(product.asin),
          title: String(queueRow.custom_title || product.title || product.asin),
          description: String(product.description || ""),
          category_id: String(product.category_id || process.env.EBAY_DEFAULT_CATEGORY_ID || "20710"),
          images: Array.isArray(product.images) ? product.images : [],
          item_specifics: (product.item_specifics as Record<string, string[]>) || {},
          condition: String(product.condition || "NEW"),
        },
        targetPrice: Number(queueRow.target_price),
      });

      const completedAt = new Date().toISOString();
      await admin
        .from("listing_queue")
        .update({
          status: "completed",
          ebay_item_id: result.ebayItemId,
          error_message: null,
          completed_at: completedAt,
        })
        .eq("id", id)
        .eq("user_id", user.id);

      if (queueRow.store_listing_id) {
        await admin
          .from("store_listings")
          .update({
            status: "published",
            ebay_sku: result.sku,
            ebay_offer_id: result.offerId,
            ebay_item_id: result.ebayItemId,
            error_message: null,
          })
          .eq("id", queueRow.store_listing_id)
          .eq("user_id", user.id);
      }

      await admin
        .from("draft_products")
        .update({
          status: "published",
          ebay_item_id: result.ebayItemId,
          updated_at: completedAt,
        })
        .eq("user_id", user.id)
        .eq("asin", queueRow.asin);

      return NextResponse.json({
        published: true,
        ebayItemId: result.ebayItemId,
        sku: result.sku,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message.slice(0, 1000) : "Anında yayınlama başarısız oldu.";
      await admin
        .from("listing_queue")
        .update({ status: "failed", error_message: message })
        .eq("id", id)
        .eq("user_id", user.id);
      if (queueRow.store_listing_id) {
        await admin
          .from("store_listings")
          .update({ status: "failed", error_message: message })
          .eq("id", queueRow.store_listing_id)
          .eq("user_id", user.id);
      }
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  return NextResponse.json({ error: "Desteklenmeyen kuyruk işlemi." }, { status: 400 });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  const { id } = await context.params;
  const admin = repricerAdmin();
  const { data, error } = await admin
    .from("listing_queue")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .select("store_listing_id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Kuyruk öğesi kaldırılamadı." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Yalnızca bekleyen kuyruğu iptal edebilirsiniz." }, { status: 409 });
  if (data.store_listing_id) {
    await admin
      .from("store_listings")
      .delete()
      .eq("id", data.store_listing_id)
      .eq("user_id", user.id)
      .eq("status", "queued");
  }
  return NextResponse.json({ deleted: true });
}
