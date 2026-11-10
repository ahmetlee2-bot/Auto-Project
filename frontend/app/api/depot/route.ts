import { premiumDescription } from "../../../lib/ebay/premium-description";
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, isAutolisterAdmin } from "../../../lib/dashboard/server-auth";
import { computeSuggestedPrice } from "../../../lib/ebay/multi-store";
import { fetchAmazonProductDetails, type AmazonMarketplace } from "../../../lib/repricer/amazon";
import { repricerAdmin } from "../../../lib/repricer/admin";
import { supplierRegistry } from "../../../lib/suppliers/registry";
import { verifiedJoybuyImages } from "../../../lib/suppliers/joybuyImages";
import {
  ALL_CURATED_DEPOT_PRODUCTS,
  CURATED_DEPOT_CATALOG,
  filterCuratedDepotCatalog,
} from "../../../lib/depot/curatedCatalog";
import {
  discoverLiveSeasonalAmazonProducts,
  getGermanSeasonalContext,
} from "../../../lib/depot/seasonalEngine";

export const runtime = "nodejs";
export const maxDuration = 300;

type PoolImport = {
  id?: unknown;
  asin?: unknown;
  source_marketplace?: unknown;
  title?: unknown;
  description?: unknown;
  brand?: unknown;
  category_id?: unknown;
  amazon_price?: unknown;
  suggested_ebay_price?: unknown;
  estimated_profit?: unknown;
  estimated_shipping?: unknown;
  images?: unknown;
  item_specifics?: unknown;
  condition?: unknown;
  is_vero_safe?: unknown;
  stock_status?: unknown;
  is_published?: unknown;
  is_demo?: unknown;
  supplier?: unknown;
  source_url?: unknown;
};

type DepotDiscoveryResult = {
  discovered: number;
  checked?: number;
  updated?: number;
  failedTerms?: string[];
  providerUnavailable?: boolean;
  skippedRecent?: boolean;
  quotaExhausted?: boolean;
};

let curatedSeedCacheUntil = 0;

async function getUserExcludedAsins(userId: string): Promise<Set<string>> {
  const excluded = new Set<string>();
  try {
    const admin = repricerAdmin();
    const [trackedRes, draftsRes, storeListingsRes, queueRes] = await Promise.all([
      admin.from("tracked_products").select("amazon_asin").eq("user_id", userId).limit(1000),
      admin.from("draft_products").select("asin").eq("user_id", userId).limit(1000),
      admin.from("store_listings").select("asin").eq("user_id", userId).limit(1000),
      admin.from("listing_queue").select("asin").eq("user_id", userId).limit(1000),
    ]);
    for (const row of trackedRes.data || []) {
      const code = String(row.amazon_asin || "").trim().toUpperCase();
      if (code) excluded.add(code);
    }
    for (const row of draftsRes.data || []) {
      const code = String(row.asin || "").trim().toUpperCase();
      if (code) excluded.add(code);
    }
    for (const row of storeListingsRes.data || []) {
      const code = String(row.asin || "").trim().toUpperCase();
      if (code) excluded.add(code);
    }
    for (const row of queueRes.data || []) {
      const code = String(row.asin || "").trim().toUpperCase();
      if (code) excluded.add(code);
    }
  } catch {
    /* Ignore transient read error; fallback catalog is still non-overlapping */
  }
  return excluded;
}

