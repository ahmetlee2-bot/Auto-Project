import { NextResponse } from "next/server";
import { draftRequestUser } from "../../../../lib/drafts/server";
import { fetchAmazonProductDetails } from "../../../../lib/repricer/amazon";
import { generateProductCopy, type ProductFacts } from "../../../../lib/ai/gemini-product";
import { ebayHtmlTemplate } from "../../../../lib/ebay/ebayHtmlTemplate";
import { cleanEbayTitle, deterministicEbayTitle } from "../../../../lib/ebay/seo-title";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await draftRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const title = String(body.title || "").trim().slice(0, 500);
    const asin = String(body.asin || "").trim().toUpperCase();
    if (title.length < 3) return NextResponse.json({ error: "Bitte gib zuerst einen Produkttitel ein." }, { status: 400 });

    // A draft may contain an already shortened title and generated HTML. Refresh the
    // original Amazon facts instead of feeding those previous outputs back to Gemini.
    let facts: ProductFacts | null = null;
    if (/^[A-Z0-9]{10}$/.test(asin)) {
      try {
        const amazon = await fetchAmazonProductDetails(asin, "AMZ_DE");
        facts = {
          raw_title: amazon.title,
          features: amazon.description.split(/\n|[•●▪]/).map((part) => part.trim()).filter(Boolean).slice(0, 15),
          specifications: amazon.itemSpecifics,
          description: amazon.description,
        };
      } catch { /* No unverified product facts are substituted. */ }
    }
    if (!facts) {
      const features = Array.isArray(body.features) ? body.features.map(String).slice(0, 15) : [];
      const rawSpecifics = body.item_specifics ?? body.specifications;
      const specifications = rawSpecifics && typeof rawSpecifics === "object" && !Array.isArray(rawSpecifics)
        ? Object.fromEntries(Object.entries(rawSpecifics as Record<string, unknown>).map(([key, value]) => [key, (Array.isArray(value) ? value : [value]).map(String)])) : {};
      const rawTitle = String(body.raw_title || "").trim();
      const description = String(body.raw_description || "").trim();
      if (rawTitle && (features.length || description || Object.keys(specifications).length)) {
        facts = { raw_title: rawTitle.slice(0, 500), features, specifications, description: description.slice(0, 5000) };
      }
    }
    const copy = facts && process.env.GEMINI_API_KEY?.trim() ? await generateProductCopy(facts).catch(() => null) : null;
    if (copy) return NextResponse.json({
      title: cleanEbayTitle(copy.seo_title, 80),
      title_alternatives: copy.seo_title_alternatives,
      description_html: ebayHtmlTemplate(copy),
      item_specifics: Object.fromEntries(copy.item_specifics.map((item) => [item.key, [item.value]])),
      source: "ai", providerConfigured: true, fallbackReason: null,
    });
    return NextResponse.json({
      title: deterministicEbayTitle(facts?.raw_title || title), source: "local",
      providerConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
      fallbackReason: facts ? "provider_unavailable" : "source_unavailable",
    });
  } catch {
    return NextResponse.json({ error: "Titel konnte nicht optimiert werden." }, { status: 400 });
  }
}
