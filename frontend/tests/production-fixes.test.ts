import assert from "node:assert/strict";
import test from "node:test";
import { premiumDescription } from "../lib/ebay/premium-description";
import { cleanEbayTitle, deterministicEbayTitle } from "../lib/ebay/seo-title";
import { generateProductCopy, parseProductCopy } from "../lib/ai/gemini-product";
import { ebayHtmlTemplate } from "../lib/ebay/ebayHtmlTemplate";
import { appUrl } from "../lib/app-url";
import { fetchAmazonProductDetails, parseAsin } from "../lib/repricer/amazon";
import { createEbayAuthorizationUrl, exchangeAuthorizationCode, fetchSellerUsername, signOAuthState, verifyOAuthState } from "../lib/ebay/multi-store";
import { resolveTracking } from "../lib/logistics/trackingAdapter";
import { inventoryItemDescription, isMissingOfferResponse } from "../lib/repricer/ebay";
import { generateSku } from "../lib/ebay/sku";
import { routeSupplierTracking } from "../lib/tracking/carrierRouter";
import { HttpTrackingConverterProvider } from "../lib/tracking/providers/threePlProvider";
import { isJoybuyTrackedProduct, verificationPendingState } from "../lib/repricer/sync";
import { joybuyAdapter } from "../lib/suppliers/joybuyAdapter";

test("Joybuy supplier IDs never enter Amazon ASIN checks and failed source reads remain validation pending", () => {
  assert.equal(isJoybuyTrackedProduct({ supplier: "joybuy_de", amazon_asin: "JB-10520407" }), true);
  assert.equal(isJoybuyTrackedProduct({ supplier: "amazon_de", amazon_asin: "JB-10519931" }), true);
  assert.equal(isJoybuyTrackedProduct({ amazon_asin: "B0CMXKCXG4" }), false);
  const pending = verificationPendingState("Amazon");
  assert.equal(pending.sync_status, "error");
  assert.match(pending.last_error, /^VERIFICATION_PENDING:/);
  assert.match(pending.last_error, /zuletzt gespeicherten Werte bleiben erhalten/);
});

test("Joybuy depot imports accept a numeric SKU, JB-prefixed SKU, or Joybuy product URL", () => {
  assert.equal(joybuyAdapter.canHandle("10520407"), true);
  assert.equal(joybuyAdapter.canHandle("JB-10520407"), true);
  assert.equal(joybuyAdapter.canHandle("https://www.joybuy.de/dg/10520407"), true);
  assert.equal(joybuyAdapter.canHandle("https://evil.example/dg/10520407"), false);
});

test("a new SKU's eBay 404/25713 starts offer creation, while other failures stop it", () => {
  assert.equal(isMissingOfferResponse(404, [{ errorId: 25713 }]), true);
  assert.equal(isMissingOfferResponse(404, [{ errorId: 25710 }]), false);
  assert.equal(isMissingOfferResponse(403, [{ errorId: 25713 }]), false);
});

test("store inventory SKUs use stable store prefixes and distinct namespaces", () => {
  const shared = { listingId: "draft-123", userId: "user-1" };
  const first = generateSku({ ...shared, storeId: "store-1", storeName: "targonahandel" });
  const second = generateSku({ ...shared, storeId: "store-2", storeName: "Buchhandlung" });
  assert.match(first, /^TAR-[A-Z0-9]{6}$/);
  assert.match(second, /^BUC-[A-Z0-9]{6}$/);
  assert.notEqual(first, second);
  assert.equal(first, generateSku({ ...shared, storeId: "store-1", storeName: "targonahandel" }));
  assert.match(generateSku({ ...shared, storeId: "store-3", storeName: "Shop name", skuPrefix: "my-42" }), /^MY42-[A-Z0-9]{6}$/);
  assert.match(generateSku({ ...shared, storeId: "store-4" }), /^INV-[A-Z0-9]{6}$/);
});

test("Inventory item description is plain text and within eBay's 4000-character limit", () => {
  const value = inventoryItemDescription(`<div><h1>Wisedry</h1><p>Orange &amp; Grün</p>${"A".repeat(5000)}</div>`, "Fallback");
  assert.equal(value.length, 4000);
  assert.ok(value.startsWith("Wisedry Orange & Grün"));
  assert.ok(!value.includes("<div>"));
});