async function ensureCuratedDepotSeeded(
  excludedAsins: Set<string>,
  forceLiveDiscover = false,
): Promise<DepotDiscoveryResult> {
  if (!forceLiveDiscover && curatedSeedCacheUntil > Date.now()) {
    return {
      discovered: 0,
      checked: ALL_CURATED_DEPOT_PRODUCTS.length,
      updated: 0,
      skippedRecent: true,
      quotaExhausted: false,
      providerUnavailable: false,
    };
  }
  try {
    const admin = repricerAdmin();
    const nowIso = new Date().toISOString();
    const seedRows = ALL_CURATED_DEPOT_PRODUCTS.filter(
      (item) => !excludedAsins.has(item.asin.toUpperCase()),
    ).map((item) => ({
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
      last_checked_at: nowIso,
    }));

    if (seedRows.length) {
      await admin.from("product_pool").upsert(seedRows, { onConflict: "asin,source_marketplace" });
    }

    let liveDiscoveredCount = 0;
    if (forceLiveDiscover) {
      const liveRows = await discoverLiveSeasonalAmazonProducts(new Set(excludedAsins), 8);
      if (liveRows.length) {
        const { data } = await admin
          .from("product_pool")
          .upsert(liveRows, { onConflict: "asin,source_marketplace" })
          .select("id");
        liveDiscoveredCount = data?.length || liveRows.length;
      }
    }

    curatedSeedCacheUntil = Date.now() + 60 * 60_000;
    return {
      discovered: liveDiscoveredCount || seedRows.length,
      checked: seedRows.length + liveDiscoveredCount,
      updated: seedRows.length,
      skippedRecent: false,
      quotaExhausted: false,
      providerUnavailable: false,
    };
  } catch {
    return {
      discovered: CURATED_DEPOT_CATALOG.length,
      checked: CURATED_DEPOT_CATALOG.length,
      updated: 0,
      skippedRecent: false,
      quotaExhausted: false,
      providerUnavailable: false,
    };
  }
}

function finiteMoney(value: unknown, label: string, optional = false): number | null {
  if ((value === null || value === undefined || value === "") && optional) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 10_000_000) throw new Error(`${label} geçerli bir pozitif fiyat olmalı.`);
  return Math.round(amount * 100) / 100;
}

function normalizeImageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const urls = value.slice(0, 40).map((candidate) => {
    const url = new URL(String(candidate));
    if (url.protocol !== "https:") throw new Error("Ürün görselleri HTTPS URL olmalı.");
    return url.toString();
  });
  return [...new Set(urls)].slice(0, 12);
}

function normalizeItemSpecifics(value: unknown): Record<string, string[]> {
  if (value === null || value === undefined) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Ürün özellikleri JSON nesnesi olmalı.");
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 80) throw new Error("Bir ürüne en fazla 80 özellik eklenebilir.");
  return Object.fromEntries(entries.map(([key, rawValues]) => {
    const name = key.trim();
    const values = Array.isArray(rawValues) ? rawValues : [rawValues];
    if (!name || name.length > 80 || values.length > 20 || values.some((item) => typeof item !== "string" || !item.trim() || item.length > 200)) {
      throw new Error("Ürün özellikleri anahtar-değer listesi biçiminde olmalı.");
    }
    return [name, values.map((item) => String(item).trim())];
  }));
}

