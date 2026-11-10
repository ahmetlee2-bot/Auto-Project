import "server-only";
import { load } from "cheerio";
import { computeSuggestedPrice } from "../ebay/multi-store";
import { premiumDescription } from "../ebay/premium-description";
import { analyzeProductVero } from "./veroChecker";

export type GermanHolidayEvent = {
  name: string;
  dateLabel: string;
  daysUntil: number;
  categoryFocus: string;
};

export type SeasonalContext = {
  activeCampaign: string;
  campaignBadge: string;
  seasonSummary: string;
  upcomingHolidays: GermanHolidayEvent[];
  searchTerms: Array<{ term: string; categoryId: string; seasonTag: string }>;
  cycleIndex: number;
  nextRotationAt: string;
  hoursUntilNextRotation: number;
};

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export function getGermanSeasonalContext(now = new Date()): SeasonalContext {
  const cycleIndex = Math.floor(now.getTime() / THREE_DAYS_MS);
  const nextRotationMs = (cycleIndex + 1) * THREE_DAYS_MS;
  const hoursUntilNextRotation = Math.max(1, Math.round((nextRotationMs - now.getTime()) / 3_600_000));

  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // 1..12

  const fixedEvents: Array<{ month: number; day: number; name: string; focus: string }> = [
    { month: 1, day: 1, name: "Neujahr & Winter-Sale", focus: "Fitness, Ordnung & Winter-KFZ" },
    { month: 2, day: 14, name: "Valentinstag", focus: "Geschenke, Schmuck & Deko" },
    { month: 4, day: 5, name: "Ostern & Frühlingsstart", focus: "Garten, Balkon & Osterdeko" },
    { month: 5, day: 10, name: "Muttertag & Vatertag", focus: "Küche, Wellness & Werkzeug" },
    { month: 6, day: 21, name: "Sommeranfang & Urlaub", focus: "Camping, Reise, Grill & Outdoor" },
    { month: 9, day: 1, name: "Schulanfang & Herbststart", focus: "Schreibtisch, Beleuchtung & Regenschutz" },
    { month: 10, day: 31, name: "Halloween & Winterzeit", focus: "Auto-Wintercheck, Licht & Deko" },
    { month: 11, day: 27, name: "Black Friday & Cyber Week", focus: "Elektronik-Zubehör, 3D-Druck, Küche & Werkzeug" },
    { month: 12, day: 6, name: "Nikolaustag & 2. Advent", focus: "Adventsdeko, Haustier & Geschenksets" },
    { month: 12, day: 24, name: "Weihnachten (Heiligabend)", focus: "Weihnachtsbeleuchtung, Küche & Familienbedarf" },
    { month: 12, day: 31, name: "Silvester & Neujahr", focus: "Party-Küche, Raclette-Zubehör & Aufbewahrung" },
  ];

  const upcomingHolidays: GermanHolidayEvent[] = fixedEvents
    .map((ev) => {
      let target = new Date(Date.UTC(year, ev.month - 1, ev.day, 12, 0, 0));
      if (target.getTime() < now.getTime() - 24 * 3_600_000) {
        target = new Date(Date.UTC(year + 1, ev.month - 1, ev.day, 12, 0, 0));
      }
      const daysUntil = Math.max(0, Math.ceil((target.getTime() - now.getTime()) / (24 * 3_600_000)));
      const dateLabel = target.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
      return {
        name: ev.name,
        dateLabel,
        daysUntil,
        categoryFocus: ev.focus,
      };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 3);

  if (month === 11 || month === 12) {
    return {
      activeCampaign: "Black Friday, Advent & Weihnachts-Hochsaison (DE)",
      campaignBadge: "🎄 Q4 Almanya Bayram & Kış Sezonu",
      seasonSummary:
        "Almanya'da Black Friday, Advent, Nikolaus (6 Aralık) ve Weihnachten (24 Aralık) dönemi aktif. Kışlık oto/ev ekipmanları, hediye edilebilir mutfak/hobi ürünleri ve yılbaşı aydınlatmaları en yüksek dönüşümü sağlar.",
      upcomingHolidays,
      searchTerms: [
        { term: "Auto Frontscheibenabdeckung Winter Magnetisch", categoryId: "131090", seasonTag: "Winter & Frostschutz" },
        { term: "Eiskratzer Auto mit Besen Schneebesen", categoryId: "131090", seasonTag: "Winter & Frostschutz" },
        { term: "Weihnachtsbeleuchtung Außen LED Lichterkette Timer", categoryId: "20625", seasonTag: "Advent & Weihnachten" },
        { term: "Heißluftfritteuse Silikonform Backpapier Zubehör", categoryId: "20625", seasonTag: "Black Friday & Küche" },
        { term: "3D Drucker Filament Vakuumbeutel Set Pumpe", categoryId: "183068", seasonTag: "Black Friday & Maker" },
        { term: "Katzenbrunnen Edelstahl Trinkbrunnen Katze", categoryId: "1281", seasonTag: "Haustier Winterpflege" },
        { term: "Hundemantel Winter Wasserdicht Reflektierend", categoryId: "1281", seasonTag: "Haustier Winterpflege" },
        { term: "Drehmomentschlüssel Fahrrad Set 1/4 Zoll", categoryId: "631", seasonTag: "Werkzeug & Geschenkideen" },
        { term: "Digitale Küchenwaage Edelstahl Feinwaage", categoryId: "20625", seasonTag: "Weihnachtsbäckerei & Küche" },
        { term: "Fusselrasierer Elektrisch Pullover Entfussler USB", categoryId: "20625", seasonTag: "Wintermode Pflege" },
      ],
      cycleIndex,
      nextRotationAt: new Date(nextRotationMs).toISOString(),
      hoursUntilNextRotation,
    };
  }

  if (month === 1 || month === 2) {
    return {
      activeCampaign: "Winter-Saison, Organisation & Valentinstag (DE)",
      campaignBadge: "❄️ Almanya Kış & Yeni Yıl Dönemi",
      seasonSummary:
        "Ocak-Şubat döneminde Almanya'da buz/don önleyici oto ekipmanları, ev içi düzenleyiciler ve Sevgililer Günü hediyelikleri öne çıkar.",
      upcomingHolidays,
      searchTerms: [
        { term: "Auto Starthilfekabel Winter Frostschutz", categoryId: "131090", seasonTag: "Winter & KFZ" },
        { term: "Luftentfeuchter Raumentfeuchter Nachfüllpack", categoryId: "20625", seasonTag: "Winter & Haushalt" },
        { term: "Vakuumbeutel Kleidung Aufbewahrung Set", categoryId: "20625", seasonTag: "Neujahr Ordnung" },
        { term: "3D Drucker Düsen Reinigungsnadeln Zubehör Set", categoryId: "183068", seasonTag: "Indoor Hobby" },
      ],
      cycleIndex,
      nextRotationAt: new Date(nextRotationMs).toISOString(),
      hoursUntilNextRotation,
    };
  }

  if (month >= 3 && month <= 5) {
    return {
      activeCampaign: "Frühlingsstart, Ostern & Garten-Saison (DE)",
      campaignBadge: "🌷 Paskalya (Ostern) & Bahar Sezonu",
      seasonSummary:
        "Almanya'da Ostern (Paskalya), bahar temizliği, balkon/bahçe hazırlığı ve bisiklet sezonu başladı.",
      upcomingHolidays,
      searchTerms: [
        { term: "Gartenschlauch Flexibel Metall Brause", categoryId: "631", seasonTag: "Garten & Frühling" },
        { term: "Solarleuchten Garten Außen Wasserdicht LED", categoryId: "20625", seasonTag: "Ostern & Balkon" },
        { term: "Fahrradtasche Wasserdicht Gepäckträger", categoryId: "131090", seasonTag: "Fahrrad-Saison" },
        { term: "Hochdruckreiniger Aufsatz Schaumkanone", categoryId: "131090", seasonTag: "Frühjahrsputz" },
      ],
      cycleIndex,
      nextRotationAt: new Date(nextRotationMs).toISOString(),
      hoursUntilNextRotation,
    };
  }

  return {
    activeCampaign: "Sommer, Outdoor, Camping & Reise-Saison (DE)",
    campaignBadge: "☀️ Almanya Yaz & Outdoor Sezonu",
    seasonSummary:
      "Almanya'da yaz tatili, kamp, barbekü (Grillen) ve sıcak hava/sineklik ürünlerine talep en üst seviyededir.",
    upcomingHolidays,
    searchTerms: [
      { term: "Fliegengitter Balkontür Magnetvorhang", categoryId: "20625", seasonTag: "Sommer & Insektenschutz" },
      { term: "Auto Sonnenschutz Frontscheibe Faltbar", categoryId: "131090", seasonTag: "Sommer & Auto" },
      { term: "Grillmatte BBQ Zubehör Edelstahl Set", categoryId: "20625", seasonTag: "Grill-Saison" },
      { term: "Kühlmatte Hund Katze Selbstkühlend", categoryId: "1281", seasonTag: "Haustier Sommer" },
    ],
    cycleIndex,
    nextRotationAt: new Date(nextRotationMs).toISOString(),
    hoursUntilNextRotation,
  };
}

const DESKTOP_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0",
];
let uaCursor = 0;

