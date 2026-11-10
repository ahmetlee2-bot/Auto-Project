import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { computeSuggestedPrice, ebayApiRequest, marketplaceCurrency, publishPoolProduct, type EbayStoreCredentials } from "../../../../lib/ebay/multi-store";
import { repricerAdmin } from "../../../../lib/repricer/admin";
import { drainDraftListingQueue } from "../../../../lib/drafts/listing-jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

type QueueRow = {
  id: string;
  user_id: string;
  store_id: string;
  store_listing_id: string | null;
  pool_product_id: string | null;
  asin: string;
  target_price: number;
  processing_attempts: number;
};

type PoolRow = {
  id: string;
  asin: string;
  title: string;
  description: string;
  category_id: string | null;
  images: string[];
  item_specifics: Record<string, string[]>;
  condition: string;
  amazon_price: number;
  estimated_shipping: number;
  suggested_ebay_price: number | null;
  is_vero_safe: boolean;
  is_published: boolean;
  is_demo: boolean;
  stock_status: string;
};

function validSecret(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || "";
  const received = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || request.headers.get("x-cron-secret") || "";
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return Boolean(expected) && left.length === right.length && timingSafeEqual(left, right);
}

function nextUtcDay(): string {
  const next = new Date();
  next.setUTCHours(24, 15, 0, 0);
  return next.toISOString();
}

async function createAutoQueue(admin: ReturnType<typeof repricerAdmin>, store: EbayStoreCredentials): Promise<void> {
  const { data: waiting } = await admin.from("listing_queue").select("id").eq("store_id", store.id).in("status", ["pending", "processing"]).limit(1);
  if (waiting?.length) return;
  const { data: alreadyListed } = await admin.from("store_listings").select("asin").eq("store_id", store.id);
  const existing = new Set((alreadyListed || []).map((row) => String(row.asin)));
  const { data: pool } = await admin.from("product_pool")
    .select("id,asin,title,source_marketplace,amazon_price,estimated_shipping")
    .eq("stock_status", "in_stock").eq("is_demo", false)
    .order("estimated_profit", { ascending: false, nullsFirst: false }).limit(100);
  const product = (pool || []).find((candidate) => !existing.has(candidate.asin)
    && marketplaceCurrency(store.marketplace_id) === (candidate.source_marketplace === "AMZ_US" ? "USD" : "EUR"));
  if (!product) return;

  const targetPrice = computeSuggestedPrice(Number(product.amazon_price), Number(product.estimated_shipping || 0), Number(store.default_margin_percent));
  const { data: listing, error: listingError } = await admin.from("store_listings").insert({
    user_id: store.user_id,
    store_id: store.id,
    pool_product_id: product.id,
    asin: product.asin,
    title: product.title,
    target_price: targetPrice,
    status: "queued",
  }).select("id").single();
  if (listingError) {
    if (listingError.code === "23505") return;
    throw listingError;
  }
  const earliest = store.last_listed_at
    ? new Date(store.last_listed_at).getTime() + Number(store.listing_interval_hours) * 3_600_000
    : Date.now();
  const scheduledFor = new Date(Math.max(Date.now(), earliest)).toISOString();
  const { error } = await admin.from("listing_queue").insert({
    user_id: store.user_id,
    store_id: store.id,
    store_listing_id: listing.id,
    pool_product_id: product.id,
    asin: product.asin,
    target_price: targetPrice,
    status: "pending",
    scheduled_for: scheduledFor,
  });
  if (error) {
    await admin.from("store_listings").delete().eq("id", listing.id).eq("status", "queued");
    if (error.code === "23505") return;
    throw error;
  }
}

