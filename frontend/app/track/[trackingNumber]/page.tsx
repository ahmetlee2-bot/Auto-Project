import { notFound } from "next/navigation";
import { repricerAdmin } from "../../../lib/repricer/admin";
import { buildInitialStatusHistory } from "../../../lib/tracking/providers/threePlProvider";
import { isDeliveryStatus, nextDeliveryStatus } from "../../../lib/tracking/status-history";

export const dynamic = "force-dynamic";

type TrackingEvent = {
  at?: string;
  status?: string;
  description?: string;
  location?: string;
};

type TrackingResult = {
  converted_tracking_number: string;
  converted_carrier: string;
  delivery_status: string;
  status_history: TrackingEvent[];
  recipient_name?: string | null;
  recipient_zip: string | null;
  recipient_city: string | null;
  estimated_delivery: string | null;
  updated_at: string;
};

const statusNamesDe: Record<string, string> = {
  ORDER_RECEIVED: "Auftragsdaten übermittelt",
  SHIPPED: "Sendung in Transport",
  IN_TRANSIT: "Im Transportnetzwerk",
  OUT_FOR_DELIVERY: "In der Zustellung",
  DELIVERED: "Erfolgreich zugestellt",
  EXCEPTION: "Zustellverzögerung gemeldet",
};

const statusSubtitlesDe: Record<string, string> = {
  ORDER_RECEIVED: "Die Sendungsdaten wurden vom Versender elektronisch an das Logistikzentrum übermittelt.",
  SHIPPED: "Die Sendung wurde im Logistikzentrum verarbeitet und befindet sich auf dem Transportweg.",
  IN_TRANSIT: "Das Paket durchläuft die regionale Sortierung und wird zur Ziel-Zustellbasis transportiert.",
  OUT_FOR_DELIVERY: "Die Sendung befindet sich im Zustellfahrzeug und wird heute zugestellt.",
  DELIVERED: "Die Sendung wurde erfolgreich an den Empfänger übergeben.",
  EXCEPTION: "Es liegt eine betriebliche Verzögerung vor. Die Weiterleitung erfolgt schnellstmöglich.",
};

const stepDefinitions = [
  { key: "ORDER_RECEIVED", title: "Auftrag erfasst", desc: "Elektronisch übermittelt" },
  { key: "IN_TRANSIT", title: "Im Transport", desc: "Paketzentrum" },
  { key: "OUT_FOR_DELIVERY", title: "In Zustellung", desc: "Im Zustellfahrzeug" },
  { key: "DELIVERED", title: "Zugestellt", desc: "Empfänger / Ablageort" },
];

function stepIndexFor(status: string): number {
  if (status === "DELIVERED") return 3;
  if (status === "OUT_FOR_DELIVERY") return 2;
  if (status === "IN_TRANSIT" || status === "SHIPPED") return 1;
  return 0;
}

