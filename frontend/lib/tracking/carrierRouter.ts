export type TrackingMode = "direct" | "adapter";
export type SuggestedCarrier = "DHL" | "DPD" | "HERMES" | "GLS" | "AQUILINE" | "BLUECARE_EXPRESS";

export type CarrierRoute = {
  mode: TrackingMode;
  carrierCode?: SuggestedCarrier;
  provider?: "AQUILINE" | "BLUECARE_EXPRESS";
  trackingNumber: string;
  sourceTrackingId: string;
  amazonShareUrl?: string;
  usesCredit: boolean;
};

const AMAZON_LINK = /^https?:\/\/(?:www\.)?(?:amazon\.[^/]+\/(?:.*(?:swiship|progress-tracker)|.*\/gp\/your-account\/ship-track[^\s]*)|(?:[a-z0-9-]+\.)?swiship\.[^/]+\/)/i;

export function extractAmazonShareUrl(value: string): string | undefined {
  const match = value.match(/https?:\/\/[^\s]+/i)?.[0];
  return match && AMAZON_LINK.test(match) ? match.replace(/[),.;]+$/, "") : undefined;
}

export function routeSupplierTracking(value: string, preferredProvider: "AQUILINE" | "BLUECARE_EXPRESS" = "BLUECARE_EXPRESS"): CarrierRoute {
  const raw = value.trim();
  const compact = raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const amazonShareUrl = extractAmazonShareUrl(raw);
  if (amazonShareUrl || /^(?:TBA|AMZN|DE)[A-Z0-9-]{6,}$/.test(compact)) {
    return {
      mode: "adapter", provider: preferredProvider, sourceTrackingId: compact || raw,
      trackingNumber: "", amazonShareUrl, usesCredit: true,
    };
  }

  // The supplied format rules overlap at 14 digits. Prefer DPD's exact-length
  // signature there; DHL prefixes and the remaining DHL range are handled next.
  if (/^JJD[A-Z0-9]{9,17}$/.test(compact) || (/^\d{12,20}$/.test(compact) && compact.length !== 14)) {
    return { mode: "direct", carrierCode: "DHL", trackingNumber: compact, sourceTrackingId: raw, usesCredit: false };
  }
  if (/^H[A-Z0-9]{8,30}$/.test(compact) || /^\d{14}$/.test(compact)) {
    return { mode: "direct", carrierCode: /^H/.test(compact) ? "HERMES" : "DPD", trackingNumber: compact, sourceTrackingId: raw, usesCredit: false };
  }
  if (/^\d{11,12}$/.test(compact)) {
    return { mode: "direct", carrierCode: "GLS", trackingNumber: compact, sourceTrackingId: raw, usesCredit: false };
  }
  if (/^(?:TBA|AMZN|DE)[A-Z0-9-]+$/.test(compact)) {
    return { mode: "adapter", provider: preferredProvider, sourceTrackingId: compact, trackingNumber: "", usesCredit: true };
  }
  return { mode: "direct", trackingNumber: compact, sourceTrackingId: raw, usesCredit: false };
}