export async function discoverLiveSeasonalAmazonProducts(
  excludedAsins: Set<string>,
  maxItems = 12,
): Promise<Array<Record<string, unknown>>> {
  const context = getGermanSeasonalContext();
  const rotatedTerms = [...context.searchTerms];
  const shift = context.cycleIndex % rotatedTerms.length;
  const orderedTerms = [...rotatedTerms.slice(shift), ...rotatedTerms.slice(0, shift)].slice(0, 4);

  const discovered: Array<Record<string, unknown>> = [];
  const nowIso = new Date().toISOString();

  for (const queryItem of orderedTerms) {
    if (discovered.length >= maxItems) break;
    try {
      const response = await fetch(
        `https://www.amazon.de/s?k=${encodeURIComponent(queryItem.term)}`,
        {
          headers: {
            "User-Agent": DESKTOP_AGENTS[uaCursor++ % DESKTOP_AGENTS.length],
            "Accept-Language": "de-DE,de;q=0.9",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          cache: "no-store",
          signal: AbortSignal.timeout(12_000),
        },
      );
      if (!response.ok) continue;
      const html = await response.text();
      const $ = load(html);
      let countForTerm = 0;

      const elements = $("[data-asin]").toArray();
      for (const el of elements) {
        if (countForTerm >= 3 || discovered.length >= maxItems) break;
        const asin = ($(el).attr("data-asin") || "").trim().toUpperCase();
        if (!/^[A-Z0-9]{10}$/.test(asin) || excludedAsins.has(asin)) continue;

        const rawTitle = $(el).find("img.s-image").attr("alt") || $(el).find("h2").text() || "";
        const title = rawTitle
          .replace(/^Gesponserte Anzeige\s*[–-]\s*/i, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 180);
        const rawImg = $(el).find("img.s-image").attr("src") || "";
        const img = rawImg.replace(/\._AC_[^.]+_\./, ".");
        const priceText = $(el).find(".a-price .a-offscreen").first().text().trim();
        const priceMatch = priceText.match(/(\d+)[,.](\d{2})/);
        if (!title || title.length < 20 || !img.startsWith("https://m.media-amazon.com/images/I/") || !priceMatch) {
          continue;
        }
        const price = Number(`${priceMatch[1]}.${priceMatch[2]}`);
        if (!Number.isFinite(price) || price < 7 || price > 80) continue;

        const brand = title.split(/\s+/)[0].replace(/[^a-zA-Z0-9ÄÖÜäöüß-]/g, "") || "Markenlos";
        const vero = await analyzeProductVero({ asin, title, brand, supplier: "amazon_de" });
        if (vero.riskLevel === "HIGH") continue;

        const suggested = computeSuggestedPrice(price, 0, 22);
        const profit = Math.max(0, Number((suggested * 0.85 - price).toFixed(2)));
        if (profit < 5) continue;

        const specifics: Record<string, string[]> = {
          Marke: [brand],
          Saison: [queryItem.seasonTag],
        };

        discovered.push({
          asin,
          source_marketplace: "AMZ_DE",
          supplier: "amazon_de",
          source_url: `https://www.amazon.de/dp/${asin}`,
          title,
          description: premiumDescription({
            title,
            asin,
            brand,
            description: `${title} – Saisonprodukt für ${queryItem.seasonTag}.`,
            itemSpecifics: specifics,
          }),
          brand,
          category_id: queryItem.categoryId,
          amazon_price: price,
          suggested_ebay_price: suggested,
          estimated_profit: profit,
          estimated_shipping: 0,
          images: [img],
          item_specifics: specifics,
          condition: "NEW",
          stock_status: "in_stock",
          is_vero_safe: true,
          is_published: true,
          is_demo: false,
          last_checked_at: nowIso,
        });
        excludedAsins.add(asin);
        countForTerm++;
      }
    } catch {
      /* Ignore transient scrape errors per search term */
    }
  }

  return discovered;
}