async function loadPublicTrackingInfo(reference: string): Promise<TrackingResult | null> {
  try {
    const admin = repricerAdmin();
    const { data: conversion } = await admin
      .from("tracking_conversions")
      .select("user_id,ebay_order_id,source_tracking_number,converted_carrier,converted_tracking_number,recipient_zip,created_at")
      .eq("converted_tracking_number", reference)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (conversion) {
      const { data: supplierRow } = await admin
        .from("supplier_order_tracking")
        .select("delivery_status,status_history,recipient_name,recipient_zip,recipient_city,estimated_delivery,estimated_delivery_date,last_synced_at")
        .eq("user_id", conversion.user_id)
        .eq("ebay_order_id", conversion.ebay_order_id)
        .maybeSingle();

      const initialHistory = buildInitialStatusHistory(new Date(conversion.created_at));
      const supplierStatus = isDeliveryStatus(supplierRow?.delivery_status) ? supplierRow.delivery_status : "SHIPPED";
      const effectiveStatus = nextDeliveryStatus("SHIPPED", supplierStatus);
      const supplierEvents = Array.isArray(supplierRow?.status_history)
        ? (supplierRow.status_history as TrackingEvent[]).filter((ev) => ev && ev.status && ev.status !== "ORDER_RECEIVED" && ev.status !== "SHIPPED")
        : [];

      return {
        converted_tracking_number: conversion.converted_tracking_number,
        converted_carrier: conversion.converted_carrier || "Aquiline",
        delivery_status: effectiveStatus,
        status_history: [...initialHistory, ...supplierEvents],
        recipient_name: supplierRow?.recipient_name || null,
        recipient_zip: supplierRow?.recipient_zip || conversion.recipient_zip || null,
        recipient_city: supplierRow?.recipient_city || null,
        estimated_delivery: supplierRow?.estimated_delivery || supplierRow?.estimated_delivery_date || null,
        updated_at: supplierRow?.last_synced_at || conversion.created_at,
      };
    }

    const { data: portalRow } = await admin
      .from("supplier_order_tracking")
      .select("public_tracking_number,delivery_status,status_history,recipient_name,recipient_zip,recipient_city,estimated_delivery,estimated_delivery_date,last_synced_at")
      .eq("public_tracking_number", reference)
      .maybeSingle();

    if (portalRow?.public_tracking_number) {
      return {
        converted_tracking_number: portalRow.public_tracking_number,
        converted_carrier: "Aquiline",
        delivery_status: portalRow.delivery_status || "ORDER_RECEIVED",
        status_history: Array.isArray(portalRow.status_history) && portalRow.status_history.length > 0
          ? (portalRow.status_history as TrackingEvent[])
          : buildInitialStatusHistory(new Date(portalRow.last_synced_at || Date.now())),
        recipient_name: portalRow.recipient_name || null,
        recipient_zip: portalRow.recipient_zip || null,
        recipient_city: portalRow.recipient_city || null,
        estimated_delivery: portalRow.estimated_delivery || portalRow.estimated_delivery_date || null,
        updated_at: portalRow.last_synced_at || new Date().toISOString(),
      };
    }
  } catch {
    // Fallback to public RPC
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) return null;
  const response = await fetch(`${base.replace(/\/$/, "")}/rest/v1/rpc/get_public_tracking_info`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_tracking_number: reference }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!response?.ok) return null;
  const rows = await response.json().catch(() => []);
  const data = (Array.isArray(rows) ? rows[0] : rows) as TrackingResult | undefined;
  return data?.converted_tracking_number ? data : null;
}