async function processOneStore(admin: ReturnType<typeof repricerAdmin>, storeId: string): Promise<string> {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + 5 * 60_000).toISOString();
  const { data, error } = await admin.from("ebay_stores").update({ scheduler_lease_until: leaseUntil })
    .eq("id", storeId).eq("status", "active")
    .or(`scheduler_lease_until.is.null,scheduler_lease_until.lt.${now.toISOString()}`)
    .select("*").maybeSingle();
  if (error) throw error;
  if (!data) return "locked-or-inactive";
  const store = data as EbayStoreCredentials;

  try {
    const staleCutoff = new Date(now.getTime() - 15 * 60_000).toISOString();
    const { data: staleRows, error: staleError } = await admin.from("listing_queue").select("id,store_listing_id")
      .eq("store_id", store.id).eq("status", "processing").lt("updated_at", staleCutoff);
    if (staleError) throw staleError;
    if (staleRows?.length) {
      const staleIds = staleRows.map((row) => row.id);
      const listingIds = staleRows.map((row) => row.store_listing_id).filter((id): id is string => Boolean(id));
      await admin.from("listing_queue").update({ status: "pending", scheduled_for: now.toISOString(), error_message: "A previous worker stopped before completing this listing; it was safely requeued." }).in("id", staleIds);
      if (listingIds.length) await admin.from("store_listings").update({ status: "queued", error_message: null }).in("id", listingIds).eq("user_id", store.user_id);
    }
    const { data: pending } = await admin.from("listing_queue").select("id")
      .eq("store_id", store.id).eq("status", "pending").lte("scheduled_for", now.toISOString()).limit(1);
    if (!pending?.length && store.auto_lister_enabled && store.auto_pull_from_depot) {
      await createAutoQueue(admin, store);
    }

    const { data: queue, error: queueError } = await admin.from("listing_queue").select("*")
      .eq("store_id", store.id).eq("status", "pending").lte("scheduled_for", now.toISOString())
      .order("scheduled_for", { ascending: true }).limit(1).maybeSingle();
    if (queueError) throw queueError;
    if (!queue) return "nothing-due";

    const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
    const { count: dailyCount, error: countError } = await admin.from("listing_queue").select("id", { count: "exact", head: true })
      .eq("store_id", store.id).eq("status", "completed").gte("completed_at", dayStart.toISOString());
    if (countError) throw countError;
    if ((dailyCount || 0) >= Number(store.daily_listing_limit)) {
      await admin.from("listing_queue").update({ scheduled_for: nextUtcDay() }).eq("id", queue.id).eq("status", "pending");
      return "daily-limit-deferred";
    }
    const intervalEnd = store.last_listed_at
      ? new Date(store.last_listed_at).getTime() + Number(store.listing_interval_hours) * 3_600_000
      : 0;
    if (intervalEnd > now.getTime()) {
      await admin.from("listing_queue").update({ scheduled_for: new Date(intervalEnd).toISOString() }).eq("id", queue.id).eq("status", "pending");
      return "interval-deferred";
    }

    const claimedRow = queue as QueueRow;
    const { data: claimed, error: claimError } = await admin.from("listing_queue").update({ status: "processing", processing_attempts: Number(claimedRow.processing_attempts || 0) + 1, error_message: null })
      .eq("id", claimedRow.id).eq("status", "pending").select("*").maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return "queue-raced";
    if (claimedRow.store_listing_id) await admin.from("store_listings").update({ status: "processing", error_message: null }).eq("id", claimedRow.store_listing_id).eq("user_id", store.user_id);

    try {
      if (!claimedRow.pool_product_id) throw new Error("Kuyruk ürünü artık ürün havuzuna bağlı değil.");
      const { data: productRow, error: productError } = await admin.from("product_pool").select("*").eq("id", claimedRow.pool_product_id).maybeSingle();
      if (productError) throw productError;
      if (!productRow) throw new Error("Ürün depotunda bulunamadı.");
      const product = productRow as PoolRow;
      if (product.is_demo || product.stock_status === "out_of_stock") throw new Error("Ürün artık yayın koşullarını karşılamıyor; sıraya alınmadı.");
      const result = await publishPoolProduct({
        store,
        product: {
          asin: product.asin,
          title: product.title,
          description: product.description,
          category_id: product.category_id || process.env.EBAY_DEFAULT_CATEGORY_ID || null,
          images: Array.isArray(product.images) ? product.images : [],
          item_specifics: product.item_specifics || {},
          condition: product.condition || "NEW",
        },
        targetPrice: Number(claimed.target_price),
      });
      const completedAt = new Date().toISOString();
      const { error: updateQueueError } = await admin.from("listing_queue").update({ status: "completed", ebay_item_id: result.ebayItemId, error_message: null, completed_at: completedAt }).eq("id", claimed.id);
      if (updateQueueError) throw updateQueueError;
      if (claimed.store_listing_id) {
        const { error: listingUpdateError } = await admin.from("store_listings").update({ status: "published", ebay_sku: result.sku, ebay_offer_id: result.offerId, ebay_item_id: result.ebayItemId, error_message: null }).eq("id", claimed.store_listing_id).eq("user_id", store.user_id);
        if (listingUpdateError) throw listingUpdateError;
      }
      await admin.from("ebay_stores").update({ last_listed_at: completedAt }).eq("id", store.id);
      return `published:${result.ebayItemId}`;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message.slice(0, 1000) : "Yayınlama başarısız oldu.";
      await admin.from("listing_queue").update({ status: "failed", error_message: message }).eq("id", claimed.id);
      if (claimed.store_listing_id) await admin.from("store_listings").update({ status: "failed", error_message: message }).eq("id", claimed.store_listing_id).eq("user_id", store.user_id);
      return `failed:${message}`;
    }
  } finally {
    await admin.from("ebay_stores").update({ scheduler_lease_until: null }).eq("id", store.id);
  }
}

