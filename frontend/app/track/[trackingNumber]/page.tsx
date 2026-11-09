import { notFound } from "next/navigation";
import { repricerAdmin } from "../../../lib/repricer/admin";
import { buildInitialStatusHistory } from "../../../lib/tracking/providers/threePlProvider";
import { isDeliveryStatus, nextDeliveryStatus } from "../../../lib/tracking/status-history";

export const dynamic = "force-dynamic";

type TrackingEvent = { at?: string; status?: string; description?: string };
type TrackingResult = { converted_tracking_number: string; converted_carrier: string; delivery_status: string; status_history: TrackingEvent[]; recipient_zip: string | null; recipient_city: string | null; estimated_delivery: string | null; updated_at: string };
const statusNames: Record<string, string> = { ORDER_RECEIVED: "Auftragsdaten übermittelt", SHIPPED: "Versandt", IN_TRANSIT: "Unterwegs", OUT_FOR_DELIVERY: "In Zustellung", DELIVERED: "Zugestellt", EXCEPTION: "Verzögerung gemeldet" };
const stepNames = ["Auftragsdaten übermittelt", "Unterwegs", "In Zustellung", "Zugestellt"];
function stepFor(status: string) { return ({ ORDER_RECEIVED: 0, SHIPPED: 1, IN_TRANSIT: 1, OUT_FOR_DELIVERY: 2, DELIVERED: 3, EXCEPTION: -1 } as Record<string, number>)[status] ?? 0; }

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
        .select("delivery_status,status_history,recipient_zip,recipient_city,estimated_delivery,estimated_delivery_date,last_synced_at")
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
        recipient_zip: supplierRow?.recipient_zip || conversion.recipient_zip || null,
        recipient_city: supplierRow?.recipient_city || null,
        estimated_delivery: supplierRow?.estimated_delivery || supplierRow?.estimated_delivery_date || null,
        updated_at: supplierRow?.last_synced_at || conversion.created_at,
      };
    }

    const { data: portalRow } = await admin
      .from("supplier_order_tracking")
      .select("public_tracking_number,delivery_status,status_history,recipient_zip,recipient_city,estimated_delivery,estimated_delivery_date,last_synced_at")
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
        recipient_zip: portalRow.recipient_zip || null,
        recipient_city: portalRow.recipient_city || null,
        estimated_delivery: portalRow.estimated_delivery || portalRow.estimated_delivery_date || null,
        updated_at: portalRow.last_synced_at || new Date().toISOString(),
      };
    }
  } catch {
    // Fallback to public RPC if service role key is not configured in local dev.
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
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return <main className="trackingShell"><section className="trackingCard"><h1>Sendungsverfolgung</h1><p>Der Statusdienst ist vorübergehend nicht verfügbar.</p></section><style>{trackingStyles}</style></main>;
  }
  const data = await loadPublicTrackingInfo(reference);
  if (!data?.converted_tracking_number) notFound();
  const activeStep = stepFor(data.delivery_status);
  const history = Array.isArray(data.status_history) ? data.status_history.slice(-20).reverse() : [];
  const location = [data.recipient_zip, data.recipient_city].filter(Boolean).join(" ");
  return <main className="trackingShell">
    <header className="trackingBrand"><span className="trackingMark">S</span><div><strong>Sendungsverfolgung</strong><small>Shipment Tracking</small></div></header>
    <section className="trackingCard">
      <span className="trackingEyebrow">LIEFERSTATUS</span><h1>{statusNames[data.delivery_status] || "Status wird geprüft"}</h1>
      <p>Aktueller Sendungsstatus und Verlauf Ihrer Lieferung.</p>
      <div className="trackingRef"><small>Sendungsnummer</small><strong>{data.converted_tracking_number}</strong></div>
      <div className="trackingSteps">{stepNames.map((step, index) => <div className={`trackingStep ${index <= activeStep ? "active" : ""}`} key={step}><span>{index + 1}</span><small>{step}</small></div>)}</div>
      {data.delivery_status === "EXCEPTION" && <p className="trackingException">Es wurde eine Verzögerung gemeldet. Der Status wird aktualisiert, sobald neue Informationen vorliegen.</p>}
      <div className="trackingInfo"><div><small>Logistikpartner</small><strong>{data.converted_carrier}</strong></div><div><small>Zielort</small><strong>{location || "Deutschland"}</strong></div><div><small>Voraussichtliche Zustellung</small><strong>{data.estimated_delivery || "In Bearbeitung"}</strong></div></div>
      <h2>Sendungsverlauf</h2>{history.length ? <ol className="trackingHistory">{history.map((event, index) => <li key={`${event.at || "event"}-${index}`}><strong>{statusNames[event.status || ""] || "Status aktualisiert"}</strong><span>{event.description || "Lieferantenstatus wurde aktualisiert."}</span><time>{event.at ? new Date(event.at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }) : ""}</time></li>)}</ol> : <p>Es sind noch keine Statusänderungen verfügbar.</p>}
      <small className="trackingNote">Zuletzt aktualisiert: {new Date(data.updated_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" })}</small>
    </section><footer>Status basierend auf den zuletzt synchronisierten Versandinformationen.</footer><style>{trackingStyles}</style>
  </main>;
}

const trackingStyles = `
.trackingShell{min-height:100vh;background:linear-gradient(145deg,#f1f6fb,#e9eef6);color:#172338;padding:36px 18px;font-family:Arial,sans-serif}.trackingBrand{max-width:820px;margin:0 auto 32px;display:flex;gap:12px;align-items:center}.trackingMark{width:42px;height:42px;border-radius:13px;background:#1465d8;color:white;display:grid;place-items:center;font-weight:800}.trackingBrand strong,.trackingBrand small{display:block}.trackingBrand small{margin-top:3px;color:#728098}.trackingCard{max-width:820px;margin:auto;background:#fff;border:1px solid #dce4ee;border-radius:22px;padding:clamp(24px,5vw,48px);box-shadow:0 16px 48px #10294a12}.trackingEyebrow{font-size:12px;letter-spacing:.16em;color:#2673dc;font-weight:800}.trackingCard h1{font-size:clamp(28px,5vw,42px);margin:12px 0}.trackingCard h2{font-size:20px;margin:32px 0 12px}.trackingCard p{color:#58677e;line-height:1.6}.trackingRef{padding:16px;background:#f3f7fc;border-radius:12px;margin:24px 0}.trackingRef small,.trackingRef strong,.trackingInfo small,.trackingInfo strong{display:block}.trackingRef small,.trackingInfo small{color:#718096;margin-bottom:6px}.trackingRef strong{font-size:19px;letter-spacing:.05em;overflow-wrap:anywhere}.trackingSteps{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:28px 0}.trackingStep{text-align:center;color:#8995a7}.trackingStep span{display:grid;place-items:center;margin:0 auto 8px;width:34px;height:34px;border:2px solid #cbd5e1;border-radius:50%;font-weight:700}.trackingStep.active{color:#1465d8}.trackingStep.active span{background:#1465d8;border-color:#1465d8;color:white}.trackingStep small{font-size:12px}.trackingInfo{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:18px 0;border-top:1px solid #e5eaf1;border-bottom:1px solid #e5eaf1}.trackingHistory{list-style:none;padding:0;margin:0}.trackingHistory li{display:grid;gap:5px;border-left:2px solid #b8c9dd;padding:0 0 20px 16px;position:relative}.trackingHistory li:before{content:"";position:absolute;left:-6px;top:3px;width:10px;height:10px;border-radius:50%;background:#2673dc}.trackingHistory span,.trackingHistory time,.trackingNote{color:#748198;font-size:13px}.trackingHistory time{font-size:12px}.trackingException{padding:12px;background:#fff4e5;border-radius:8px;color:#9a5a00!important}.trackingShell footer{max-width:820px;margin:20px auto;color:#778399;font-size:13px}@media(max-width:600px){.trackingSteps{grid-template-columns:repeat(2,1fr);row-gap:18px}.trackingInfo{grid-template-columns:1fr}}`;