test("production never redirects to a loopback or insecure origin", () => {
  const saved = { ...process.env };
  try {
    Object.assign(process.env, { NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3210" });
    assert.equal(appUrl(), "https://autolister-app.de");
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3210";
    assert.equal(appUrl(), "https://autolister-app.de");
    delete process.env.NEXT_PUBLIC_APP_URL;
    assert.equal(appUrl(), "https://autolister-app.de");
  } finally { process.env = saved; }
});

test("premium HTML keeps the supplied structure and escapes every product value", () => {
  const html = premiumDescription({ title: '<script>alert("x")</script>', asin: "B09R4T5WPB", description: "First\nSecond", itemSpecifics: { '<img src=x>': ['<b>unsafe</b>'] } });
  assert.ok(html.includes("grid-template-columns:repeat(auto-fit,minmax(180px,1fr))"));
  assert.ok(html.includes("Produktdaten &amp; Spezifikationen"));
  assert.ok(html.includes("alert(&quot;x&quot;)"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("{{"));
  assert.ok(!/ASIN|Amazon/i.test(html));
  assert.ok(html.includes("Produktdaten &amp; Spezifikationen"));
});

test("local eBay SEO title fallback strips marks and never cuts words", () => {
  const result = deterministicEbayTitle("QWORK® 20 Stück 608zz Kugellager, Metall Double Shielded Miniatur Rillenkugellager");
  assert.ok(result.length <= 80);
  assert.ok(!/[®™©]/.test(result));
  assert.ok(!result.endsWith("Rillenkugellag"));
  assert.match(result, /20x.*608ZZ.*Kugellager/i);
});

test("structured SEO copy preserves decimal weight, title options and renders grounded HTML safely", () => {
  const copy = parseProductCopy({ seo_titles: ["wisedry Silikagel Trockenmittel 0,9kg Orange Grün 3D Druck Filament", "wisedry Kieselgel 900g Trockenperlen Orange-Grün für Filament", "wisedry Trockenmittelperlen 0,9 kg wiederaufladbar 3D Druck"], top_badge: "TROCKENMITTEL", headline: "Silikagel für Filament", subtitle: "Feuchtigkeitsschutz", introduction: "Schützen Sie Ihr Filament vor Feuchtigkeit.", highlight_cards: [{ emoji: "🖨️", title: "Filament", desc: "Für 3D-Druck-Filament" }, { emoji: "🎯", title: "Farbindikator", desc: "Orange zu Grün" }, { emoji: "🔄", title: "Wiederaufladbar", desc: "Mehrfach nutzbar" }, { emoji: "📦", title: "900 g Inhalt", desc: "0,9 kg Perlen" }], bullet_points: [{ label: "Farbindikator", text: "Orange zu Grün" }], specs_table: [{ key: "Menge", value: "0,9 kg" }, { key: "Produktart", value: "Silikagel-Trockenmittel" }, { key: "Ausführung", value: "Perlen" }], delivery_contents: "0,9 kg Silikagel-Perlen", service_note: "Bei Fragen kontaktieren Sie uns über eBay-Nachrichten.", legal_notices: [], item_specifics: [{ key: "Produktart", value: "Silikagel" }], expert_tip: "Farbwechsel prüfen" });
  assert.ok(copy);
  assert.equal(copy.seo_title_alternatives.length, 3);
  assert.ok(copy.seo_title_alternatives.every((title) => title.length <= 80));
  assert.equal(copy.highlight_cards.length, 4);
  assert.equal(copy.item_specifics[0].value, "Silikagel");
  assert.match(cleanEbayTitle(copy.seo_title), /0,9kg/);
  const html = ebayHtmlTemplate(copy);
  assert.match(html, /0,9 kg/);
  assert.doesNotMatch(html, />Produkt<|>Produktdetails</);
  assert.match(html, /display:flex;flex-wrap:wrap/);
  assert.match(html, /Lieferumfang &amp; Service/);
  assert.match(html, /Artikelmerkmale/);
  assert.ok(html.indexOf("Hinweise") < html.indexOf("Artikelmerkmale"));
  assert.equal(parseProductCopy({ ...copy, specs_table: [{ key: "Material", value: "Siehe Beschreibung" }] }), null);
  assert.equal(parseProductCopy({ ...copy, seo_title: "wisedry Trockenmittel 0 9" }), null);
});

test("Gemini listing generation requests strict JSON from all supplied product facts", async () => {
  const savedEnv = { ...process.env };
  const originalFetch = global.fetch;
  try {
    process.env.GEMINI_API_KEY = "test-key-not-a-real-secret";
    process.env.GEMINI_MODEL = "gemini-test";
    const modelCopy = {
      seo_titles: ["Beneunder Sonnenhut Damen 55-58 cm Rosa Outdoor", "Damen Sonnenblende Rosa 55-58 cm von Beneunder", "Beneunder Damenhut Rosa verstellbar Größe 55-58"],
      top_badge: "",
      headline: "Beneunder Sonnenblende für Damen",
      subtitle: "Sonnenschutz für unterwegs",
      introduction: "Leichte Sonnenblende für Aktivitäten im Freien.",
      highlight_cards: [1, 2, 3, 4].map((number) => ({ emoji: "✨", title: `Vorteil ${number}`, desc: "Belegter Produktvorteil." })),
      bullet_points: [{ label: "Passform", text: "Größe 55–58 cm laut Produktdaten." }],
      specs_table: [{ key: "Farbe", value: "Sky Pink" }],
      delivery_contents: "Eine Sonnenblende",
      service_note: "Kontakt über eBay-Nachrichten.",
      legal_notices: [],
      item_specifics: [{ key: "Farbe", value: "Rosa" }],
      expert_tip: "",
    };
    global.fetch = async (url, init) => {
      assert.match(String(url), /gemini-test:generateContent/);
      assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "test-key-not-a-real-secret");
      const request = JSON.parse(String(init?.body));
      assert.equal(request.generationConfig.responseMimeType, "application/json");
      assert.match(request.systemInstruction.parts[0].text, /genau drei unterschiedliche/);
      const sent = JSON.parse(request.contents[0].parts[0].text.split("\n").at(-1));
      assert.equal(sent.raw_title, "Beneunder Damen Sonnenblende Sky Pink 55–58 cm");
      assert.equal(sent.specifications.Farbe[0], "Sky Pink");
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(modelCopy) }] } }] });
    };
    const generated = await generateProductCopy({
      raw_title: "Beneunder Damen Sonnenblende Sky Pink 55–58 cm",
      features: ["Leichte Sonnenblende"],
      specifications: { Farbe: ["Sky Pink"], Größe: ["55–58 cm"] },
      description: "Für Aktivitäten im Freien.",
    });
    assert.ok(generated);
    assert.equal(generated.seo_title_alternatives.length, 3);
    assert.equal(generated.item_specifics[0].key, "Farbe");
  } finally {
    process.env = savedEnv;
    global.fetch = originalFetch;
  }
});

