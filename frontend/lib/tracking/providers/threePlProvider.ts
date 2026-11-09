import "server-only";

export type ThreePlProviderName = "AQUILINE" | "BLUECARE_EXPRESS";
export type TrackingConversionInput = {
  sourceTrackingNumber: string;
  amazonShareUrl?: string;
  recipientZip: string;
  recipientCity: string;
  recipientCountry: "DE";
  ebayOrderId: string;
  provider: ThreePlProviderName;
};
export type TrackingConversionResult = {
  success: boolean;
  convertedTrackingNumber: string;
  carrierName: "Aquiline" | "BlueCare Express";
  ebayCarrierCode: "OTHER" | "BLUECARE";
  rawResponse: unknown;
};

export interface ITrackingConverterProvider {
  convert(input: TrackingConversionInput): Promise<TrackingConversionResult>;
}

function validateResult(value: unknown, provider: ThreePlProviderName): TrackingConversionResult {
  if (!value || typeof value !== "object") throw new Error("Der 3PL-Dienst hat keine gültige JSON-Antwort zurückgegeben.");
  const body = value as Record<string, unknown>;
  const tracking = String(body.convertedTrackingNumber ?? body.trackingNumber ?? "").trim().replace(/[^a-zA-Z0-9]/g, "");
  if (body.success === false || !/^[A-Za-z0-9]{6,60}$/.test(tracking)) {
    throw new Error("Der 3PL-Dienst konnte keine gültige umgewandelte Sendungsnummer liefern.");
  }
  const carrierName = provider === "AQUILINE" ? "Aquiline" : "BlueCare Express";
  // The current order UI and existing integration deliberately use eBay's
  // generic Other carrier until eBay confirms a dedicated carrier code.
  const ebayCarrierCode = String(body.ebayCarrierCode || "OTHER").toUpperCase() === "BLUECARE" ? "BLUECARE" : "OTHER";
  return { success: true, convertedTrackingNumber: tracking, carrierName, ebayCarrierCode, rawResponse: value };
}

export class HttpTrackingConverterProvider implements ITrackingConverterProvider {
  async convert(input: TrackingConversionInput): Promise<TrackingConversionResult> {
    const mockMode = /^(1|true|yes)$/i.test(process.env.TRACKING_MOCK_MODE?.trim() || "false");
    if (mockMode) {
      const digits = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join("");
      const tracking = `AQ${digits}DE`;
      return validateResult({ success: true, convertedTrackingNumber: tracking, provider: input.provider, sandbox: true }, input.provider);
    }

    const endpointText = process.env.TRACKING_PROVIDER_URL?.trim();
    const apiKey = process.env.TRACKING_PROVIDER_API_KEY?.trim();
    if (!endpointText || !apiKey) throw new Error("Der Tracking-Provider ist noch nicht konfiguriert.");
    let endpoint: URL;
    try { endpoint = new URL(endpointText); } catch { throw new Error("TRACKING_PROVIDER_URL ist ungültig."); }
    if (endpoint.protocol !== "https:") throw new Error("Der Tracking-Provider muss über HTTPS erreichbar sein.");

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) throw new Error(`Der Tracking-Provider hat HTTP ${response.status} zurückgegeben.`);
    return validateResult(await response.json().catch(() => null), input.provider);
  }
}

export const trackingConverterProvider: ITrackingConverterProvider = new HttpTrackingConverterProvider();
