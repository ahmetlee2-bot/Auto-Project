import { premiumDescription } from "../../../lib/ebay/premium-description";
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, isAutolisterAdmin } from "../../../lib/dashboard/server-auth";
import { computeSuggestedPrice } from "../../../lib/ebay/multi-store";
import { fetchAmazonProductDetails, type AmazonMarketplace } from "../../../lib/repricer/amazon";
import { repricerAdmin } from "../../../lib/repricer/admin";

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
};

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
  let requestQuery = repricerAdmin().from("product_pool").select("id,asin,source_marketplace,supplier,source_url,title,description,brand,category_id,amazon_price,suggested_ebay_price,estimated_profit,estimated_shipping,images,item_specifics,condition,stock_status,last_checked_at,created_at,is_vero_safe,is_published,is_demo")
  if (!includeReview) requestQuery = requestQuery.eq("is_published", true).eq("is_vero_safe", true).eq("stock_status", "in_stock").eq("is_demo", false);
  const market = query.get("marketplace");
  if (market === "AMZ_US" || market === "AMZ_DE") requestQuery = requestQuery.eq("source_marketplace", market);
  const category = query.get("category");
  if (category) requestQuery = requestQuery.eq("category_id", category);
  const maxPrice = Number(query.get("maxPrice"));
  if (query.has("maxPrice") && Number.isFinite(maxPrice) && maxPrice >= 0) requestQuery = requestQuery.lte("amazon_price", maxPrice);
  const minProfit = Number(query.get("minProfit"));
  if (query.has("minProfit") && Number.isFinite(minProfit) && minProfit >= 0) requestQuery = requestQuery.gte("estimated_profit", minProfit);
  const { data, error } = await requestQuery.order("estimated_profit", { ascending: false, nullsFirst: false }).limit(200);
  if (error) return NextResponse.json({ error: "Produktdepot konnte nicht geladen werden." }, { status: 500 });
  let categoryQuery = repricerAdmin().from("product_pool").select("category_id").not("category_id", "is", null).limit(200);
  if (!includeReview) categoryQuery = categoryQuery.eq("is_published", true).eq("is_demo", false);
  const { data: categories } = await categoryQuery;
  return NextResponse.json({
    products: data || [],
    categories: [...new Set((categories || []).map((row) => row.category_id).filter(Boolean))],
    canImport: adminUser,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  if (!isAutolisterAdmin(user.id)) return NextResponse.json({ error: "Bu işlem AutoLister yöneticilerine açıktır." }, { status: 403 });

  try {
    const body = await request.json() as { products?: PoolImport[]; asins?: unknown; sourceMarketplace?: unknown };
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
