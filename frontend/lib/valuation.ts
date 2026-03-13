import type { AnalyzeRequest, AnalyzeResponse, AppSettings, PortfolioDeal, SavedDeal, SearchProfile } from "./api";

export type SourceKey = "Kleinanzeigen" | "AutoScout24" | "Marketplace";
export type FuelOption = "Benzin" | "Diesel" | "Hybrid";
export type TransmissionOption = "Manuel" | "Otomatik";
export type Tone = "neutral" | "positive" | "warning";

export type ValuationFormState = {
  brand: string;
  model: string;
  year: number;
  km: number;
  fuel: FuelOption;
  transmission: TransmissionOption;
  city: string;
  askingPrice: number;
  source: SourceKey;
  rawText: string;
  url: string;
};

export type ValuationEstimate = {
  fair: number;
  low: number;
  high: number;
  fastSale: number;
  buyBox: number;
  prep: number;
  fees: number;
  totalCost: number;
  resale: number;
  netProfit: number;
  margin: number;
  dealTag: string;
  risk: string;
};

export type ComparableListing = {
  id: string;
  title: string;
  year: number;
  km: number;
  price: number;
  tag: string;
  source: SourceKey;
  deltaToFair: number;
};

export type SummaryCardData = {
  label: string;
  value: string;
  detail: string;
};

export type StatusCardData = {
  label: string;
  value: string;
  detail: string;
  tone: Tone;
};

export type ScenarioCase = {
  title: string;
  resale: number;
  totalCost: number;
  netProfit: number;
  margin: number;
  verdict: string;
  tone: Tone;
};

export type LocalBuyBoxSignal = {
  status: "fit" | "review" | "out";
  title: string;
  nextStep: string;
  notes: string[];
  tone: Tone;
};

type SourceOption = {
  key: SourceKey;
  label: string;
  analyzeSource: AnalyzeRequest["source"];
  hint: string;
};

const REFERENCE_YEAR = 2026;

export const sourceOptions: SourceOption[] = [
  {
    key: "Kleinanzeigen",
    label: "Kleinanzeigen",
    analyzeSource: "Kleinanzeigen",
    hint: "Fastest parser path for the current backend.",
  },
  {
    key: "AutoScout24",
    label: "AutoScout24",
    analyzeSource: "Mobile.de",
    hint: "Temporary adapter maps to the mobile-style source parser.",
  },
  {
    key: "Marketplace",
    label: "Marketplace",
    analyzeSource: "Facebook Marketplace",
    hint: "Social marketplace adapter with lower data structure confidence.",
  },
];

export const fuelOptions: FuelOption[] = ["Benzin", "Diesel", "Hybrid"];
export const transmissionOptions: TransmissionOption[] = ["Manuel", "Otomatik"];
export const cityOptions = ["Hamburg", "Berlin", "Munchen", "Bremen", "Hannover"];

export function createInitialFormState(preferredCity = "Hamburg"): ValuationFormState {
  return {
    brand: "VW",
    model: "Golf",
    year: 2008,
    km: 156000,
    fuel: "Benzin",
    transmission: "Manuel",
    city: preferredCity,
    askingPrice: 4290,
    source: "Kleinanzeigen",
    rawText: "",
    url: "",
  };
}