export async function POST(request: NextRequest) {
  if (!validSecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = repricerAdmin();
  let draftJobsProcessed = 0;
  try { draftJobsProcessed = (await drainDraftListingQueue(1)).processed; }
  catch (error) { console.error("Draft-listing cron worker failed:", error); }
  const now = new Date().toISOString();
  const [{ data: due, error: dueError }, { data: automatic, error: autoError }] = await Promise.all([
    admin.from("listing_queue").select("store_id").eq("status", "pending").lte("scheduled_for", now).order("scheduled_for", { ascending: true }).limit(1000),
    admin.from("ebay_stores").select("id").eq("status", "active").eq("auto_lister_enabled", true).eq("auto_pull_from_depot", true).limit(1000),
  ]);
  if (dueError || autoError) return NextResponse.json({ error: "Kuyruk mağazaları alınamadı." }, { status: 500 });
  const candidateIds = [...new Set([...(due || []).map((row) => row.store_id), ...(automatic || []).map((row) => row.id)])];
  if (!candidateIds.length) return NextResponse.json({ checkedStores: 0, draftJobsProcessed, results: [] });
  const { data: storeOrder, error: storeOrderError } = await admin.from("ebay_stores").select("id,updated_at").in("id", candidateIds);
  if (storeOrderError) return NextResponse.json({ error: "Kuyruk mağaza sırası alınamadı." }, { status: 500 });
  const storeIds = (storeOrder || []).sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)) || a.id.localeCompare(b.id)).map((store) => store.id);
  const results: Array<{ storeId: string; result: string }> = [];
  for (let offset = 0; offset < Math.min(storeIds.length, 100); offset += 4) {
    const batch = storeIds.slice(offset, offset + 4);
    const batchResults = await Promise.all(batch.map(async (storeId) => {
      try {
        return { storeId, result: await processOneStore(admin, storeId) };
      } catch (cause) {
        return { storeId, result: `error:${cause instanceof Error ? cause.message : "processing failed"}` };
      }
    }));
    results.push(...batchResults);
    // The cron endpoint is invoked every five minutes. Keep one run bounded so
    // the next scheduled invocation can pick up the remaining shops.
    if (results.length >= 4) break;
  }
  return NextResponse.json({ checkedStores: results.length, draftJobsProcessed, results });
}

export async function GET() {
  return NextResponse.json({ error: "Use POST with the configured CRON_SECRET." }, { status: 405, headers: { Allow: "POST" } });
}
