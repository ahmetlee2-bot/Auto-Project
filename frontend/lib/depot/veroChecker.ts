export type VeroRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type VeroCheckResult = {
  asin: string;
  isVeroSafe: boolean;
  riskLevel: VeroRiskLevel;
  riskScore: number;
  detectedBrand: string | null;
  verdictLabel: string;
  reason: string;
  actionAdvice: string;
  checkedBy: "dictionary" | "gemini_ai" | "hybrid";
  checkedAt: string;
};

type VeroBrandEntry = {
  brand: string;
  aliases: string[];
  riskLevel: "HIGH" | "MEDIUM";
  riskScore: number;
  reason: string;
  actionAdvice: string;
};

/**
 * Known eBay DE VeRO / Brand Protection / Abmahnung-prone brands in Germany.
 */
const GERMAN_VERO_DICTIONARY: VeroBrandEntry[] = [
  {
    brand: "Apple",
    aliases: ["apple", "airpods", "magsafe", "iphone", "ipad", "macbook", "airtag"],
    riskLevel: "HIGH",
    riskScore: 98,
    reason: "Apple Inc. eBay DE VeRO programında en agresif korunan markadır; yetkisiz satıcılara anında ihlal (MC011) uygulanır.",
    actionAdvice: "Kesinlikle listelemeyin. Yalnızca uyumlu aksesuar satıyorsanız başlıkta 'für Apple iPhone' kalıbını dikkatli kullanın.",
  },
  {
    brand: "Bosch",
    aliases: ["bosch", "bosch professional", "bosch home", "dremel"],
    riskLevel: "HIGH",
    riskScore: 90,
    reason: "Robert Bosch GmbH Almanya'da paralel ithalat ve stok görseli (Urheberrecht) kullanımını aktif olarak denetler.",
    actionAdvice: "Üretici katalog görsellerini doğrudan kullanmaktan kaçının; yüksek VeRO / Abmahnung riski taşır.",
  },
  {
    brand: "Dyson",
    aliases: ["dyson", "airwrap", "supersonic"],
    riskLevel: "HIGH",
    riskScore: 96,
    reason: "Dyson eBay Avrupa'da tüm üçüncü taraf sıfır ürün ilanlarını sahte/yetkisiz şüpheyle kaldırır.",
    actionAdvice: "Bu markayı mağazanıza eklemeyin.",
  },
  {
    brand: "Makita",
    aliases: ["makita"],
    riskLevel: "HIGH",
    riskScore: 88,
    reason: "Makita Werkzeug GmbH eBay DE üzerinde yetkisiz satıcı ve görsel telif bildirimleri (VeRO) gönderir.",
    actionAdvice: "Yetkili bayi faturanız yoksa listelemeyin.",
  },
  {
    brand: "STIHL",
    aliases: ["stihl"],
    riskLevel: "HIGH",
    riskScore: 95,
    reason: "STIHL ürünleri yalnızca yetkili bayi ağı üzerinden satılabilir; eBay'de doğrudan VeRO ihlali alır.",
    actionAdvice: "Kesinlikle listelemeyin.",
  },
  {
    brand: "Kärcher",
    aliases: ["kärcher", "kaercher", "karcher"],
    riskLevel: "HIGH",
    riskScore: 86,
    reason: "Alfred Kärcher SE & Co. KG eBay DE'de ürün görseli ve marka kullanımını sıkı şekilde takip eder.",
    actionAdvice: "Yüksek VeRO riski nedeniyle önerilmez.",
  },
  {
    brand: "LEGO",
    aliases: ["lego", "duplo"],
    riskLevel: "HIGH",
    riskScore: 92,
    reason: "LEGO Juris A/S marka adını ve katalog fotoğraflarını eBay VeRO üzerinden sıkı korur.",
    actionAdvice: "Katalog görseliyle dropshipping yapmayın.",
  },
  {
    brand: "Nintendo",
    aliases: ["nintendo", "joy-con", "pokémon", "pokemon", "zelda"],
    riskLevel: "HIGH",
    riskScore: 94,
    reason: "Nintendo of Europe SE eBay DE üzerinde aktif VeRO taraması yapar.",
    actionAdvice: "Listelemeyin.",
  },
  {
    brand: "Sony",
    aliases: ["sony", "playstation", "dualsense", "ps5"],
    riskLevel: "HIGH",
    riskScore: 90,
    reason: "Sony Interactive Entertainment eBay VeRO üyesidir.",
    actionAdvice: "Yüksek hesap kısıtlama riski taşır, listelemeyin.",
  },
  {
    brand: "Samsung",
    aliases: ["samsung", "galaxy buds", "galaxy watch"],
    riskLevel: "HIGH",
    riskScore: 87,
    reason: "Samsung Electronics GmbH eBay DE üzerinde yetkisiz aksesuar ve cihaz ilanlarını VeRO ile kaldırabilir.",
    actionAdvice: "Doğrudan Samsung markalı ürünleri listelemekten kaçının.",
  },
  {
    brand: "Vorwerk",
    aliases: ["vorwerk", "thermomix", "kobold"],
    riskLevel: "HIGH",
    riskScore: 97,
    reason: "Vorwerk Almanya'da en sık Abmahnung ve VeRO bildirimi gönderen firmalardan biridir.",
    actionAdvice: "Kesinlikle listelemeyin.",
  },
  {
    brand: "Miele",
    aliases: ["miele"],
    riskLevel: "HIGH",
    riskScore: 91,
    reason: "Miele seçici dağıtım (Selektiver Vertrieb) uygular ve yetkisiz satıcıları eBay DE'de engeller.",
    actionAdvice: "Listelemeyin.",
  },
  {
    brand: "WMF",
    aliases: ["wmf"],
    riskLevel: "HIGH",
    riskScore: 84,
    reason: "WMF GmbH Almanya'da katalog görsellerinin izinsiz kullanımına karşı VeRO bildirimi yapar.",
    actionAdvice: "Orijinal ürün fotoğrafı olmadan listelemeyin.",
  },
  {
    brand: "Fiskars",
    aliases: ["fiskars"],
    riskLevel: "HIGH",
    riskScore: 82,
    reason: "Fiskars markası eBay Avrupa'da VeRO korumasındadır.",
    actionAdvice: "Alternatif bahçe/mutfak markalarını tercih edin.",
  },
  {
    brand: "Tefal",
    aliases: ["tefal", "rowenta", "krups"],
    riskLevel: "HIGH",
    riskScore: 83,
    reason: "Groupe SEB (Tefal/Rowenta/Krups) eBay DE VeRO katılımcısıdır.",
    actionAdvice: "Listelemeden önce dikkatli olun; yüksek şikayet riski vardır.",
  },
  {
    brand: "Philips",
    aliases: ["philips", "hue", "oneblade", "sonicare"],
    riskLevel: "HIGH",
    riskScore: 86,
    reason: "Koninklijke Philips N.V. eBay VeRO programında aktif olarak yer alır.",
    actionAdvice: "Özellikle Sonicare ve Hue serilerinde VeRO bildirimi sıktır.",
  },
  {
    brand: "Oral-B",
    aliases: ["oral-b", "oral b", "braun", "gillette"],
    riskLevel: "HIGH",
    riskScore: 89,
    reason: "Procter & Gamble (Braun / Oral-B / Gillette) eBay DE VeRO programında agresif koruma uygular.",
    actionAdvice: "Yedek başlık ve tıraş bıçaklarında yüksek VeRO riski vardır.",
  },
  {
    brand: "Henkel / Persil",
    aliases: ["persil", "pril", "somat", "perwoll", "bref"],
    riskLevel: "MEDIUM",
    riskScore: 58,
    reason: "Henkel tüketici ürünleri genel olarak alınıp satılabilir ancak resmi basın görselleri ve güvenlik bilgi formu (CLP) kurallarına dikkat edilmelidir.",
    actionAdvice: "Başlıkta yanıltıcı set/paket adedi kullanmayın, içerik uyarılarını eksiksiz ekleyin.",
  },
  {
    brand: "Anker / Eufy",
    aliases: ["anker", "eufy", "soundcore"],
    riskLevel: "MEDIUM",
    riskScore: 62,
    reason: "Anker Innovations eBay DE üzerinde kendi resmi mağazasıyla satış yapar; bazı serilerde görsel telif uyarısı gönderebilir.",
    actionAdvice: "Düşük stokla test edin ve başlıkta 'Offizieller Händler' ifadesi kullanmayın.",
  },
  {
    brand: "Xiaomi",
    aliases: ["xiaomi", "redmi", "roborock", "dreame", "mijia"],
    riskLevel: "MEDIUM",
    riskScore: 52,
    reason: "Xiaomi / ekosistem ürünleri Joybuy ve Amazon üzerinden yoğun dropshipping yapılır; doğrudan VeRO nadirdir ancak CE/WEEE uyumluluğu önemlidir.",
    actionAdvice: "AB versiyonu (EU-Version) olduğundan emin olun; güvenle listelenebilir ancak stok takibini sıkı tutun.",
  },
  {
    brand: "Baseus / UGREEN",
    aliases: ["baseus", "ugreen"],
    riskLevel: "MEDIUM",
    riskScore: 48,
    reason: "Tüketici elektroniği aksesuar markası; eBay DE'de yaygın satılır ancak bazı tekil satıcılar (Private Label) görsel hak iddia edebilir.",
    actionAdvice: "Listelenebilir; ilk 7 gün mesaj kutunuzu takip edin.",
  },
];

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCandidateBrand(title: string, explicitBrand?: string | null): string | null {
  if (explicitBrand && explicitBrand.trim().length > 1) {
    const cleaned = explicitBrand.trim();
    if (!["markenlos", "unbranded", "generic", "no name"].includes(cleaned.toLowerCase())) {
      return cleaned;
    }
  }
  const firstToken = title
    .trim()
    .split(/\s+/)[0]
    ?.replace(/[^\p{L}\p{N}-]/gu, "");
  return firstToken && firstToken.length >= 2 ? firstToken : null;
}

