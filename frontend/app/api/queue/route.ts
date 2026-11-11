import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "../../../lib/dashboard/server-auth";
import { computeSuggestedPrice, marketplaceCurrency } from "../../../lib/ebay/multi-store";
import { calculateEffectiveMarginPercent } from "../../../lib/drafts/pricing";
import { repricerAdmin } from "../../../lib/repricer/admin";
import { ALL_CURATED_DEPOT_PRODUCTS } from "../../../lib/depot/curatedCatalog";
import { premiumDescription } from "../../../lib/ebay/premium-description";
import { enrichItemSpecificsWithGpsr } from "../../../lib/compliance/gpsrEngine";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  const storeId = request.nextUrl.searchParams.get("storeId");
  let query = repricerAdmin()
    .from("listing_queue")
    .select(
      "id,user_id,store_id,store_listing_id,pool_product_id,asin,custom_title,target_price,status,scheduled_for,ebay_item_id,error_message,processing_attempts,completed_at,created_at",
    )
    .eq("user_id", user.id);
  if (storeId && storeId !== "ALL_STORES") query = query.eq("store_id", storeId);
  const { data: items, error } = await query.order("scheduled_for", { ascending: true }).limit(300);
  if (error) return NextResponse.json({ error: "Listeleme kuyruğu yüklenemedi." }, { status: 500 });
  const storeIds = [...new Set((items || []).map((row) => row.store_id))];
  const productIds = [
    ...new Set((items || []).map((row) => row.pool_product_id).filter((value): value is string => Boolean(value))),
  ];
  const [storesResult, productsResult] = await Promise.all([
    storeIds.length
      ? repricerAdmin().from("ebay_stores").select("id,store_name,marketplace_id").eq("user_id", user.id).in("id", storeIds)
      : Promise.resolve({ data: [], error: null }),
    productIds.length
      ? repricerAdmin()
          .from("product_pool")
          .select("id,title,images,source_marketplace,source_url,amazon_price,estimated_profit")
          .in("id", productIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const stores = new Map((storesResult.data || []).map((store) => [store.id, store]));
  const products = new Map((productsResult.data || []).map((product) => [product.id, product]));
  return NextResponse.json(
    {
      items: (items || []).map((item) => {
        const prod = item.pool_product_id ? products.get(item.pool_product_id) || null : null;
        return {
          ...item,
          custom_title: item.custom_title || prod?.title || item.asin,
          store: stores.get(item.store_id) || null,
          product: prod,
        };
      }),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  try {
    const body = (await request.json()) as { storeIds?: unknown; productIds?: unknown };
    const storeIds = [...new Set((Array.isArray(body.storeIds) ? body.storeIds : []).map(String))];
    const productIds = [...new Set((Array.isArray(body.productIds) ? body.productIds : []).map(String))];
    if (!storeIds.length || storeIds.length > 20 || productIds.length < 1 || productIds.length > 100) {
      throw new Error("1–20 mağaza ve 1–100 ürün seçin.");
    }
    const admin = repricerAdmin();
    const { data: stores, error: storeError } = await admin
      .from("ebay_stores")
      .select(
        "id,user_id,marketplace_id,default_margin_percent,listing_interval_hours,daily_listing_limit,last_listed_at,status",
      )
      .eq("user_id", user.id)
      .in("id", storeIds);
    if (storeError) throw storeError;
    if (!stores || stores.length !== storeIds.length) throw new Error("Seçilen mağazalardan biri bu hesaba ait değil.");
    if (stores.some((store) => store.status !== "active")) {
      throw new Error("Duraklatılmış veya yeniden bağlanması gereken mağazaya ürün kuyruğa eklenemez.");
    }
    const matchedCurated = ALL_CURATED_DEPOT_PRODUCTS.filter((item) => productIds.includes(item.id));
    if (matchedCurated.length) {
      await admin.from("product_pool").upsert(
        matchedCurated.map((item) => ({
          id: item.id,
          asin: item.asin,
          source_marketplace: item.source_marketplace,
          supplier: item.supplier,
          source_url: item.source_url,
          title: item.title,
          description: item.description,
          brand: item.brand,
          category_id: item.category_id,
          amazon_price: item.amazon_price,
          suggested_ebay_price: item.suggested_ebay_price,
          estimated_profit: item.estimated_profit,
          estimated_shipping: item.estimated_shipping,
          images: item.images,
          item_specifics: item.item_specifics,
          condition: item.condition,
          stock_status: "in_stock",
          is_vero_safe: true,
          is_published: true,
          is_demo: false,
          last_checked_at: new Date().toISOString(),
        })),
        { onConflict: "asin,source_marketplace" },
      );
    }
    const { data: products, error: productsError } = await admin
      .from("product_pool")
      .select(
        "id,asin,title,description,brand,source_marketplace,supplier,source_url,amazon_price,suggested_ebay_price,estimated_shipping,category_id,images,item_specifics,is_vero_safe,is_published,stock_status,is_demo",
      )
      .in("id", productIds)
      .eq("is_demo", false);
    if (productsError) throw productsError;
    if (!products || products.length === 0) {
      throw new Error("Seçilen ürünlerden biri artık yayınlanabilir ve stokta görünmüyor.");
    }

    const queued: Array<{ storeId: string; asin: string; scheduledFor: string }> = [];
    const skipped: Array<{ storeId: string; asin: string; reason: string }> = [];
    let syncedToDrafts = 0;
    const now = Date.now();
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);

    // Also mirror queued products into draft_products (Overview / Taslaklar) so the user can see & edit them immediately
    const { data: existingDrafts } = await admin
      .from("draft_products")
      .select("id,asin")
      .eq("user_id", user.id)
      .in(
        "asin",
        products.map((p) => p.asin),
      )
      .in("status", ["draft", "publishing", "error"]);
    const existingDraftAsins = new Set((existingDrafts || []).map((d) => String(d.asin).toUpperCase()));
    const defaultMargin = Math.max(20, Number(stores[0]?.default_margin_percent || 20));

    for (const product of products) {
      if (!existingDraftAsins.has(String(product.asin).toUpperCase())) {
        const sourcePrice = Number(product.amazon_price) || 0;
        const shipping = Number(product.estimated_shipping || 0);
        const minMarginPrice = computeSuggestedPrice(sourcePrice, shipping, defaultMargin);
        const targetPrice = Math.max(Number(product.suggested_ebay_price || 0), minMarginPrice);
        const effectiveMargin =
          calculateEffectiveMarginPercent({ source_price: sourcePrice, shipping_cost: shipping }, targetPrice) ??
          defaultMargin;
        const sourceUrl =
          product.source_url ||
          (product.source_marketplace === "JOYBUY_DE"
            ? `https://www.joybuy.de/dg/${String(product.asin).replace(/^JB-/, "")}`
            : `https://www.amazon.de/dp/${product.asin}`);
        const specifics = enrichItemSpecificsWithGpsr(product.item_specifics || {}, {
          title: product.title,
          brand: product.brand,
          asin: product.asin,
          categoryId: product.category_id,
        });
        const descriptionHtml =
          product.description && product.description.includes("<div")
            ? product.description
            : premiumDescription({
                title: product.title,
                asin: product.asin,
                brand: product.brand,
                description: product.description || product.title,
                itemSpecifics: specifics,
              });

        const { error: draftErr } = await admin.from("draft_products").insert({
          user_id: user.id,
          asin: product.asin,
          supplier:
            product.supplier || (product.source_marketplace === "JOYBUY_DE" ? "joybuy_de" : "amazon_de"),
          source_url: sourceUrl,
          source_price: sourcePrice,
          manual_sale_price: null,
          profit_margin_percent: Math.max(defaultMargin, Math.round(effectiveMargin * 10) / 10),
          shipping_cost: shipping,
          target_price: targetPrice,
          title: String(product.title || product.asin).slice(0, 80),
          description_html: descriptionHtml,
          item_specifics: specifics,
          images: Array.isArray(product.images) ? product.images : [],
          apply_custom_frame: true,
          selected_category_id: product.category_id || "20710",
          status: "draft",
          updated_at: new Date().toISOString(),
        });
        if (!draftErr) {
          syncedToDrafts++;
          existingDraftAsins.add(String(product.asin).toUpperCase());
        }
      }
    }

    for (const store of stores) {
      const { data: existingListings, error: existingError } = await admin
        .from("store_listings")
        .select("id,asin,status")
        .eq("store_id", store.id)
        .in(
          "asin",
          products.map((product) => product.asin),
        );
      if (existingError) throw existingError;
      const existingByAsin = new Map((existingListings || []).map((listing) => [listing.asin, listing]));
      const { data: activeQueue, error: queueError } = await admin
        .from("listing_queue")
        .select("scheduled_for,status,completed_at")
        .eq("store_id", store.id)
        .in("status", ["pending", "processing", "completed"])
        .or(`scheduled_for.gte.${dayStart.toISOString()},completed_at.gte.${dayStart.toISOString()}`);
      if (queueError) throw queueError;
      const dailySlotsByDay = new Map<string, number>();
      for (const row of activeQueue || []) {
        const slotTime = row.status === "completed" && row.completed_at ? row.completed_at : row.scheduled_for;
        const slotDay = new Date(slotTime).toISOString().slice(0, 10);
        dailySlotsByDay.set(slotDay, (dailySlotsByDay.get(slotDay) || 0) + 1);
      }
      const { data: lastSchedule } = await admin
        .from("listing_queue")
        .select("scheduled_for")
        .eq("store_id", store.id)
        .in("status", ["pending", "processing"])
        .order("scheduled_for", { ascending: false })
        .limit(1)
        .maybeSingle();
      const intervalMs = Number(store.listing_interval_hours) * 3_600_000;
      let cursor = Math.max(
        now,
        lastSchedule ? new Date(lastSchedule.scheduled_for).getTime() + intervalMs : now,
        store.last_listed_at ? new Date(store.last_listed_at).getTime() + intervalMs : now,
      );

      for (const product of products) {
        const existing = existingByAsin.get(product.asin);
        if (existing && ["queued", "processing", "published"].includes(existing.status)) {
          skipped.push({
            storeId: store.id,
            asin: product.asin,
            reason: "Bu ürün bu mağazada zaten kuyrukta veya yayında.",
          });
          continue;
        }
        const sourceCurrency = product.source_marketplace === "AMZ_US" ? "USD" : "EUR";
        if (marketplaceCurrency(store.marketplace_id) !== sourceCurrency) {
          skipped.push({
            storeId: store.id,
            asin: product.asin,
            reason: `Fiyat para birimi ${sourceCurrency}; ${store.marketplace_id} için otomatik kur çevrimi yapılandırılmadı.`,
          });
          continue;
        }
        let scheduledDay = new Date(cursor).toISOString().slice(0, 10);
        while ((dailySlotsByDay.get(scheduledDay) || 0) >= Number(store.daily_listing_limit)) {
          const current = new Date(cursor);
          cursor = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + 1, 0, 15);
          scheduledDay = new Date(cursor).toISOString().slice(0, 10);
        }
        const margin = Math.max(20, Number(store.default_margin_percent || 20));
        const minStorePrice = computeSuggestedPrice(
          Number(product.amazon_price),
          Number(product.estimated_shipping || 0),
          margin,
        );
        const price = Math.max(Number(product.suggested_ebay_price || 0), minStorePrice);
        const scheduledFor = new Date(cursor).toISOString();
        const storeListingWrite = {
          user_id: user.id,
          store_id: store.id,
          pool_product_id: product.id,
          asin: product.asin,
          title: product.title,
          target_price: price,
          status: "queued",
          error_message: null,
        };
        let storeListingId: string;
        if (existing) {
          const { data: updated, error } = await admin
            .from("store_listings")
            .update(storeListingWrite)
            .eq("id", existing.id)
            .eq("user_id", user.id)
            .select("id")
            .single();
          if (error) throw error;
          storeListingId = updated.id;
        } else {
          const { data: inserted, error } = await admin
            .from("store_listings")
            .insert(storeListingWrite)
            .select("id")
            .single();
          if (error) {
            if (error.code === "23505") {
              skipped.push({
                storeId: store.id,
                asin: product.asin,
                reason: "Ürün aynı mağazaya eşzamanlı olarak kuyruğa eklendi.",
              });
              continue;
            }
            throw error;
          }
          storeListingId = inserted.id;
        }
        const { error: insertError } = await admin.from("listing_queue").insert({
          user_id: user.id,
          store_id: store.id,
          store_listing_id: storeListingId,
          pool_product_id: product.id,
          asin: product.asin,
          custom_title: String(product.title || product.asin).slice(0, 80),
          target_price: price,
          status: "pending",
          scheduled_for: scheduledFor,
        });
        if (insertError) {
          await admin
            .from("store_listings")
            .update({
              status: "failed",
              error_message:
                insertError.code === "23505"
                  ? "Ürün aynı mağazaya zaten kuyruğa alındı."
                  : "Kuyruk kaydı oluşturulamadı.",
            })
            .eq("id", storeListingId)
            .eq("user_id", user.id);
          if (insertError.code === "23505") {
            skipped.push({ storeId: store.id, asin: product.asin, reason: "Ürün aynı mağazaya zaten kuyruğa alındı." });
            continue;
          }
          throw insertError;
        }
        queued.push({ storeId: store.id, asin: product.asin, scheduledFor });
        dailySlotsByDay.set(scheduledDay, (dailySlotsByDay.get(scheduledDay) || 0) + 1);
        cursor += intervalMs;
      }
    }
    return NextResponse.json({ queued, skipped, syncedToDrafts }, { status: 201 });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Ürünler kuyruğa eklenemedi." },
      { status: 400 },
    );
  }
}
