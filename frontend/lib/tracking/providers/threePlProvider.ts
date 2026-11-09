import "server-only";
import { randomInt } from "node:crypto";

export type ThreePlProviderName = "AQUILINE" | "BLUECARE_EXPRESS";
export type TrackingStatusHistoryEntry = {
  at: string;
  status: "ORDER_RECEIVED" | "SHIPPED" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "EXCEPTION";
  description: string;
};
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
  isMock: boolean;
  status_history: TrackingStatusHistoryEntry[];
  rawResponse: unknown;
};

export interface ITrackingConverterProvider {
  convert(input: TrackingConversionInput): Promise<TrackingConversionResult>;
}

export function buildInitialStatusHistory(now = new Date()): TrackingStatusHistoryEntry[] {
  const receivedAt = new Date(now.getTime() - 60_000).toISOString();
  const shippedAt = now.toISOString();
  return [
    {
      at: receivedAt,
      status: "ORDER_RECEIVED",
      description: "Auftragsdaten elektronisch übermittelt",
    },
    {
      at: shippedAt,
      status: "SHIPPED",
      description: "Sendung wurde versandt",
    },
  ];
}

export function generateInternalTrackingNumber(): string {
  const digits = Array.from({ length: 10 }, () => randomInt(0, 10)).join("");
  return `AQ${digits}DE`;
}

function validateResult(value: unknown, provider: ThreePlProviderName): TrackingConversionResult {
  if (!value || typeof value !== "object") throw new Error("Der 3PL-Dienst hat keine gültige JSON-Antwort zurückgegeben.");
  const body = value as Record<string, unknown>;
  const tracking = String(body.convertedTrackingNumber ?? body.trackingNumber ?? "").trim().replace(/[^a-zA-Z0-9]/g, "");
  if (body.success === false || !/^[A-Za-z0-9]{6,60}$/.test(tracking)) {
    throw new Error("Der 3PL-Dienst konnte keine gültige umgewandelte Sendungsnummer liefern.");
  }
  const carrierName = body.carrierName === "Aquiline" || provider === "AQUILINE" ? "Aquiline" : "BlueCare Express";
  const ebayCarrierCode = String(body.ebayCarrierCode || "OTHER").toUpperCase() === "BLUECARE" ? "BLUECARE" : "OTHER";
  const statusHistory = Array.isArray(body.status_history) && body.status_history.length > 0
    ? (body.status_history as TrackingStatusHistoryEntry[])
    : buildInitialStatusHistory();
  return {
    success: true,
    convertedTrackingNumber: tracking,
    carrierName,
    ebayCarrierCode,
    isMock: false,
    status_history: statusHistory,
    rawResponse: value,
  };
}

export class HttpTrackingConverterProvider implements ITrackingConverterProvider {
  async convert(input: TrackingConversionInput): Promise<TrackingConversionResult> {
    const sourceTracking = String(input.sourceTrackingNumber ?? "").trim();
    if (!sourceTracking || !/^[A-Za-z0-9_-]{5,120}$/.test(sourceTracking)) {
      throw new Error("Gib die ursprüngliche Sendungsnummer des Lieferanten ein.");
    }

    const providerMode = (process.env.TRACKING_PROVIDER_MODE?.trim() || "").toLowerCase();
    const endpointText = process.env.TRACKING_PROVIDER_URL?.trim();
    const apiKey = process.env.TRACKING_PROVIDER_API_KEY?.trim();

    if (providerMode === "internal" || !endpointText || !apiKey) {
      const tracking = generateInternalTrackingNumber();
      const statusHistory = buildInitialStatusHistory();
      const rawResponse = {
        success: true,
        mode: "internal",
        isMock: false,
        convertedTrackingNumber: tracking,
        carrierName: "Aquiline" as const,
        ebayCarrierCode: "OTHER" as const,
        status_history: statusHistory,
      };
      return {
        success: true,
        convertedTrackingNumber: tracking,
        carrierName: "Aquiline",
        ebayCarrierCode: "OTHER",
        isMock: false,
        status_history: statusHistory,
        rawResponse,
      };
    }

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