async function queryGeminiVeroHint(params: {
  asin: string;
  title: string;
  brand: string | null;
}): Promise<{
  riskLevel: VeroRiskLevel;
  riskScore: number;
  reason: string;
  actionAdvice: string;
} | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);

  try {
    const prompt = [
      "Sen Almanya eBay.de (DE) Dropshipping VeRO (Verified Rights Owner) ve Abmahnung uzmanısın.",
      `Ürün ASIN/SKU: ${params.asin}`,
      `Ürün Başlığı: ${params.title}`,
      `Tespit Edilen Marka: ${params.brand || "Belirsiz"}`,
      "Bu ürünün eBay.de üzerinde Amazon.de veya Joybuy.de kaynaklı dropshipping olarak listelenmesi durumunda VeRO / marka ihlali riskini değerlendir.",
      'Yalnızca şu JSON formatında yanıt ver: {"riskLevel":"LOW"|"MEDIUM"|"HIGH","riskScore":0-100,"reason":"Türkçe 1 cümlelik net açıklama","actionAdvice":"Türkçe 1 cümlelik satıcı tavsiyesi"}',
    ].join("\n");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!response.ok) return null;
    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = JSON.parse(rawText) as {
      riskLevel?: string;
      riskScore?: number;
      reason?: string;
      actionAdvice?: string;
    };

    const level: VeroRiskLevel =
      parsed.riskLevel === "HIGH" ? "HIGH" : parsed.riskLevel === "MEDIUM" ? "MEDIUM" : "LOW";
    const score = Math.max(5, Math.min(99, Number(parsed.riskScore) || (level === "HIGH" ? 85 : level === "MEDIUM" ? 50 : 15)));
    if (!parsed.reason) return null;

    return {
      riskLevel: level,
      riskScore: score,
      reason: String(parsed.reason),
      actionAdvice: String(parsed.actionAdvice || "Başlık ve görselleri kontrol ederek listeleyebilirsiniz."),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function analyzeProductVero(input: {
  asin: string;
  title: string;
  brand?: string | null;
  description?: string | null;
  supplier?: string | null;
  sourceMarketplace?: string | null;
}): Promise<VeroCheckResult> {
  const normalizedHaystack = normalizeText(`${input.brand || ""} ${input.title} ${input.description || ""}`);
  const candidateBrand = extractCandidateBrand(input.title, input.brand);

  for (const entry of GERMAN_VERO_DICTIONARY) {
    const matched = entry.aliases.some((alias) => {
      const normAlias = normalizeText(alias);
      return (
        normalizedHaystack === normAlias ||
        normalizedHaystack.startsWith(`${normAlias} `) ||
        normalizedHaystack.endsWith(` ${normAlias}`) ||
        normalizedHaystack.includes(` ${normAlias} `)
      );
    });

    if (matched) {
      return {
        asin: input.asin,
        isVeroSafe: entry.riskLevel !== "HIGH",
        riskLevel: entry.riskLevel,
        riskScore: entry.riskScore,
        detectedBrand: entry.brand,
        verdictLabel:
          entry.riskLevel === "HIGH"
            ? "🔴 Yüksek VERO Riski (Marka Korumalı)"
            : "🟡 Orta VERO Riski (Dikkatli Listeleme)",
        reason: entry.reason,
        actionAdvice: entry.actionAdvice,
        checkedBy: "dictionary",
        checkedAt: new Date().toISOString(),
      };
    }
  }

  const aiHint = await queryGeminiVeroHint({
    asin: input.asin,
    title: input.title,
    brand: candidateBrand,
  });

  if (aiHint) {
    return {
      asin: input.asin,
      isVeroSafe: aiHint.riskLevel !== "HIGH",
      riskLevel: aiHint.riskLevel,
      riskScore: aiHint.riskScore,
      detectedBrand: candidateBrand,
      verdictLabel:
        aiHint.riskLevel === "HIGH"
          ? "🔴 Yüksek VERO Riski (AI Tespit)"
          : aiHint.riskLevel === "MEDIUM"
            ? "🟡 Orta VERO Riski (Private Label / Marka)"
            : "🟢 VERO Temiz (Düşük Risk)",
      reason: aiHint.reason,
      actionAdvice: aiHint.actionAdvice,
      checkedBy: "hybrid",
      checkedAt: new Date().toISOString(),
    };
  }

  return {
    asin: input.asin,
    isVeroSafe: true,
    riskLevel: "LOW",
    riskScore: 14,
    detectedBrand: candidateBrand,
    verdictLabel: "🟢 VERO Temiz (Düşük Risk)",
    reason: `${candidateBrand || "Bu ürün"} eBay Almanya (DE) yüksek riskli VeRO kara listesinde yer almıyor; standart dropshipping için uygundur.`,
    actionAdvice: "Güvenle kuyruğa ekleyebilir ve eBay mağazanızda listeleyebilirsiniz.",
    checkedBy: "dictionary",
    checkedAt: new Date().toISOString(),
  };
}