export function createSampleFormState(preferredCity = "Hamburg"): ValuationFormState {
  return {
    brand: "VW",
    model: "Golf",
    year: 2008,
    km: 156000,
    fuel: "Benzin",
    transmission: "Manuel",
    city: preferredCity,
    askingPrice: 4290,
    source: "Kleinanzeigen",
    rawText:
      "VW Golf 1.6 Trendline, 2008, 156000 km, manuel, klima, TUV yeni. Hamburg. Sol arka kapi boya, pazarlik var.",
    url: "https://www.kleinanzeigen.de/s-anzeige/example-golf/1234567890",
  };
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function calculateEstimate(input: ValuationFormState): ValuationEstimate {
  const agePenalty = Math.max(0, REFERENCE_YEAR - input.year) * 85;
  const kmPenalty = Math.max(0, input.km - 120000) * 0.018;
  const fuelAdjustment = input.fuel === "Diesel" ? 260 : input.fuel === "Hybrid" ? 540 : 0;
  const transmissionAdjustment = input.transmission === "Otomatik" ? 420 : 0;
  const cityAdjustment =
    input.city === "Munchen" ? 450 : input.city === "Berlin" ? 180 : input.city === "Hamburg" ? 130 : 0;

  const base = 6100 - agePenalty - kmPenalty + fuelAdjustment + transmissionAdjustment + cityAdjustment;
  const fair = Math.max(1800, Math.round(base / 10) * 10);
  const low = Math.round((fair * 0.91) / 10) * 10;
  const high = Math.round((fair * 1.07) / 10) * 10;
  const fastSale = Math.round((fair * 0.88) / 10) * 10;
  const buyBox = Math.round((fair * 0.81) / 10) * 10;
  const prep = input.km > 180000 ? 420 : 280;
  const fees = Math.round((fair * 0.06) / 10) * 10;
  const totalCost = input.askingPrice + prep + 120 + fees;
  const resale = Math.round((fair * 0.97) / 10) * 10;
  const netProfit = resale - totalCost;
  const margin = Math.round((netProfit / Math.max(1, totalCost)) * 100);

  const dealTag =
    input.askingPrice <= buyBox
      ? "Guclu alim firsati"
      : input.askingPrice <= fair
        ? "Incelenebilir"
        : "Pahali gorunuyor";

  const risk = input.km > 190000 ? "Yuksek" : input.year < 2007 ? "Orta" : "Dusuk";

  return {
    fair,
    low,
    high,
    fastSale,
    buyBox,
    prep,
    fees,
    totalCost,
    resale,
    netProfit,
    margin,
    dealTag,
    risk,
  };
}

export function buildComparables(form: ValuationFormState, estimate: ValuationEstimate): ComparableListing[] {
  const comparableSources: SourceKey[] = [form.source, "AutoScout24", "Marketplace"];

  return [
    {
      id: "upper-band",
      title: `${form.brand} ${form.model} 1.6 Comfort`,
      year: form.year,
      km: Math.max(88000, form.km - 19000),
      price: estimate.high,
      tag: "Ust bant",
      source: comparableSources[0],
      deltaToFair: estimate.high - estimate.fair,
    },
    {
      id: "fair-band",
      title: `${form.brand} ${form.model} Trendline`,
      year: Math.max(2005, form.year - 1),
      km: form.km,
      price: estimate.fair,
      tag: "Orta piyasa",
      source: comparableSources[1],
      deltaToFair: 0,
    },
    {
      id: "lower-band",
      title: `${form.brand} ${form.model} Basis`,
      year: Math.max(2004, form.year - 2),
      km: Math.min(265000, form.km + 27000),
      price: estimate.low,
      tag: "Alt bant",
      source: comparableSources[2],
      deltaToFair: estimate.low - estimate.fair,
    },
  ];
}

export function buildScenarios(form: ValuationFormState, estimate: ValuationEstimate): ScenarioCase[] {
  const conservativeResale = estimate.fastSale;
  const conservativeCost = form.askingPrice + estimate.prep + 220 + Math.round((estimate.fastSale * 0.07) / 10) * 10;
  const conservativeProfit = conservativeResale - conservativeCost;

  const baseResale = estimate.resale;
  const baseCost = estimate.totalCost;
  const baseProfit = estimate.netProfit;

  const upsideResale = estimate.high;
  const upsideCost =
    form.askingPrice + Math.max(220, estimate.prep - 80) + 120 + Math.round((estimate.high * 0.055) / 10) * 10;
  const upsideProfit = upsideResale - upsideCost;

  return [
    buildScenarioCase("Conservative", conservativeResale, conservativeCost, conservativeProfit),
    buildScenarioCase("Base case", baseResale, baseCost, baseProfit),
    buildScenarioCase("Upside", upsideResale, upsideCost, upsideProfit),
  ];
}

export function getLocalBuyBoxSignal(form: ValuationFormState, estimate: ValuationEstimate): LocalBuyBoxSignal {
  if (form.askingPrice <= estimate.buyBox && estimate.margin >= 12) {
    return {
      status: "fit",
      title: "Operator buy-box fit",
      nextStep: "Kaynak ve satici temizse hizli gorusme planla, saha kontroluyle ayni gun teklif ver.",
      notes: [
        "Asking price buy-box tavaninin altinda kaliyor.",
        "Net profit ve margin flip standardini tasiyor.",
        "Hazirlik maliyeti kontrol altinda gorunuyor.",
      ],
      tone: "positive",
    };
  }

  if (form.askingPrice <= estimate.fair) {
    return {
      status: "review",
      title: "Operator review gerekli",
      nextStep: "Saha kontrolu, TUV ve mekanik durum teyidi olmadan agresif teklif verme.",
      notes: [
        "Arac piyasa bandina yakin, marj alanini pazarlik acacak.",
        "Hazirlik ve fees toplami karliligi hizla daraltabilir.",
        "Local valuation olumlu ama canli parser sonucu ile karsilastirma yapilmasi gerekir.",
      ],
      tone: "warning",
    };
  }

  return {
    status: "out",
    title: "Buy-box disi",
    nextStep: "Bu deal'i sadece sert fiyat kirilimi olursa tekrar ac.",
    notes: [
      "Asking price piyasa bandina gore zayif kaliyor.",
      "Margin beklenen flip standardinin altina dusebilir.",
      "Comparables daha ucuz bandi destekliyor.",
    ],
    tone: "warning",
  };
}

export function buildSummaryCards(watchlist: SavedDeal[], portfolio: PortfolioDeal[]): SummaryCardData[] {
  const activePortfolio = portfolio.filter((deal) => deal.status !== "sold");
  const expectedProfit = activePortfolio.reduce((total, deal) => total + deal.net_profit, 0);
  const capital = activePortfolio.reduce((total, deal) => total + deal.total_cost, 0);

  return [
    { label: "Watchlist", value: String(watchlist.length), detail: "Kaydedilen firsatlar" },
    { label: "Aktif portfoy", value: String(activePortfolio.length), detail: "Sourcing + prep" },
    { label: "Beklenen kar", value: formatCurrency(expectedProfit), detail: "Acik deal toplami" },
    { label: "Sermaye", value: formatCurrency(capital), detail: "Bagli toplam maliyet" },
  ];
}

export function buildStatusCards(input: {
  form: ValuationFormState;
  estimate: ValuationEstimate;
  result: AnalyzeResponse | null;
  watchlist: SavedDeal[];
  portfolio: PortfolioDeal[];
  searchProfiles: SearchProfile[];
}): StatusCardData[] {
  const adapter = getSourceAdapter(input.form.source);
  const localSignal = getLocalBuyBoxSignal(input.form, input.estimate);
  const activePortfolio = input.portfolio.filter((deal) => deal.status !== "sold");
  const activeSearchProfiles = input.searchProfiles.filter((profile) => profile.active).length;

  return [
    {
      label: "Source adapter",
      value: adapter.label,
      detail: `Request adapter: ${adapter.analyzeSource}`,
      tone: "neutral",
    },
    {
      label: "Operator fit",
      value: input.result ? buyBoxLabel(input.result.buy_box_status) : buyBoxLabel(localSignal.status),
      detail: input.result ? input.result.next_action : localSignal.nextStep,
      tone: input.result
        ? input.result.buy_box_status === "fit"
          ? "positive"
          : "warning"
        : localSignal.tone,
    },
    {
      label: "Backend sync",
      value: input.result ? `${input.result.confidence_score}/100` : "Preview only",
      detail: input.result
        ? `${input.result.source_parser} parser active`
        : "Local valuation hazir, canli operator analyze manuel tetiklenir.",
      tone: input.result ? "positive" : "neutral",
    },
    {
      label: "Collections",
      value: `${input.watchlist.length} / ${activePortfolio.length}`,
      detail: `${activeSearchProfiles} aktif search profile backend'de duruyor.`,
      tone: "neutral",
    },
  ];
}

export function toAnalyzeRequest(form: ValuationFormState): AnalyzeRequest {
  return {
    source: getSourceAdapter(form.source).analyzeSource,
    url: form.url || undefined,
    brand: form.brand,
    model: form.model,
    year: form.year,
    km: form.km,
    fuel: form.fuel,
    asking_price: form.askingPrice,
    city: form.city,
    raw_text: form.rawText || undefined,
  };
}

export function getSourceAdapter(source: SourceKey): SourceOption {
  return sourceOptions.find((item) => item.key === source) ?? sourceOptions[0];
}

export function buyBoxLabel(status: "fit" | "review" | "out"): string {
  if (status === "fit") {
    return "Buy-box fit";
  }
  if (status === "review") {
    return "Review";
  }
  return "Out";
}

export function applyPreferredCity(current: ValuationFormState, settings: AppSettings): ValuationFormState {
  if (current.city !== "Hamburg" && current.city !== settings.preferred_city) {
    return current;
  }

  return { ...current, city: settings.preferred_city };
}

function buildScenarioCase(title: string, resale: number, totalCost: number, netProfit: number): ScenarioCase {
  const margin = Math.round((netProfit / Math.max(1, totalCost)) * 100);
  const tone: Tone = netProfit >= 700 ? "positive" : netProfit >= 250 ? "neutral" : "warning";
  const verdict = netProfit >= 700 ? "Guclu" : netProfit >= 250 ? "Sinirda" : "Zayif";

  return {
    title,
    resale,
    totalCost,
    netProfit,
    margin,
    verdict,
    tone,
  };
}