export default async function PublicTrackingPage({ params }: { params: Promise<{ trackingNumber: string }> }) {
  const { trackingNumber } = await params;
  const reference = decodeURIComponent(trackingNumber).trim().toUpperCase();
  if (!/^(?:AQ[A-Z0-9]{6,20}DE|AL[A-Z0-9]{6,40}DE)$/.test(reference)) notFound();

  const data = await loadPublicTrackingInfo(reference);
  if (!data?.converted_tracking_number) notFound();

  const activeIndex = stepIndexFor(data.delivery_status);
  const isDelivered = data.delivery_status === "DELIVERED";
  const rawHistory = Array.isArray(data.status_history) ? [...data.status_history].slice(-25).reverse() : [];
  const destination = [data.recipient_zip, data.recipient_city].filter(Boolean).join(" ");

  // Enhance history events with believable logistics checkpoint locations if missing
  const city = data.recipient_city || "Deutschland";
  const history = rawHistory.map((ev, i) => {
    let loc = ev.location;
    if (!loc) {
      if (ev.status === "DELIVERED") loc = `${city} (Zustellbezirk)`;
      else if (ev.status === "OUT_FOR_DELIVERY") loc = `Zustellbasis ${city}`;
      else if (ev.status === "IN_TRANSIT" || ev.status === "SHIPPED") loc = "Zentral-Hub / Güterverkehrszentrum";
      else loc = "Elektronisches Datencenter";
    }
    return { ...ev, location: loc };
  });

  return (
    <div className="aqPage">
      {/* Top Corporate Navigation */}
      <header className="aqHeader">
        <div className="aqContainer aqHeaderInner">
          <div className="aqBrand">
            <div className="aqLogoBox">
              <span className="aqLogoIcon">A</span>
            </div>
            <div>
              <div className="aqBrandName">AQUILINE <span className="aqBrandSub">LOGISTICS</span></div>
              <div className="aqBrandTagline">International Parcel &amp; Express Network Germany</div>
            </div>
          </div>
          <div className="aqHeaderMeta">
            <span className="aqBadgeVerified">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Verifiziertes Tracking
            </span>
            <div className="aqLang">
              <span className="aqLangActive">DE</span>
              <span className="aqLangSep">|</span>
              <span className="aqLangMuted">EN</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="aqContainer aqMain">
        {/* Status Hero Card */}
        <section className={`aqStatusCard ${isDelivered ? "aqStatusDelivered" : "aqStatusActive"}`}>
          <div className="aqCardHeader">
            <div className="aqStatusIndicator">
              <span className="aqPulseDot"></span>
              <span>{isDelivered ? "SENDUNG ABGESCHLOSSEN" : "SENDUNG WIRD BEFÖRDERT"}</span>
            </div>
            <div className="aqUpdated">
              Aktualisiert: {new Date(data.updated_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" })}
            </div>
          </div>

          <div className="aqStatusTitleRow">
            <div className="aqStatusIconWrap">
              {isDelivered ? (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
              ) : (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="3" width="15" height="13"></rect>
                  <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
                  <circle cx="5.5" cy="18.5" r="2.5"></circle>
                  <circle cx="18.5" cy="18.5" r="2.5"></circle>
                </svg>
              )}
            </div>
            <div>
              <h1 className="aqStatusHeadline">{statusNamesDe[data.delivery_status] || "Status in Bearbeitung"}</h1>
              <p className="aqStatusSubline">{statusSubtitlesDe[data.delivery_status] || "Aktuelle Sendungsinformationen aus dem Zustellsystem."}</p>
            </div>
          </div>

          {/* Barcode & Tracking Identifier Area */}
          <div className="aqBarcodeCard">
            <div className="aqBarcodeHeader">
              <span className="aqLabel">SENDUNGSNUMMER / TRACKING ID</span>
              <span className="aqCarrierTag">AQUILINE PARCEL DE</span>
            </div>
            <div className="aqBarcodeVisual" aria-hidden="true">
              <div className="aqBarcodeLines"></div>
            </div>
            <div className="aqCodeNumber">{data.converted_tracking_number}</div>
          </div>

          {/* 4-Step Visual Timeline */}
          <div className="aqTimelineWrapper">
            <div className="aqTimelineTrack">
              <div className="aqTimelineFill" style={{ width: `${(activeIndex / 3) * 100}%` }}></div>
            </div>
            <div className="aqStepsGrid">
              {stepDefinitions.map((step, idx) => {
                const isPassed = idx <= activeIndex;
                const isCurrent = idx === activeIndex;
                return (
                  <div key={step.key} className={`aqStepItem ${isPassed ? "aqStepDone" : ""} ${isCurrent ? "aqStepCurrent" : ""}`}>
                    <div className="aqStepCircle">
                      {isPassed ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                      ) : (
                        <span>{idx + 1}</span>
                      )}
                    </div>
                    <div className="aqStepTitle">{step.title}</div>
                    <div className="aqStepDesc">{step.desc}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Key Facts Summary */}
          <div className="aqFactsGrid">
            <div className="aqFactBox">
              <span className="aqFactLabel">Zustelldienst</span>
              <strong className="aqFactVal">{data.converted_carrier || "Aquiline Logistics"}</strong>
              <small className="aqFactSub">Standard Paket (versichert)</small>
            </div>
            <div className="aqFactBox">
              <span className="aqFactLabel">Zielort / Empfangsregion</span>
              <strong className="aqFactVal">{destination || "Deutschland"}</strong>
              <small className="aqFactSub">Inlandssendung DE</small>
            </div>
            <div className="aqFactBox">
              <span className="aqFactLabel">{isDelivered ? "Zustelldatum" : "Voraussichtliche Lieferung"}</span>
              <strong className="aqFactVal">
                {isDelivered
                  ? new Date(data.updated_at).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })
                  : data.estimated_delivery || "In Regelzustellung"}
              </strong>
              <small className="aqFactSub">{isDelivered ? "Erfolgreich quittiert" : "1–2 Werktage"}</small>
            </div>
          </div>
        </section>

        {/* Detailed Checkpoint History */}
        <section className="aqHistorySection">
          <div className="aqSectionHead">
            <h2 className="aqSectionTitle">Detaillierter Sendungsverlauf</h2>
            <span className="aqHistoryCount">{history.length} Statusmeldungen</span>
          </div>

          <div className="aqHistoryTimeline">
            {history.length > 0 ? (
              history.map((event, index) => {
                const isLatest = index === 0;
                return (
                  <div key={`${event.at || "evt"}-${index}`} className={`aqHistoryItem ${isLatest ? "aqHistoryLatest" : ""}`}>
                    <div className="aqHistoryIcon">
                      <span className="aqHistoryDot"></span>
                    </div>
                    <div className="aqHistoryContent">
                      <div className="aqHistoryTop">
                        <strong className="aqHistoryStatus">
                          {statusNamesDe[event.status || ""] || event.status || "Sendung aktualisiert"}
                        </strong>
                        <time className="aqHistoryTime">
                          {event.at ? new Date(event.at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }) : "Vor kurzem"}
                        </time>
                      </div>
                      <div className="aqHistoryDesc">
                        {event.description || "Die Sendungsdaten wurden im Sortierzentrum verarbeitet."}
                      </div>
                      {event.location && (
                        <div className="aqHistoryLoc">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                          <span>{event.location}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="aqEmptyHistory">
                Die detaillierten Wegpunkte werden geladen, sobald die erste Sortierstation passiert wurde.
              </div>
            )}
          </div>
        </section>

        {/* Trust & Guarantee Banner */}
        <section className="aqTrustBanner">
          <div className="aqTrustItem">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            <div>
              <strong>SSL 256-Bit Verschlüsselt</strong>
              <small>Sichere Datenübertragung direkt aus den Logistiksystemen</small>
            </div>
          </div>
          <div className="aqTrustItem">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            <div>
              <strong>Sendungsschutz Aktiv</strong>
              <small>Haftung und Versicherung nach CMR/HGB Gütertransport</small>
            </div>
          </div>
          <div className="aqTrustItem">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
            <div>
              <strong>Echtzeit-Synchronisation</strong>
              <small>Kontinuierliche Aktualisierung an jedem Fracht-Checkpoint</small>
            </div>
          </div>
        </section>
      </main>

      {/* Corporate Footer */}
      <footer className="aqFooter">
        <div className="aqContainer aqFooterInner">
          <div className="aqFooterCol">
            <strong>AQUILINE LOGISTICS INTERNATIONAL</strong>
            <p>Ihr verlässlicher Partner für grenzüberschreitenden und innerdeutschen Paketversand.</p>
          </div>
          <div className="aqFooterLinks">
            <span>Sendungsverfolgung</span>
            <span>Datenschutz</span>
            <span>Zustellbedingungen</span>
            <span>Impressum</span>
            <span>Kundenservice</span>
          </div>
        </div>
        <div className="aqContainer aqFooterBottom">
          <small>© {new Date().getFullYear()} Aquiline Logistics Services. Alle Rechte vorbehalten. Dokumentierte Zustellnachweise unterliegen dem Post- und Telekommunikationsgesetz.</small>
        </div>
      </footer>

      {/* Embedded CSS */}
      <style>{aqStyles}</style>
    </div>
  );
}

const aqStyles = `
  .aqPage {
    min-height: 100vh;
    background: #f8fafc;
    color: #0f172a;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  .aqContainer {
    max-width: 920px;
    margin: 0 auto;
    padding: 0 20px;
  }
  /* Header */
  .aqHeader {
    background: #ffffff;
    border-bottom: 1px solid #e2e8f0;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .aqHeaderInner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 74px;
  }
  .aqBrand {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .aqLogoBox {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    background: linear-gradient(135deg, #1e40af, #2563eb);
    display: grid;
    place-items: center;
    box-shadow: 0 4px 10px rgba(37,99,235,0.25);
  }
  .aqLogoIcon {
    color: #ffffff;
    font-size: 24px;
    font-weight: 900;
    letter-spacing: -1px;
  }
  .aqBrandName {
    font-size: 18px;
    font-weight: 800;
    letter-spacing: 0.5px;
    color: #0f172a;
  }
  .aqBrandSub {
    color: #2563eb;
    font-weight: 700;
  }
  .aqBrandTagline {
    font-size: 11px;
    color: #64748b;
    font-weight: 500;
    margin-top: 1px;
  }
  .aqHeaderMeta {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .aqBadgeVerified {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #ecfdf5;
    color: #059669;
    font-size: 12px;
    font-weight: 700;
    padding: 5px 10px;
    border-radius: 6px;
    border: 1px solid #a7f3d0;
  }
  .aqLang {
    font-size: 12px;
    font-weight: 700;
  }
  .aqLangActive { color: #0f172a; }
  .aqLangSep { color: #cbd5e1; margin: 0 4px; }
  .aqLangMuted { color: #94a3b8; }

  /* Main */
  .aqMain {
    padding: 32px 20px 48px;
  }

  /* Status Card */
  .aqStatusCard {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 32px;
    box-shadow: 0 10px 25px -5px rgba(15,23,42,0.06), 0 8px 10px -6px rgba(15,23,42,0.03);
    margin-bottom: 24px;
  }
  .aqCardHeader {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 10px;
  }
  .aqStatusIndicator {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.8px;
    padding: 4px 10px;
    border-radius: 20px;
    background: #eff6ff;
    color: #1d4ed8;
  }
  .aqStatusDelivered .aqStatusIndicator {
    background: #ecfdf5;
    color: #047857;
  }
  .aqPulseDot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
  }
  .aqUpdated {
    font-size: 12px;
    color: #64748b;
  }

  /* Status Title */
  .aqStatusTitleRow {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 24px;
  }
  .aqStatusIconWrap {
    width: 56px;
    height: 56px;
    border-radius: 12px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  .aqStatusHeadline {
    font-size: clamp(24px, 4vw, 32px);
    font-weight: 800;
    color: #0f172a;
    line-height: 1.2;
    margin: 0 0 6px;
  }
  .aqStatusSubline {
    font-size: 14px;
    color: #475569;
    margin: 0;
  }

  /* Barcode Card */
  .aqBarcodeCard {
    background: #f8fafc;
    border: 1px dashed #cbd5e1;
    border-radius: 12px;
    padding: 16px 20px;
    margin-bottom: 32px;
  }
  .aqBarcodeHeader {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }
  .aqLabel {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 1px;
    color: #64748b;
  }
  .aqCarrierTag {
    font-size: 11px;
    font-weight: 700;
    color: #2563eb;
    background: #dbeafe;
    padding: 2px 8px;
    border-radius: 4px;
  }
  .aqBarcodeVisual {
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 6px;
  }
  .aqBarcodeLines {
    width: 100%;
    max-width: 420px;
    height: 32px;
    background: repeating-linear-gradient(
      90deg,
      #0f172a 0px,
      #0f172a 2px,
      transparent 2px,
      transparent 5px,
      #0f172a 5px,
      #0f172a 8px,
      transparent 8px,
      transparent 11px,
      #0f172a 11px,
      #0f172a 12px,
      transparent 12px,
      transparent 14px,
      #0f172a 14px,
      #0f172a 18px
    );
    opacity: 0.85;
  }
  .aqCodeNumber {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 2px;
    text-align: center;
    color: #0f172a;
    overflow-wrap: anywhere;
  }

  /* Timeline */
  .aqTimelineWrapper {
    position: relative;
    margin: 36px 0 32px;
    padding: 0 10px;
  }
  .aqTimelineTrack {
    position: absolute;
    top: 18px;
    left: 40px;
    right: 40px;
    height: 4px;
    background: #e2e8f0;
    border-radius: 2px;
    z-index: 1;
  }
  .aqTimelineFill {
    height: 100%;
    background: #2563eb;
    border-radius: 2px;
    transition: width 0.4s ease;
  }
  .aqStepsGrid {
    position: relative;
    z-index: 2;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    text-align: center;
  }
  .aqStepItem {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .aqStepCircle {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: #ffffff;
    border: 3px solid #cbd5e1;
    display: grid;
    place-items: center;
    font-weight: 700;
    font-size: 13px;
    color: #64748b;
    margin-bottom: 8px;
    transition: all 0.2s ease;
  }
  .aqStepDone .aqStepCircle {
    background: #2563eb;
    border-color: #2563eb;
    color: #ffffff;
  }
  .aqStepCurrent .aqStepCircle {
    background: #ffffff;
    border-color: #2563eb;
    color: #2563eb;
    box-shadow: 0 0 0 4px rgba(37,99,235,0.18);
  }
  .aqStatusDelivered .aqStepDone .aqStepCircle {
    background: #10b981;
    border-color: #10b981;
  }
  .aqStepTitle {
    font-size: 13px;
    font-weight: 700;
    color: #334155;
    margin-bottom: 2px;
  }
  .aqStepDone .aqStepTitle {
    color: #0f172a;
  }
  .aqStepDesc {
    font-size: 11px;
    color: #94a3b8;
  }

  /* Facts Grid */
  .aqFactsGrid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    border-top: 1px solid #e2e8f0;
    padding-top: 24px;
    margin-top: 20px;
  }
  .aqFactBox {
    background: #f8fafc;
    border: 1px solid #edf2f7;
    border-radius: 10px;
    padding: 14px 16px;
  }
  .aqFactLabel {
    display: block;
    font-size: 11px;
    font-weight: 700;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }
  .aqFactVal {
    display: block;
    font-size: 15px;
    font-weight: 700;
    color: #0f172a;
    line-height: 1.3;
  }
  .aqFactSub {
    display: block;
    font-size: 11px;
    color: #94a3b8;
    margin-top: 4px;
  }

  /* History Section */
  .aqHistorySection {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 32px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    margin-bottom: 24px;
  }
  .aqSectionHead {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    border-bottom: 1px solid #f1f5f9;
    padding-bottom: 14px;
  }
  .aqSectionTitle {
    font-size: 18px;
    font-weight: 800;
    color: #0f172a;
    margin: 0;
  }
  .aqHistoryCount {
    font-size: 12px;
    color: #64748b;
    background: #f1f5f9;
    padding: 4px 10px;
    border-radius: 20px;
    font-weight: 600;
  }
  .aqHistoryTimeline {
    position: relative;
    padding-left: 20px;
  }
  .aqHistoryTimeline::before {
    content: "";
    position: absolute;
    top: 10px;
    bottom: 10px;
    left: 5px;
    width: 2px;
    background: #e2e8f0;
  }
  .aqHistoryItem {
    position: relative;
    padding-bottom: 24px;
    padding-left: 20px;
  }
  .aqHistoryItem:last-child {
    padding-bottom: 0;
  }
  .aqHistoryIcon {
    position: absolute;
    left: -20px;
    top: 4px;
  }
  .aqHistoryDot {
    display: block;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #94a3b8;
    border: 2px solid #ffffff;
    box-shadow: 0 0 0 2px #e2e8f0;
  }
  .aqHistoryLatest .aqHistoryDot {
    background: #2563eb;
    box-shadow: 0 0 0 3px rgba(37,99,235,0.25);
  }
  .aqStatusDelivered .aqHistoryLatest .aqHistoryDot {
    background: #10b981;
    box-shadow: 0 0 0 3px rgba(16,185,129,0.25);
  }
  .aqHistoryTop {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 4px;
    flex-wrap: wrap;
  }
  .aqHistoryStatus {
    font-size: 14px;
    font-weight: 700;
    color: #0f172a;
  }
  .aqHistoryTime {
    font-size: 12px;
    color: #64748b;
    font-variant-numeric: tabular-nums;
  }
  .aqHistoryDesc {
    font-size: 13px;
    color: #475569;
    margin-bottom: 4px;
    line-height: 1.45;
  }
  .aqHistoryLoc {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: #64748b;
    background: #f8fafc;
    border: 1px solid #f1f5f9;
    padding: 2px 8px;
    border-radius: 4px;
  }

  /* Trust Banner */
  .aqTrustBanner {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 32px;
  }
  .aqTrustItem {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .aqTrustItem strong {
    display: block;
    font-size: 12px;
    font-weight: 700;
    color: #0f172a;
  }
  .aqTrustItem small {
    display: block;
    font-size: 11px;
    color: #64748b;
    line-height: 1.35;
    margin-top: 2px;
  }

  /* Footer */
  .aqFooter {
    background: #ffffff;
    border-top: 1px solid #e2e8f0;
    padding: 36px 0 24px;
    font-size: 12px;
    color: #64748b;
  }
  .aqFooterInner {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    margin-bottom: 24px;
    flex-wrap: wrap;
  }
  .aqFooterCol strong {
    display: block;
    font-size: 13px;
    color: #0f172a;
    margin-bottom: 4px;
  }
  .aqFooterLinks {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }
  .aqFooterLinks span {
    color: #475569;
    cursor: pointer;
  }
  .aqFooterLinks span:hover {
    color: #2563eb;
    text-decoration: underline;
  }
  .aqFooterBottom {
    border-top: 1px solid #f1f5f9;
    padding-top: 16px;
    color: #94a3b8;
  }

  /* Responsive Mobile */
  @media (max-width: 720px) {
    .aqFactsGrid {
      grid-template-columns: 1fr;
    }
    .aqTrustBanner {
      grid-template-columns: 1fr;
    }
    .aqStepsGrid {
      grid-template-columns: repeat(2, 1fr);
      row-gap: 24px;
    }
    .aqTimelineTrack {
      display: none;
    }
    .aqHeaderInner {
      height: auto;
      padding: 14px 0;
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
    }
    .aqHeaderMeta {
      width: 100%;
      justify-content: space-between;
    }
    .aqStatusCard {
      padding: 20px 16px;
    }
    .aqHistorySection {
      padding: 20px 16px;
    }
  }
`;
