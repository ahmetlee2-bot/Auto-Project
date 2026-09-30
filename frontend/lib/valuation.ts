import type {
  AnalyzeRequest,
  AnalyzeResponse,
  AppSettings,
  PortfolioDeal,
  SavedDeal,
  SearchProfile,
} from "./api";

export type SourceKey = "Kleinanzeigen" | "AutoScout24" | "Marketplace";
export type FuelOption = "Benzin" | "Diesel" | "Hybrid";
export type TransmissionOption = "Schaltgetriebe" | "Automatik";
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
    hint: "Direkte Analyse über die aktuelle Schnittstelle.",
  },
  {
    key: "AutoScout24",
    label: "AutoScout24",
    analyzeSource: "Mobile.de",
    hint: "Wird derzeit über die mobile.de-Schnittstelle analysiert.",
  },
  {
    key: "Marketplace",
    label: "Marketplace",
    analyzeSource: "Facebook Marketplace",
    hint: "Bei Inseraten aus sozialen Marktplätzen können Angaben fehlen.",
  },
];

export const fuelOptions: FuelOption[] = ["Benzin", "Diesel", "Hybrid"];
export const transmissionOptions: TransmissionOption[] = ["Schaltgetriebe", "Automatik"];
export const cityOptions = [
  "Hamburg",
  "Berlin",
  "München",
  "Bremen",
  "Hannover",
];

export function createInitialFormState(
  preferredCity = "Hamburg",
): ValuationFormState {
  return {
    brand: "VW",
    model: "Golf",
    year: 2008,
    km: 156000,
    fuel: "Benzin",
    transmission: "Schaltgetriebe",
    city: preferredCity,
    askingPrice: 4290,
    source: "Kleinanzeigen",
    rawText: "",
    url: "",
  };
}

