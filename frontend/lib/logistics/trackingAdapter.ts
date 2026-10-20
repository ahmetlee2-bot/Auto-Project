import "server-only";

export type TrackingProvider = "BLUECARE_EXPRESS" | "AQUILINE";
export type TrackingMode = "direct" | "adapter";

export type TrackingOrderContext = {
  orderId: string;
  marketplaceId: string;
  lineItems: Array<{ lineItemId: string; quantity: number; title?: string }>;
};

export type ResolvedTracking = {
  trackingNumber: string;
  ebayCarrierCode: string;
  provider: TrackingProvider | null;
};

const EBAY_CARRIERS: Record<string, string> = {
  DHL: "DHL",
  DPD: "DPD",
  HERMES: "Hermes",
  GLS: "GLS",
  UPS: "UPS",
  FEDEX: "FedEx",
  USPS: "USPS",
  ROYAL_MAIL: "Royal Mail",
  DEUTSCHE_POST: "Deutsche Post",
  AUSTRALIA_POST: "Australia Post",
  CANADA_POST: "Canada Post",
  ARAMEX: "ARAMEX",
  OTHER: "Other",
};

const CUSTOM_3PL_CARRIERS: Record<string, TrackingProvider> = {
  BLUECARE_EXPRESS: "BLUECARE_EXPRESS",
  AQUILINE: "AQUILINE",
};

function validateTrackingNumber(value: unknown): string {
  const trackingNumber = String(value ?? "").trim();
  // eBay's order API documents alphanumeric tracking identifiers. Do not
  // silently rewrite separators or send a supplier number as another carrier.
  if (!/^[A-Za-z0-9]{6,60}$/.test(trackingNumber)) {
    throw new Error("Gib eine echte Sendungsnummer mit 6–60 Buchstaben oder Ziffern ein.");
  }
  return trackingNumber;
}

function normalizeEbayCarrier(value: unknown): string {
  const raw = String(value ?? "").trim();
  const key = raw.toUpperCase().replace(/[\s-]+/g, "_");
  if (EBAY_CARRIERS[key]) return EBAY_CARRIERS[key];

  // These are 3PL/provider names, not eBay carrier codes. If eBay does not
  // expose a dedicated value, use its documented generic "Other" carrier.
  if (CUSTOM_3PL_CARRIERS[key] || /^(BLUECARE(?:_EXPRESS)?|AQUILINE)$/.test(key)) return "Other";
  throw new Error("Der eBay-Trägercode wird nicht unterstützt. Wähle einen eBay-Träger oder Other.");
}

export async function resolveTracking(input: {
  mode: TrackingMode;
  carrierCode?: unknown;
  trackingNumber?: unknown;
  provider?: unknown;
  sourceTrackingId?: unknown;
  order: TrackingOrderContext;
}): Promise<ResolvedTracking> {
  if (input.mode === "direct") {
    const trackingNumber = validateTrackingNumber(input.trackingNumber);
    const carrierInput = String(input.carrierCode ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
    const provider = CUSTOM_3PL_CARRIERS[carrierInput] || null;
    return {
      trackingNumber,
      ebayCarrierCode: normalizeEbayCarrier(carrierInput),
      provider,
    };
  }

  if (input.mode !== "adapter") throw new Error("Wähle Direktmodus oder 3PL-Adapter.");

  const providerInput = String(input.provider ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  const provider = CUSTOM_3PL_CARRIERS[providerInput];
  if (!provider) throw new Error("Wähle BlueCare Express oder Aquiline als 3PL-Anbieter.");
  const sourceTrackingId = String(input.sourceTrackingId ?? "").trim();
  if (!/^[A-Za-z0-9-]{5,100}$/.test(sourceTrackingId)) {
    throw new Error("Gib die ursprüngliche Sendungsnummer des Lieferanten ein.");
  }

  const endpointText = process.env.LOGISTICS_3PL_API_URL?.trim();
  const apiKey = process.env.LOGISTICS_3PL_API_KEY?.trim();
  if (!endpointText || !apiKey) {
    throw new Error("Der 3PL-Adapter ist noch nicht konfiguriert. Nutze den Direktmodus oder konfiguriere LOGISTICS_3PL_API_URL und LOGISTICS_3PL_API_KEY auf dem Server.");
  }

  let endpoint: URL;
  try { endpoint = new URL(endpointText); } catch { throw new Error("LOGISTICS_3PL_API_URL ist ungültig."); }
  if (endpoint.protocol !== "https:") throw new Error("Der 3PL-Endpunkt muss HTTPS verwenden.");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      provider,
      order: input.order,
      originalSupplierTrackingId: sourceTrackingId,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Der 3PL-Dienst hat HTTP ${response.status} zurückgegeben.`);

  const result = await response.json().catch(() => null) as {
    trackingNumber?: unknown;
    carrierCode?: unknown;
    provider?: unknown;
  } | null;
  if (!result) throw new Error("Der 3PL-Dienst hat keine gültige JSON-Antwort zurückgegeben.");

  const resolvedProviderInput = String(result.provider || provider).trim().toUpperCase().replace(/[\s-]+/g, "_");
  const resolvedProvider = CUSTOM_3PL_CARRIERS[resolvedProviderInput] || provider;
  return {
    trackingNumber: validateTrackingNumber(result.trackingNumber),
    ebayCarrierCode: normalizeEbayCarrier(result.carrierCode || "OTHER"),
    provider: resolvedProvider,
  };
}