test("OAuth uses the same RuName for consent and token exchange and validates signatures", async () => {
  const saved = { ...process.env }, originalFetch = global.fetch;
  try {
    Object.assign(process.env, { EBAY_CLIENT_ID: "test-client", EBAY_CLIENT_SECRET: "test-secret", EBAY_MULTI_STORE_RU_NAME: "test-runame", EBAY_OAUTH_STATE_SECRET: "test-state-secret" });
    const url = new URL(createEbayAuthorizationUrl("nonce", "EBAY_DE"));
    assert.equal(url.searchParams.get("redirect_uri"), "test-runame");
    assert.equal(url.searchParams.get("state"), "EBAY_DE.nonce");
    assert.ok(verifyOAuthState("payload", signOAuthState("payload")));
    assert.ok(!verifyOAuthState("tampered", signOAuthState("payload")));
    global.fetch = async (_url, init) => {
      const body = new URLSearchParams(String(init?.body));
      assert.equal(body.get("redirect_uri"), "test-runame");
      assert.equal(body.get("code"), "v^1#test");
      return Response.json({ access_token: "test", refresh_token: "test-refresh", expires_in: 7200 });
    };
    assert.equal((await exchangeAuthorizationCode("v^1#test")).refresh_token, "test-refresh");
  } finally { global.fetch = originalFetch; process.env = saved; }
});

test("seller identity falls back to the authenticated Trading GetUser call", async () => {
  const originalFetch = global.fetch;
  try {
    global.fetch = async (input, init) => {
      if (String(input).includes("/commerce/identity/")) return new Response(null, { status: 404 });
      assert.equal(new Headers(init?.headers).get("X-EBAY-API-CALL-NAME"), "GetUser");
      assert.equal(new Headers(init?.headers).get("X-EBAY-API-IAF-TOKEN"), "test-token");
      return new Response('<GetUserResponse><Ack>Success</Ack><User><UserID>alltaghaus</UserID></User></GetUserResponse>');
    };
    assert.equal(await fetchSellerUsername("test-token"), "alltaghaus");
  } finally { global.fetch = originalFetch; }
});

