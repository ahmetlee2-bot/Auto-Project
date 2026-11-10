import { premiumDescription } from "../../../lib/ebay/premium-description";
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, isAutolisterAdmin } from "../../../lib/dashboard/server-auth";
import { computeSuggestedPrice } from "../../../lib/ebay/multi-store";
import { fetchAmazonProductDetails, type AmazonMarketplace } from "../../../lib/repricer/amazon";
import { repricerAdmin } from "../../../lib/repricer/admin";
import { supplierRegistry } from "../../../lib/suppliers/registry";
import { verifiedJoybuyImages } from "../../../lib/suppliers/joybuyImages";

export const runtime = "nodejs";
export const maxDuration = 300;

type PoolImport = {
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

const AMAZON_DISCOVERY_TERMS = ["3D Drucker Zubehör", "Haustier Zubehör", "Küche Haushalt", "Auto Zubehör", "Garten Werkzeuge", "Hobby Basteln Werkzeug"];
type AmazonDiscoveryResult = { discovered: number; checked?: number; updated?: number; failedTerms?: string[]; providerUnavailable?: boolean; skippedRecent?: boolean; quotaExhausted?: boolean };
let amazonDiscoveryCache: { expiresAt: number; result: AmazonDiscoveryResult } | null = null;
type SearchResult = { asin?: string; title?: string; image?: string; link?: string; price?: { value?: number | string; currency?: string }; product?: {
  title?: string; brand?: string; description?: string; main_image?: { link?: string } | string; images?: Array<{ link?: string }>;
  buybox_winner?: { price?: { value?: number | string; currency?: string }; shipping?: { value?: number | string }; availability?: { type?: string } };
  feature_bullets?: Array<{ text?: string }>; specifications?: Array<{ name?: string; value?: string }>;
}; };

async function discoverAmazonProducts() {
  if (amazonDiscoveryCache && amazonDiscoveryCache.expiresAt > Date.now()) return amazonDiscoveryCache.result;
  const cache = (result: AmazonDiscoveryResult) => {
    amazonDiscoveryCache = { expiresAt: Date.now() + 6 * 60 * 60_000, result };
    return result;
  };
  const apiKey = process.env.RAINFOREST_API_KEY?.trim();
  if (!apiKey) return cache({ discovered: 0, providerUnavailable: true });
  const admin = repricerAdmin();
  const freshSince = new Date(Date.now() - 6 * 60 * 60_000).toISOString();
  const { count: freshCount, error: freshError } = await admin.from("product_pool").select("id", { count: "exact", head: true })
    .eq("source_marketplace", "AMZ_DE").eq("is_demo", false).gte("last_checked_at", freshSince);
  if (freshError) throw freshError;
  if ((freshCount || 0) >= 30) return cache({ discovered: 0, checked: freshCount || 0, updated: 0, skippedRecent: true });
  const candidates = new Map<string, PoolImport>();
  const failedTerms: string[] = [];
  let quotaExhausted = false;
  for (const searchTerm of AMAZON_DISCOVERY_TERMS) {
    try {
      const url = new URL("https://api.rainforestapi.com/request");
      url.search = new URLSearchParams({ api_key: apiKey, type: "search", amazon_domain: "amazon.de", search_term: searchTerm,
        sort_by: "bestseller_rankings", number_of_results: "10", include_products_count: "10", exclude_sponsored: "true",
        fields: "search_results.asin,search_results.title,search_results.link,search_results.image,search_results.price,search_results.product.title,search_results.product.brand,search_results.product.description,search_results.product.main_image,search_results.product.images,search_results.product.buybox_winner,search_results.product.feature_bullets,search_results.product.specifications" }).toString();
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(45_000) });
      const body = await response.json().catch(() => null) as { request_info?: { success?: boolean; message?: string }; search_results?: SearchResult[] } | null;
      if (!response.ok || !body?.request_info?.success) {
        const message = body?.request_info?.message || `HTTP ${response.status}`;
        if (response.status === 402 || /(?:free\s+)?credits?\s+(?:are\s+)?(?:used\s+up|exhausted)|quota\s+(?:exceeded|exhausted)|rate\s+limit/i.test(message)) {
          quotaExhausted = true;
          failedTerms.push(searchTerm);
          break;
        }
        throw new Error(message);
      }
      for (const result of body.search_results || []) {
        const asin = String(result.asin || "").toUpperCase();
        const detail = result.product;
        const rawPrice = Number(detail?.buybox_winner?.price?.value ?? result.price?.value);
        const currency = String(detail?.buybox_winner?.price?.currency ?? result.price?.currency ?? "EUR").toUpperCase();
        const availability = String(detail?.buybox_winner?.availability?.type || "");
        const inStock = /(?:^|\/)(?:InStock|LimitedAvailability|OnlineOnly)$/i.test(availability) || /in_stock|available/i.test(availability);
        const main = typeof detail?.main_image === "string" ? detail.main_image : detail?.main_image?.link;
        const images = [...new Set([main, ...(detail?.images || []).map((image) => image.link), result.image].filter((image): image is string => typeof image === "string" && image.startsWith("https://")))].slice(0, 12);
        if (!/^[A-Z0-9]{10}$/.test(asin) || !detail?.title || !Number.isFinite(rawPrice) || rawPrice <= 0 || currency !== "EUR" || !inStock || !images.length) continue;
        const shipping = Math.max(0, Number(detail.buybox_winner?.shipping?.value) || 0);
        const suggested = computeSuggestedPrice(rawPrice, shipping, 20);
        const profit = Number((suggested * 0.85 - rawPrice - shipping).toFixed(2));
        if (profit < 5) continue;
        const specifics = Object.fromEntries((detail.specifications || []).filter((item) => item.name && item.value).slice(0, 50).map((item) => [String(item.name).slice(0, 80), [String(item.value).slice(0, 200)]]));
        candidates.set(asin, {
          asin, source_marketplace: "AMZ_DE", supplier: "amazon_de", source_url: `https://www.amazon.de/dp/${asin}`,
          title: String(detail.title).trim().slice(0, 200), description: premiumDescription({ title: detail.title, asin, brand: detail.brand || "", description: detail.description || (detail.feature_bullets || []).map((bullet) => bullet.text || "").join("\n"), itemSpecifics: specifics }),
          brand: detail.brand || null, category_id: null, amazon_price: rawPrice, suggested_ebay_price: suggested, estimated_profit: profit,
          estimated_shipping: shipping, images, item_specifics: specifics, condition: "NEW", is_vero_safe: false, stock_status: "in_stock", is_published: false, is_demo: false,
        });
      }
    } catch { failedTerms.push(searchTerm); }
  }
  if (!candidates.size) return cache({ discovered: 0, checked: 0, failedTerms, quotaExhausted });
  const rows = [...candidates.values()];
  const { data: existing, error: existingError } = await admin.from("product_pool").select("asin").eq("source_marketplace", "AMZ_DE").in("asin", rows.map((row) => String(row.asin)));
  if (existingError) throw existingError;
  const existingAsins = new Set((existing || []).map((row) => String(row.asin)));
  const insertedRows = rows.filter((row) => !existingAsins.has(String(row.asin))).map((row) => ({ ...row, last_checked_at: new Date().toISOString() }));
  if (insertedRows.length) {
    const { error } = await admin.from("product_pool").insert(insertedRows);
    if (error) throw error;
  }
  const refreshes = rows.filter((row) => existingAsins.has(String(row.asin))).map((row) => admin.from("product_pool")
    .update({ title: row.title, description: row.description, brand: row.brand, amazon_price: row.amazon_price,
      suggested_ebay_price: row.suggested_ebay_price, estimated_profit: row.estimated_profit, estimated_shipping: row.estimated_shipping,
      images: row.images, item_specifics: row.item_specifics, stock_status: row.stock_status, last_checked_at: new Date().toISOString() })
    .eq("asin", String(row.asin)).eq("source_marketplace", "AMZ_DE"));
  const refreshed = await Promise.all(refreshes);
  if (refreshed.some((result) => result.error)) throw refreshed.find((result) => result.error)?.error;
  return cache({ discovered: insertedRows.length, checked: rows.length, updated: refreshes.length, failedTerms, quotaExhausted });
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
  const includeReview = adminUser && query.get("includeReview") === "1";
  let discovery: Awaited<ReturnType<typeof discoverAmazonProducts>> | null = null;
  const market = query.get("marketplace");
  if (includeReview && query.get("discover") === "1" && (!market || market === "AMZ_DE")) {
    try { discovery = await discoverAmazonProducts(); }
    catch { discovery = { discovered: 0, providerUnavailable: false }; }
  }
  let requestQuery = repricerAdmin().from("product_pool").select("id,asin,source_marketplace,supplier,source_url,title,description,brand,category_id,amazon_price,suggested_ebay_price,estimated_profit,estimated_shipping,images,item_specifics,condition,stock_status,last_checked_at,created_at,is_vero_safe,is_published,is_demo")
  requestQuery = requestQuery.eq("is_demo", false);
  if (!includeReview) requestQuery = requestQuery.eq("is_published", true).eq("is_vero_safe", true).eq("stock_status", "in_stock");
  if (market === "AMZ_US" || market === "AMZ_DE" || market === "JOYBUY_DE") requestQuery = requestQuery.eq("source_marketplace", market);
  const category = query.get("category");
  if (category) requestQuery = requestQuery.eq("category_id", category);
  const maxPrice = Number(query.get("maxPrice"));
  if (query.has("maxPrice") && Number.isFinite(maxPrice) && maxPrice >= 0) requestQuery = requestQuery.lte("amazon_price", maxPrice);
  const minProfit = Number(query.get("minProfit"));
  if (query.has("minProfit") && Number.isFinite(minProfit) && minProfit >= 0) requestQuery = requestQuery.gte("estimated_profit", minProfit);
  const { data, error } = await requestQuery.order("estimated_profit", { ascending: false, nullsFirst: false }).limit(200);
  if (error) return NextResponse.json({ error: "Produktdepot konnte nicht geladen werden." }, { status: 500 });
  let categoryQuery = repricerAdmin().from("product_pool").select("category_id").not("category_id", "is", null).limit(200);
  categoryQuery = categoryQuery.eq("is_demo", false);
  if (!includeReview) categoryQuery = categoryQuery.eq("is_published", true);
  const { data: categories } = await categoryQuery;
  return NextResponse.json({
    products: data || [],
    categories: [...new Set((categories || []).map((row) => row.category_id).filter(Boolean))],
    canImport: adminUser,
    discovery,
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
            brand: null, category_id: null, amazon_price: product.priceEur, suggested_ebay_price: suggested,
            estimated_profit: Math.max(0, Number((suggested * 0.85 - product.priceEur).toFixed(2))), estimated_shipping: 0,
            images, item_specifics: specifics, condition: "NEW", is_vero_safe: false, stock_status: product.inStock ? "in_stock" : "out_of_stock",
            is_published: false, is_demo: false,
          };
          const { data, error } = await repricerAdmin().from("product_pool").upsert(row, { onConflict: "asin,source_marketplace" }).select("id,asin,title,is_published").single();
          if (error) throw error;
          imported.push(data);
        } catch (cause) { failed.push({ asin: input.slice(0, 80), error: cause instanceof Error ? cause.message : "Produktdaten konnten nicht verifiziert werden." }); }
      }
      return NextResponse.json({ imported: imported.length, products: imported, failed, requiresReview: true }, { status: failed.length ? 207 : 201 });
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
              title: product.title,
              description: premiumDescription(product),
              brand: product.brand,
              category_id: null,
              amazon_price: sourcePrice,
              suggested_ebay_price: suggested,
              estimated_profit: Math.max(0, Number((suggested * 0.85 - sourcePrice - estimatedShipping).toFixed(2))),
              estimated_shipping: estimatedShipping,
              images: product.images,
              item_specifics: product.itemSpecifics,
              condition: "NEW",
              is_vero_safe: false,
              stock_status: product.inStock ? "in_stock" : "out_of_stock",
              is_published: false,
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
      return NextResponse.json({ imported: imported.length, products: imported, failed, requiresReview: true }, { status: failed.length ? 207 : 201 });
    }
    if (!Array.isArray(body.products) || body.products.length < 1 || body.products.length > 200) throw new Error("JSON içinde 1–200 ürün gönderin.");
    const rows = body.products.map((product) => {
      const asin = String(product.asin || "").trim().toUpperCase();
      if (!/^[A-Z0-9]{10}$/.test(asin)) throw new Error(`ASIN biçimi geçersiz: ${asin || "boş"}.`);
      const market = String(product.source_marketplace || "AMZ_DE").toUpperCase();
      if (market !== "AMZ_DE" && market !== "AMZ_US") throw new Error(`${asin}: yalnızca AMZ_DE veya AMZ_US desteklenir.`);
      const title = String(product.title || "").trim();
      if (!title || title.length > 200) throw new Error(`${asin}: ürün başlığı 1–200 karakter olmalı.`);
      if (product.is_demo === true && product.is_published === true) throw new Error(`${asin}: Demo-Datensätze können nicht veröffentlicht werden.`);
      const images = normalizeImageUrls(product.images);
      if (product.is_published === true && (!product.is_vero_safe || images.length === 0 || !String(product.category_id || "").trim())) {
        throw new Error(`${asin}: yayınlamak için yönetici ürün uygunluğunu onaylamalı, görsel ve kategori eklemeli.`);
      }
      const specifics = normalizeItemSpecifics(product.item_specifics);
      const condition = String(product.condition || "NEW").toUpperCase();
      const allowedConditions = ["NEW", "LIKE_NEW", "USED_EXCELLENT", "USED_VERY_GOOD", "USED_GOOD", "USED_ACCEPTABLE", "FOR_PARTS_OR_NOT_WORKING"];
      if (!allowedConditions.includes(condition)) throw new Error(`${asin}: eBay condition değeri desteklenmiyor.`);
      const amazonPrice = finiteMoney(product.amazon_price, "Amazon fiyatı") as number;
      if (amazonPrice <= 0) throw new Error(`${asin}: Amazon fiyatı sıfırdan büyük olmalı.`);
      return {
        asin,
        source_marketplace: market,
        title,
        description: premiumDescription({ title, asin, brand: String(product.brand || ""), description: String(product.description || ""), itemSpecifics: specifics }),
        brand: String(product.brand || "").trim() || null,
        category_id: String(product.category_id || "").trim() || null,
        amazon_price: amazonPrice,
        suggested_ebay_price: finiteMoney(product.suggested_ebay_price, "eBay öneri fiyatı", true),
        estimated_profit: finiteMoney(product.estimated_profit, "Tahmini kâr", true),
        estimated_shipping: finiteMoney(product.estimated_shipping ?? 0, "Tahmini kargo") as number,
        images,
        item_specifics: specifics,
        condition,
        is_vero_safe: product.is_vero_safe === true,
        stock_status: product.stock_status === "out_of_stock" ? "out_of_stock" : "in_stock",
        is_published: product.is_published === true && product.is_vero_safe === true,
        is_demo: product.is_demo === true,
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
    const isVeroSafe = body.isVeroSafe === true;
    const isPublished = body.isPublished === true && isVeroSafe;
    const admin = repricerAdmin();
    const { data: current, error: findError } = await admin.from("product_pool").select("id,images,amazon_price,stock_status,is_demo").eq("id", id).maybeSingle();
    if (findError) throw findError;
    if (!current) return NextResponse.json({ error: "Ürün depoda bulunamadı." }, { status: 404 });
    if (current.is_demo && (isPublished || isVeroSafe)) throw new Error("Demo-Datensätze sind nur zur Vorschau bestimmt und können nicht freigegeben werden.");
    if (isPublished && (!categoryId || !Array.isArray(current.images) || current.images.length === 0 || Number(current.amazon_price) <= 0 || current.stock_status !== "in_stock")) {
      throw new Error("Yayınlamak için stokta olan ürün, fiyat, görsel ve eBay kategori kimliği gerekli.");
    }
    const { data, error } = await admin.from("product_pool").update({ category_id: categoryId || null, is_vero_safe: isVeroSafe, is_published: isPublished }).eq("id", id).select("id,asin,is_vero_safe,is_published,category_id").single();
    if (error) throw error;
    return NextResponse.json({ product: data });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Depo ürünü güncellenemedi." }, { status: 400 });
  }
}