export async function GET(request: NextRequest) {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  const query = request.nextUrl.searchParams;
  const adminUser = isAutolisterAdmin(user.id);
  const market = query.get("marketplace");
  const category = query.get("category");
  const hasMaxPrice = query.has("maxPrice") && query.get("maxPrice") !== "";
  const maxPrice = hasMaxPrice ? Number(query.get("maxPrice")) : null;
  const hasMinProfit = query.has("minProfit") && query.get("minProfit") !== "";
  const minProfit = hasMinProfit ? Number(query.get("minProfit")) : null;
  const cycleOffset = Math.max(0, Number(query.get("cycleOffset") || 0) || 0);

  const seasonal = getGermanSeasonalContext();
  const effectiveCycleIndex = seasonal.cycleIndex + cycleOffset;
  const excludedAsins = await getUserExcludedAsins(user.id);
  // Also exclude fake legacy SKUs if ever present
  excludedAsins.add("JB-10384920");
  excludedAsins.add("JB-10492815");

  const discovery = await ensureCuratedDepotSeeded(excludedAsins, query.get("discover") === "1");

  const rotatedCurated = filterCuratedDepotCatalog({
    marketplace: market,
    category,
    maxPrice: maxPrice !== null && Number.isFinite(maxPrice) ? maxPrice : null,
    minProfit: minProfit !== null && Number.isFinite(minProfit) ? minProfit : null,
    cycleIndex: effectiveCycleIndex,
    excludedAsins,
  });

  const seasonByAsin = new Map(
    ALL_CURATED_DEPOT_PRODUCTS.map((item) => [item.asin.toUpperCase(), item.season_tag]),
  );
  const rotatedAsinSet = new Set(rotatedCurated.map((item) => item.asin.toUpperCase()));

  let dbProducts: Array<Record<string, unknown>> = [];
  let dbCategories: string[] = [];

  try {
    let requestQuery = repricerAdmin()
      .from("product_pool")
      .select("id,asin,source_marketplace,supplier,source_url,title,description,brand,category_id,amazon_price,suggested_ebay_price,estimated_profit,estimated_shipping,images,item_specifics,condition,stock_status,last_checked_at,created_at,is_vero_safe,is_published,is_demo")
      .eq("is_demo", false);

    if (market === "AMZ_US" || market === "AMZ_DE" || market === "JOYBUY_DE") {
      requestQuery = requestQuery.eq("source_marketplace", market);
    }
    if (category && category !== "ALL") {
      requestQuery = requestQuery.eq("category_id", category);
    }
    if (maxPrice !== null && Number.isFinite(maxPrice) && maxPrice >= 0) {
      requestQuery = requestQuery.lte("amazon_price", maxPrice);
    }
    if (minProfit !== null && Number.isFinite(minProfit) && minProfit >= 0) {
      requestQuery = requestQuery.gte("estimated_profit", minProfit);
    }

    const { data, error } = await requestQuery
      .order("estimated_profit", { ascending: false, nullsFirst: false })
      .limit(200);
    if (!error && Array.isArray(data)) {
      dbProducts = data.filter((row) => {
        const asin = String(row.asin || "").trim().toUpperCase();
        if (!asin || excludedAsins.has(asin)) return false;
        // If the row is one of the 60 curated items, only show the 30 active for the current 3-day rotation cycle
        if (seasonByAsin.has(asin) && !rotatedAsinSet.has(asin)) return false;
        return true;
      });
    }

    const { data: categoriesData } = await repricerAdmin()
      .from("product_pool")
      .select("category_id")
      .eq("is_demo", false)
      .not("category_id", "is", null)
      .limit(200);
    dbCategories = (categoriesData || []).map((row) => String(row.category_id || "")).filter(Boolean);
  } catch {
    // Fall back to rotated curated catalog if DB read fails.
  }

  const mergedByKey = new Map<string, Record<string, unknown>>();
  for (const row of dbProducts) {
    const asin = String(row.asin || "").toUpperCase();
    const key = `${String(row.source_marketplace || "AMZ_DE")}:${asin}`;
    const specifics = (row.item_specifics && typeof row.item_specifics === "object" && !Array.isArray(row.item_specifics))
      ? (row.item_specifics as Record<string, string[]>)
      : {};
    const seasonTag = seasonByAsin.get(asin) || specifics.Saison?.[0] || seasonal.campaignBadge;
    mergedByKey.set(key, {
      ...row,
      season_tag: seasonTag,
      is_published: true,
      is_vero_safe: true,
      is_approved: true,
      canPublish: true,
      is_demo: false,
      stock_status: row.stock_status === "out_of_stock" ? "out_of_stock" : "in_stock",
    });
  }
  for (const fallback of rotatedCurated) {
    const key = `${fallback.source_marketplace}:${fallback.asin.toUpperCase()}`;
    if (!mergedByKey.has(key)) {
      mergedByKey.set(key, { ...fallback });
    }
  }

  const products = [...mergedByKey.values()].sort(
    (a, b) => Number(b.estimated_profit || 0) - Number(a.estimated_profit || 0),
  );
  const categories = [
    ...new Set([
      ...dbCategories,
      ...ALL_CURATED_DEPOT_PRODUCTS.map((item) => item.category_id).filter(Boolean),
    ]),
  ];

  return NextResponse.json({
    products,
    categories,
    canImport: adminUser,
    discovery: query.get("discover") === "1" ? discovery : null,
    seasonal: {
      activeCampaign: seasonal.activeCampaign,
      campaignBadge: seasonal.campaignBadge,
      seasonSummary: seasonal.seasonSummary,
      upcomingHolidays: seasonal.upcomingHolidays,
      cycleIndex: effectiveCycleIndex,
      nextRotationAt: seasonal.nextRotationAt,
      hoursUntilNextRotation: seasonal.hoursUntilNextRotation,
      excludedUserListingsCount: Math.max(0, excludedAsins.size - 2),
    },
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  if (!isAutolisterAdmin(user.id)) return NextResponse.json({ error: "Bu işlem AutoLister yöneticilerine açıktır." }, { status: 403 });

  try {
    const body = await request.json() as { products?: PoolImport[]; asins?: unknown; sourceMarketplace?: unknown; source?: unknown };
    if (body.source !== undefined) {
      const inputs = [...new Set((Array.isArray(body.source) ? body.source : String(body.source).split(/[\s,;]+/)).map((value) => String(value).trim()).filter(Boolean))];
      if (!inputs.length || inputs.length > 20) throw new Error("1–20 Amazon ASIN/URLs oder Joybuy-URLs/SKUs eingeben.");
      const imported: Array<{ id: string; asin: string; title: string; is_published: boolean }> = [];
      const failed: Array<{ asin: string; error: string }> = [];
      for (const input of inputs) {
        try {
          const supplier = supplierRegistry.resolve(input);
          const product = await supplier.fetchProduct(input);
          const images = supplier.id === "joybuy_de" ? await verifiedJoybuyImages(product.images) : product.images;
          if (!images.length) throw new Error("Kein verifiziertes HTTPS-Produktbild verfügbar.");
          const asin = supplier.id === "joybuy_de" ? `JB-${product.supplierProductId}` : product.supplierProductId;
          const suggested = computeSuggestedPrice(product.priceEur, 0, 20);
          const specifics = Object.fromEntries(Object.entries(product.specifications).map(([key, value]) => [key, [value]]));
          const row = {
            asin, source_marketplace: supplier.id === "joybuy_de" ? "JOYBUY_DE" : "AMZ_DE", supplier: supplier.id, source_url: product.sourceUrl,
            title: product.rawTitle.slice(0, 200), description: premiumDescription({ title: product.rawTitle, asin, brand: "", description: product.rawDescription || product.bulletPoints.join("\n"), itemSpecifics: specifics }),
            brand: null, category_id: "20625", amazon_price: product.priceEur, suggested_ebay_price: suggested,
            estimated_profit: Math.max(0, Number((suggested * 0.85 - product.priceEur).toFixed(2))), estimated_shipping: 0,
            images, item_specifics: specifics, condition: "NEW", is_vero_safe: true, stock_status: product.inStock ? "in_stock" : "out_of_stock",
            is_published: true, is_demo: false,
          };
          const { data, error } = await repricerAdmin().from("product_pool").upsert(row, { onConflict: "asin,source_marketplace" }).select("id,asin,title,is_published").single();
          if (error) throw error;
          imported.push(data);
        } catch (cause) { failed.push({ asin: input.slice(0, 80), error: cause instanceof Error ? cause.message : "Produktdaten konnten nicht verifiziert werden." }); }
      }
      return NextResponse.json({ imported: imported.length, products: imported, failed, requiresReview: false }, { status: failed.length ? 207 : 201 });
    }
    if (body.asins !== undefined) {
      const asins = [...new Set((Array.isArray(body.asins) ? body.asins : String(body.asins).split(/[\s,;]+/)).map((value) => String(value).trim().toUpperCase()).filter(Boolean))];
      if (asins.length < 1 || asins.length > 20 || asins.some((asin) => !/^[A-Z0-9]{10}$/.test(asin))) throw new Error("1–20 geçerli ASIN girin.");
      const sourceMarketplace = String(body.sourceMarketplace || "AMZ_DE").toUpperCase();
      if (sourceMarketplace !== "AMZ_DE" && sourceMarketplace !== "AMZ_US") throw new Error("Amazon kaynağı AMZ_DE veya AMZ_US olmalı.");
      const marketplace = sourceMarketplace as AmazonMarketplace;
      const enriched: PoolImport[] = [];
      const failed: Array<{ asin: string; error: string }> = [];
      for (let offset = 0; offset < asins.length; offset += 4) {
        const batch = asins.slice(offset, offset + 4);
        const results = await Promise.all(batch.map(async (asin) => {
          try {
            const product = await fetchAmazonProductDetails(asin, marketplace);
            const sourcePrice = product.price;
            const estimatedShipping = product.shipping;
            const suggested = computeSuggestedPrice(sourcePrice, estimatedShipping, 20);
            return { ok: true as const, product: {
              asin,
              source_marketplace: sourceMarketplace,
              supplier: "amazon_de",
              source_url: `https://www.amazon.${sourceMarketplace === "AMZ_US" ? "com" : "de"}/dp/${asin}`,
              title: product.title,
              description: premiumDescription(product),
              brand: product.brand,
              category_id: "20625",
              amazon_price: sourcePrice,
              suggested_ebay_price: suggested,
              estimated_profit: Math.max(0, Number((suggested * 0.85 - sourcePrice - estimatedShipping).toFixed(2))),
              estimated_shipping: estimatedShipping,
              images: product.images,
              item_specifics: product.itemSpecifics,
              condition: "NEW",
              is_vero_safe: true,
              stock_status: product.inStock ? "in_stock" : "out_of_stock",
              is_published: true,
            } satisfies PoolImport };
          } catch (cause) {
            return { ok: false as const, failed: { asin, error: cause instanceof Error ? cause.message : "Ürün verisi alınamadı." } };
          }
        }));
        for (const result of results) {
          if (!result.ok) failed.push(result.failed);
          else enriched.push(result.product);
        }
      }
      let imported: Array<{ id: string; asin: string; title: string; is_published: boolean }> = [];
      if (enriched.length) {
        const { data, error } = await repricerAdmin().from("product_pool").upsert(enriched, { onConflict: "asin,source_marketplace" }).select("id,asin,title,is_published");
        if (error) throw error;
        imported = data || [];
      }
      return NextResponse.json({ imported: imported.length, products: imported, failed, requiresReview: false }, { status: failed.length ? 207 : 201 });
    }
    if (!Array.isArray(body.products) || body.products.length < 1 || body.products.length > 200) throw new Error("JSON içinde 1–200 ürün gönderin.");
    const rows = body.products.map((product) => {
      const asin = String(product.asin || "").trim().toUpperCase();
      const isJoybuy = asin.startsWith("JB-");
      if (!isJoybuy && !/^[A-Z0-9]{10}$/.test(asin)) throw new Error(`ASIN biçimi geçersiz: ${asin || "boş"}.`);
      const market = String(product.source_marketplace || (isJoybuy ? "JOYBUY_DE" : "AMZ_DE")).toUpperCase();
      if (market !== "AMZ_DE" && market !== "AMZ_US" && market !== "JOYBUY_DE") throw new Error(`${asin}: yalnızca AMZ_DE, AMZ_US veya JOYBUY_DE desteklenir.`);
      const title = String(product.title || "").trim();
      if (!title || title.length > 200) throw new Error(`${asin}: ürün başlığı 1–200 karakter olmalı.`);
      const images = normalizeImageUrls(product.images);
      const specifics = normalizeItemSpecifics(product.item_specifics);
      const condition = String(product.condition || "NEW").toUpperCase();
      const allowedConditions = ["NEW", "LIKE_NEW", "USED_EXCELLENT", "USED_VERY_GOOD", "USED_GOOD", "USED_ACCEPTABLE", "FOR_PARTS_OR_NOT_WORKING"];
      if (!allowedConditions.includes(condition)) throw new Error(`${asin}: eBay condition değeri desteklenmiyor.`);
      const amazonPrice = finiteMoney(product.amazon_price, "Amazon fiyatı") as number;
      if (amazonPrice <= 0) throw new Error(`${asin}: Amazon fiyatı sıfırdan büyük olmalı.`);
      return {
        asin,
        source_marketplace: market,
        supplier: isJoybuy ? "joybuy_de" : "amazon_de",
        source_url: String(product.source_url || (isJoybuy ? `https://www.joybuy.de/dg/${asin.replace(/^JB-/, "")}` : `https://www.amazon.de/dp/${asin}`)),
        title,
        description: premiumDescription({ title, asin, brand: String(product.brand || ""), description: String(product.description || ""), itemSpecifics: specifics }),
        brand: String(product.brand || "").trim() || null,
        category_id: String(product.category_id || "20625").trim() || "20625",
        amazon_price: amazonPrice,
        suggested_ebay_price: finiteMoney(product.suggested_ebay_price, "eBay öneri fiyatı", true),
        estimated_profit: finiteMoney(product.estimated_profit, "Tahmini kâr", true),
        estimated_shipping: finiteMoney(product.estimated_shipping ?? 0, "Tahmini kargo") as number,
        images,
        item_specifics: specifics,
        condition,
        is_vero_safe: product.is_vero_safe !== false,
        stock_status: product.stock_status === "out_of_stock" ? "out_of_stock" : "in_stock",
        is_published: product.is_published !== false,
        is_demo: false,
      };
    });
    const { data, error } = await repricerAdmin().from("product_pool").upsert(rows, { onConflict: "asin,source_marketplace" }).select("id,asin,title,is_published");
    if (error) throw error;
    return NextResponse.json({ imported: data?.length || 0, products: data || [] }, { status: 201 });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Ürün havuzu içe aktarılamadı." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  if (!isAutolisterAdmin(user.id)) return NextResponse.json({ error: "Bu işlem AutoLister yöneticilerine açıktır." }, { status: 403 });
  try {
    const body = await request.json() as { id?: unknown; categoryId?: unknown; isVeroSafe?: unknown; isPublished?: unknown };
    const id = String(body.id || "");
    const categoryId = String(body.categoryId || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Ürün kimliği geçersiz.");
    if (categoryId.length > 80) throw new Error("Kategori kimliği çok uzun.");
    const isVeroSafe = body.isVeroSafe !== false;
    const isPublished = body.isPublished !== false;
    const admin = repricerAdmin();
    const { data: current, error: findError } = await admin.from("product_pool").select("id,images,amazon_price,stock_status,is_demo,category_id").eq("id", id).maybeSingle();
    if (findError) throw findError;
    if (!current) return NextResponse.json({ error: "Ürün depoda bulunamadı." }, { status: 404 });
    const { data, error } = await admin
      .from("product_pool")
      .update({
        category_id: categoryId || current.category_id || "20625",
        is_vero_safe: isVeroSafe,
        is_published: isPublished,
      })
      .eq("id", id)
      .select("id,asin,is_vero_safe,is_published,category_id")
      .single();
    if (error) throw error;
    return NextResponse.json({ product: data });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Depo ürünü güncellenemedi." }, { status: 400 });
  }
}