test("exhausted provider falls back to Amazon HTML and is bypassed on the next request", async () => {
  const saved = { ...process.env }, originalFetch = global.fetch;
  let providerCalls = 0, directCalls = 0;
  try {
    process.env.RAINFOREST_API_KEY = "exhausted-test-key";
    global.fetch = async (input) => {
      if (String(input).includes("rainforest")) { providerCalls++; return Response.json({ request_info: { success: false, message: "You have used up your free credits, please consider upgrading to a paid plan." } }, { status: 402 }); }
      directCalls++;
      return new Response('<span id="productTitle">Test product</span><div id="availability"><span>Auf Lager</span></div><div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">12,99 €</span></span></div>');
    };
    const first = await fetchAmazonProductDetails("B09R4T5WPB", "AMZ_DE");
    assert.equal(first.price, 12.99); assert.equal(first.inStock, true);
    await fetchAmazonProductDetails("B09R4T5WPB", "AMZ_DE");
    assert.equal(providerCalls, 1); assert.equal(directCalls, 2);
    global.fetch = async () => new Response('<span id="productTitle">US product</span><script type="application/ld+json">{"@type":"Product","name":"US product","offers":{"price":"14.95","priceCurrency":"USD","availability":"https://schema.org/OutOfStock"}}</script>');
    assert.equal((await fetchAmazonProductDetails("B09R4T5WPB", "AMZ_US")).inStock, false);
    global.fetch = async () => new Response('<span id="productTitle">Buyable product</span><div id="desktop_qualifiedBuyBox"><div id="availability"><span></span></div><input id="add-to-cart-button" type="submit"><input id="buy-now-button" type="submit"><select id="quantity"><option value="1" selected>1</option></select></div><div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">8,49 €</span></span></div>');
    assert.equal((await fetchAmazonProductDetails("B09R4T5WPB", "AMZ_DE")).inStock, true);
    global.fetch = async () => new Response('<span id="productTitle">No stock information</span>');
    await assert.rejects(fetchAmazonProductDetails("B09R4T5WPB", "AMZ_DE"), /Bestand/);
    assert.throws(() => parseAsin("https://evil.example/dp/B09R4T5WPB"));
  } finally { global.fetch = originalFetch; process.env = saved; }
});

test("tracking validates real identifiers and only uses a provider's returned conversion", async () => {
  const order = { orderId: "test-order", marketplaceId: "EBAY_DE", lineItems: [{ lineItemId: "line", quantity: 1 }] };
  const saved = { ...process.env }, originalFetch = global.fetch;
  try {
    assert.equal((await resolveTracking({ mode: "direct", trackingNumber: "DHL123456789", carrierCode: "DHL", order })).ebayCarrierCode, "DHL");
    await assert.rejects(resolveTracking({ mode: "direct", trackingNumber: "fake <code>", carrierCode: "DHL", order }));
    delete process.env.LOGISTICS_3PL_API_URL; delete process.env.LOGISTICS_3PL_API_KEY;
    await assert.rejects(resolveTracking({ mode: "adapter", provider: "AQUILINE", sourceTrackingId: "TBA123456789", order }), /konfiguriert/);
    process.env.LOGISTICS_3PL_API_URL = "https://logistics.example/convert";
    process.env.LOGISTICS_3PL_API_KEY = "test";
    global.fetch = async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      assert.equal(request.originalSupplierTrackingId, "TBA123456789");
      return Response.json({ trackingNumber: "REAL123456789", provider: "AQUILINE", carrierCode: "Other" });
    };
    const converted = await resolveTracking({ mode: "adapter", provider: "AQUILINE", sourceTrackingId: "TBA123456789", order });
    assert.equal(converted.trackingNumber, "REAL123456789");
    assert.equal(converted.provider, "AQUILINE");
    assert.equal(converted.ebayCarrierCode, "Other");
  } finally { global.fetch = originalFetch; process.env = saved; }
});

test("TBA supplier numbers auto-select 3PL and internal provider mode returns a live Aquiline AQ…DE code with initial status history", async () => {
  const saved = { ...process.env };
  try {
    process.env.TRACKING_PROVIDER_MODE = "internal";
    process.env.TRACKING_MOCK_MODE = "false";
    delete process.env.TRACKING_PROVIDER_URL;
    delete process.env.TRACKING_PROVIDER_API_KEY;
    const routed = routeSupplierTracking("TBA123456789000");
    assert.equal(routed.mode, "adapter");
    const result = await new HttpTrackingConverterProvider().convert({
      sourceTrackingNumber: routed.sourceTrackingId,
      recipientZip: "86150",
      recipientCity: "Augsburg",
      recipientCountry: "DE",
      ebayOrderId: "internal-order",
      provider: routed.provider!,
    });
    assert.match(result.convertedTrackingNumber, /^AQ\d{10}DE$/);
    assert.equal(result.success, true);
    assert.equal(result.isMock, false);
    assert.equal(result.carrierName, "Aquiline");
    assert.equal(result.ebayCarrierCode, "Aquiline");
    assert.equal(result.status_history.length, 2);
    assert.equal(result.status_history[0].description, "Auftragsdaten elektronisch übermittelt");
    assert.equal(result.status_history[1].description, "Sendung wurde versandt");
  } finally { process.env = saved; }
});
