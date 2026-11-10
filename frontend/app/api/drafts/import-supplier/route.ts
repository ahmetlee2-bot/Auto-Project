import { NextResponse } from "next/server";
import { draftRequestUser } from "../../../../lib/drafts/server";
import { repricerAdmin } from "../../../../lib/repricer/admin";
import { calculateDraftTargetPrice } from "../../../../lib/drafts/pricing";
import { dedupeSimilarProductImages } from "../../../../lib/images/dedupeSimilarProductImages";
import { supplierRegistry } from "../../../../lib/suppliers/registry";
import type { NormalizedSupplierProduct } from "../../../../lib/suppliers/types";
import { premiumDescription } from "../../../../lib/ebay/premium-description";
import { ebayHtmlTemplate } from "../../../../lib/ebay/ebayHtmlTemplate";
import { generateProductCopy, type ProductFacts } from "../../../../lib/ai/gemini-product";
import { cleanEbayTitle } from "../../../../lib/ebay/seo-title";
import { verifiedJoybuyImages } from "../../../../lib/suppliers/joybuyImages";

export const runtime = "nodejs";
export const maxDuration = 90;
function validProduct(value: unknown): value is NormalizedSupplierProduct {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<NormalizedSupplierProduct>;
  return (p.supplier === "joybuy_de" || p.supplier === "amazon_de") && typeof p.supplierProductId === "string" && typeof p.sourceUrl === "string" && typeof p.rawTitle === "string" && Array.isArray(p.images) && typeof p.priceEur === "number";
}
function cleanJoybuyText(value: unknown): string {
  return String(value || "").split(/\n+/).map((line) => line.trim())
    .filter((line) => line && !/joybuy|barrierefreiheit|cookie|datenschutz|kundenservice|app herunterladen|newsletter/i.test(line))
    .join("\n");
}
function completeTitle(value: string): string {
  if (value.length <= 80) return value;
  const clipped = value.slice(0, 80);
  return /\s/.test(value[80] || "") ? clipped.trim() : clipped.replace(/\s+\S*$/, "").trim();
}
export async function POST(request: Request) {
  const user = await draftRequestUser(request);
  if (!user) return NextResponse.json({ error:"Unauthorized" }, {status:401});
  try {
    const body = await request.json() as { sourceUrl?: unknown; product?: unknown };
    const sourceUrl = String(body.sourceUrl || (body.product as any)?.sourceUrl || "").trim();
    let product: NormalizedSupplierProduct;
    if (validProduct(body.product)) product = body.product;
    else {
      try { product = await supplierRegistry.resolve(sourceUrl).fetchProduct(sourceUrl); }
      catch (error) {
        return NextResponse.json({ code:"SOURCE_UNAVAILABLE", error:"Bu ürünü Chrome eklentisi üzerinden aktarın veya bilgileri düzenleme ekranında tamamlayın." }, {status:409});
      }
    }
    const parsedSource = new URL(product.sourceUrl);
    if (parsedSource.protocol !== "https:") throw new Error("Ürün kaynağı HTTPS olmalı.");
    if (product.supplier === "joybuy_de" && !/(^|\.)joybuy\.de$/i.test(parsedSource.hostname)) throw new Error("Joybuy ürün bağlantısı doğrulanamadı.");
    if (product.supplier === "amazon_de" && parsedSource.hostname.toLowerCase().replace(/^www\./," ").trim() !== "amazon.de") throw new Error("Amazon ürün bağlantısı doğrulanamadı.");
    const sourcePrice = Number.isFinite(product.priceEur) && product.priceEur > 0 ? product.priceEur : null;
    const asin = product.supplier === "joybuy_de" ? `JB-${product.supplierProductId}` : product.supplierProductId;
    const title = product.rawTitle.trim().slice(0,200);
    const sourceImages = product.supplier === "joybuy_de"
      ? await verifiedJoybuyImages(product.images)
      : product.images.filter((x): x is string => typeof x === "string").slice(0,12);
    if (product.supplier === "joybuy_de" && !sourceImages.length) throw new Error("Joybuy-Produktgalerie enthält keine erreichbaren, hochauflösenden Produktbilder. Bitte die Produktseite neu laden und erneut importieren.");
    const images = await dedupeSimilarProductImages(sourceImages);
    const admin = repricerAdmin();
    const {data: existing,error: lookupError}=await admin.from("draft_products").select("id").eq("user_id",user.id).eq("asin",asin).in("status",["draft","publishing","error"]).maybeSingle();
    if(lookupError) throw lookupError;
    if(existing) return NextResponse.json({draftId:existing.id,alreadyExists:true});
    const specifications = product.specifications || {};
    const bulletPoints = (product.bulletPoints || []).map((value) => product.supplier === "joybuy_de" ? cleanJoybuyText(value) : String(value)).filter(Boolean);
    const rawDescription = product.supplier === "joybuy_de" ? cleanJoybuyText(product.rawDescription) : product.rawDescription;
    const itemSpecifics=Object.fromEntries(Object.entries(specifications).map(([key,value])=>[String(key).slice(0,100),[String(value).trim().slice(0,100)]]).filter(([,values])=>values[0]));
    const facts: ProductFacts = {
      raw_title: title,
      features: bulletPoints,
      specifications: Object.fromEntries(Object.entries(itemSpecifics)),
      description: rawDescription,
    };
    const copy = process.env.GEMINI_API_KEY?.trim() ? await generateProductCopy(facts).catch(() => null) : null;
    const generatedSpecifics = Object.fromEntries((copy?.item_specifics || []).map((item) => [item.key, [item.value]]));
    const mergedSpecifics = { ...generatedSpecifics, ...itemSpecifics };
    const listingTitle = copy?.seo_title ? cleanEbayTitle(copy.seo_title, 80) : completeTitle(title);
    const descriptionHtml = copy ? ebayHtmlTemplate(copy) : premiumDescription({ title, brand: specifications.Marke || specifications.Brand || "", description: [...bulletPoints, rawDescription].filter(Boolean).join("\n"), itemSpecifics });
    const {data: draft,error}=await admin.from("draft_products").insert({user_id:user.id,asin,supplier:product.supplier,source_url:product.sourceUrl,item_specifics:mergedSpecifics,source_price:sourcePrice,target_price:calculateDraftTargetPrice({source_price:sourcePrice,shipping_cost:0,profit_margin_percent:20}),profit_margin_percent:20,shipping_cost:0,title:listingTitle,description_html:descriptionHtml,images,quantity:1,apply_custom_frame:true,status:"draft"}).select("id").single();
    if(error) throw error;
    return NextResponse.json({draftId:draft.id,supplier:product.supplier,needsReview:!sourcePrice||!title||!images.length},{status:201});
  } catch(error) { return NextResponse.json({error:error instanceof Error?error.message:"Produktentwurf konnte nicht erstellt werden."},{status:400}); }
}