export function createSampleFormState(
  preferredCity = "Hamburg",
): ValuationFormState {
  return {
    brand: "VW",
    model: "Golf",
    year: 2008,
    km: 156000,
    fuel: "Benzin",
    transmission: "Schaltgetriebe",
    city: preferredCity,
    askingPrice: 4290,
    source: "Kleinanzeigen",
    rawText:
      "VW Golf 1.6 Trendline, 2008, 156.000 km, Schaltgetriebe, Klimaanlage, neuer TÜV. Hamburg. Lackschaden an der linken hinteren Tür, Preis verhandelbar.",
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

export function calculateEstimate(
  input: ValuationFormState,
): ValuationEstimate {
  const agePenalty = Math.max(0, REFERENCE_YEAR - input.year) * 85;
  const kmPenalty = Math.max(0, input.km - 120000) * 0.018;
  const fuelAdjustment =
    input.fuel === "Diesel" ? 260 : input.fuel === "Hybrid" ? 540 : 0;
  const transmissionAdjustment = input.transmission === "Automatik" ? 420 : 0;
  const cityAdjustment =
    input.city === "München"
      ? 450
      : input.city === "Berlin"
        ? 180
        : input.city === "Hamburg"
          ? 130
          : 0;

  const base =
    6100 -
    agePenalty -
    kmPenalty +
    fuelAdjustment +
    transmissionAdjustment +
    cityAdjustment;
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
      ? "Gute Kaufgelegenheit"
      : input.askingPrice <= fair
        ? "Prüfung empfohlen"
        : "Zu teuer";

  const risk =
    input.km > 190000 ? "Hoch" : input.year < 2007 ? "Mittel" : "Niedrig";

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

export function buildComparables(
  form: ValuationFormState,
  estimate: ValuationEstimate,
): ComparableListing[] {
  const comparableSources: SourceKey[] = [
    form.source,
    "AutoScout24",
    "Marketplace",
  ];

  return [
    {
      id: "upper-band",
      title: `${form.brand} ${form.model} 1.6 Comfort`,
      year: form.year,
      km: Math.max(88000, form.km - 19000),
      price: estimate.high,
      tag: "Oberes Marktsegment",
      source: comparableSources[0],
      deltaToFair: estimate.high - estimate.fair,
    },
    {
      id: "fair-band",
      title: `${form.brand} ${form.model} Trendline`,
      year: Math.max(2005, form.year - 1),
      km: form.km,
      price: estimate.fair,
      tag: "Mittleres Marktsegment",
      source: comparableSources[1],
      deltaToFair: 0,
    },
    {
      id: "lower-band",
      title: `${form.brand} ${form.model} Basis`,
      year: Math.max(2004, form.year - 2),
      km: Math.min(265000, form.km + 27000),
      price: estimate.low,
      tag: "Unteres Marktsegment",
      source: comparableSources[2],
      deltaToFair: estimate.low - estimate.fair,
    },
  ];
}

export function buildScenarios(
  form: ValuationFormState,
  estimate: ValuationEstimate,
): ScenarioCase[] {
  const conservativeResale = estimate.fastSale;
  const conservativeCost =
    form.askingPrice +
    estimate.prep +
    220 +
    Math.round((estimate.fastSale * 0.07) / 10) * 10;
  const conservativeProfit = conservativeResale - conservativeCost;

  const baseResale = estimate.resale;
  const baseCost = estimate.totalCost;
  const baseProfit = estimate.netProfit;

  const upsideResale = estimate.high;
  const upsideCost =
    form.askingPrice +
    Math.max(220, estimate.prep - 80) +
    120 +
    Math.round((estimate.high * 0.055) / 10) * 10;
  const upsideProfit = upsideResale - upsideCost;

  return [
    buildScenarioCase(
      "Konservativ",
      conservativeResale,
      conservativeCost,
      conservativeProfit,
    ),
    buildScenarioCase("Basisszenario", baseResale, baseCost, baseProfit),
    buildScenarioCase("Optimistisch", upsideResale, upsideCost, upsideProfit),
  ];
}

export function getLocalBuyBoxSignal(
  form: ValuationFormState,
  estimate: ValuationEstimate,
): LocalBuyBoxSignal {
  if (form.askingPrice <= estimate.buyBox && estimate.margin >= 12) {
    return {
      status: "fit",
      title: "Kaufrahmen passt",
      nextStep:
        "Wenn Fahrzeughistorie und Anbieter plausibel sind, eine Besichtigung vereinbaren und nach der Prüfung ein Angebot abgeben.",
      notes: [
        "Der Angebotspreis liegt unter deiner Kaufpreisgrenze.",
        "Nettogewinn und Marge erreichen den Zielwert.",
        "Die geschätzten Vorbereitungskosten bleiben im Rahmen.",
      ],
      tone: "positive",
    };
  }

  if (form.askingPrice <= estimate.fair) {
    return {
      status: "review",
      title: "Weitere Prüfung empfohlen",
      nextStep:
        "Vor einem verbindlichen Angebot Fahrzeugzustand, TÜV und Technik vor Ort prüfen.",
      notes: [
        "Der Angebotspreis liegt nahe am Marktwert und lässt begrenzten Verhandlungsspielraum.",
        "Vorbereitungskosten und Gebühren können den Gewinn deutlich verringern.",
        "Die lokale Schätzung sollte mit aktuellen Marktdaten verglichen werden.",
      ],
      tone: "warning",
    };
  }

  return {
    status: "out",
    title: "Außerhalb des Kaufrahmens",
    nextStep: "Prüfe das Fahrzeug erneut, wenn der Preis deutlich sinkt.",
    notes: [
      "Der Angebotspreis liegt deutlich über dem Marktwert.",
      "Die Marge könnte unter deinen Zielwert fallen.",
      "Vergleichsangebote stützen ein niedrigeres Preisniveau.",
    ],
    tone: "warning",
  };
}

export function buildSummaryCards(
  watchlist: SavedDeal[],
  portfolio: PortfolioDeal[],
): SummaryCardData[] {
  const activePortfolio = portfolio.filter((deal) => deal.status !== "sold");
  const expectedProfit = activePortfolio.reduce(
    (total, deal) => total + deal.net_profit,
    0,
  );
  const capital = activePortfolio.reduce(
    (total, deal) => total + deal.total_cost,
    0,
  );

  return [
    {
      label: "Merkliste",
      value: String(watchlist.length),
      detail: "Gespeicherte Angebote",
    },
    {
      label: "Aktives Portfolio",
      value: String(activePortfolio.length),
      detail: "Ankauf und Aufbereitung",
    },
    {
      label: "Erwarteter Gewinn",
      value: formatCurrency(expectedProfit),
      detail: "Summe offener Angebote",
    },
    {
      label: "Sermaye",
      value: formatCurrency(capital),
      detail: "Gebundenes Gesamtkapital",
    },
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
  const activePortfolio = input.portfolio.filter(
    (deal) => deal.status !== "sold",
  );
  const activeSearchProfiles = input.searchProfiles.filter(
    (profile) => profile.active,
  ).length;

  return [
    {
      label: "Datenquelle",
      value: adapter.label,
      detail: `Analyseschnittstelle: ${adapter.analyzeSource}`,
      tone: "neutral",
    },
    {
      label: "Kaufempfehlung",
      value: input.result
        ? buyBoxLabel(input.result.buy_box_status)
        : buyBoxLabel(localSignal.status),
      detail: input.result ? input.result.next_action : localSignal.nextStep,
      tone: input.result
        ? input.result.buy_box_status === "fit"
          ? "positive"
          : "warning"
        : localSignal.tone,
    },
    {
      label: "Serveranalyse",
      value: input.result
        ? `${input.result.confidence_score}/100`
        : "Vorschau",
      detail: input.result
        ? `${input.result.source_parser} parser active`
        : "Lokale Schätzung bereit. Für die Serveranalyse bitte das Angebot analysieren.",
      tone: input.result ? "positive" : "neutral",
    },
    {
      label: "Gespeicherte Daten",
      value: `${input.watchlist.length} / ${activePortfolio.length}`,
      detail: `${activeSearchProfiles} aktive Suchprofile auf dem Server.`,
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
    return "Kaufrahmen passt";
  }
  if (status === "review") {
    return "Prüfen";
  }
  return "Außerhalb des Kaufrahmens";
}

export function applyPreferredCity(
  current: ValuationFormState,
  settings: AppSettings,
): ValuationFormState {
  if (current.city !== "Hamburg" && current.city !== settings.preferred_city) {
    return current;
  }

  return { ...current, city: settings.preferred_city };
}

function buildScenarioCase(
  title: string,
  resale: number,
  totalCost: number,
  netProfit: number,
): ScenarioCase {
  const margin = Math.round((netProfit / Math.max(1, totalCost)) * 100);
  const tone: Tone =
    netProfit >= 700 ? "positive" : netProfit >= 250 ? "neutral" : "warning";
  const verdict =
    netProfit >= 700 ? "Attraktiv" : netProfit >= 250 ? "Knapp" : "Schwach";

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
