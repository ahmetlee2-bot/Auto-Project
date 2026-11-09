import { notFound } from "next/navigation";

type TrackingEvent = { at?: string; status?: string; description?: string };
type TrackingResult = { converted_tracking_number: string; converted_carrier: string; delivery_status: string; status_history: TrackingEvent[]; recipient_zip: string | null; recipient_city: string | null; estimated_delivery: string | null; updated_at: string };
const statusNames: Record<string, string> = { ORDER_RECEIVED: "Auftragsdaten übermittelt", SHIPPED: "Versandt", IN_TRANSIT: "Unterwegs", OUT_FOR_DELIVERY: "In Zustellung", DELIVERED: "Zugestellt", EXCEPTION: "Verzögerung gemeldet" };
const stepNames = ["Auftragsdaten übermittelt", "Unterwegs", "In Zustellung", "Zugestellt"];
function stepFor(status: string) { return ({ ORDER_RECEIVED: 0, SHIPPED: 1, IN_TRANSIT: 1, OUT_FOR_DELIVERY: 2, DELIVERED: 3, EXCEPTION: -1 } as Record<string, number>)[status] ?? 0; }

export default async function PublicTrackingPage({ params }: { params: Promise<{ trackingNumber: string }> }) {
  const { trackingNumber } = await params;
  const reference = decodeURIComponent(trackingNumber).toUpperCase();
  if (!/^AL[A-F0-9]{32}DE$/.test(reference)) notFound();
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) return <main className="trackingShell"><section className="trackingCard"><h1>Sendungsverfolgung</h1><p>Der Statusdienst ist vorübergehend nicht verfügbar.</p></section><style>{trackingStyles}</style></main>;
  const response = await fetch(`${base.replace(/\/$/, "")}/rest/v1/rpc/get_public_tracking_info`, {
    method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_tracking_number: reference }), cache: "no-store", signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!response?.ok) return <main className="trackingShell"><section className="trackingCard"><h1>Status derzeit nicht abrufbar</h1><p>Bitte versuchen Sie es später erneut.</p></section><style>{trackingStyles}</style></main>;
  const rows = await response.json().catch(() => []);
  const data = (Array.isArray(rows) ? rows[0] : rows) as TrackingResult | undefined;
  if (!data?.converted_tracking_number) notFound();
  const activeStep = stepFor(data.delivery_status);
  const history = Array.isArray(data.status_history) ? data.status_history.slice(-20).reverse() : [];
  const location = [data.recipient_zip, data.recipient_city].filter(Boolean).join(" ");
  return <main className="trackingShell">
    <header className="trackingBrand"><span className="trackingMark">S</span><div><strong>Sendungsverfolgung</strong><small>Shipment Tracking</small></div></header>
    <section className="trackingCard">
      <span className="trackingEyebrow">LIEFERSTATUS</span><h1>{statusNames[data.delivery_status] || "Status wird geprüft"}</h1>
      <p>Zuletzt erfasster Lieferantenstatus. Dies ist eine interne Statusreferenz und kein Trackingcode eines Paketdienstes.</p>
      <div className="trackingRef"><small>Statusreferenz</small><strong>{data.converted_tracking_number}</strong></div>
      <div className="trackingSteps">{stepNames.map((step, index) => <div className={`trackingStep ${index <= activeStep ? "active" : ""}`} key={step}><span>{index + 1}</span><small>{step}</small></div>)}</div>
      {data.delivery_status === "EXCEPTION" && <p className="trackingException">Es wurde eine Verzögerung gemeldet. Der Status wird aktualisiert, sobald neue Informationen vorliegen.</p>}
      <div className="trackingInfo"><div><small>Logistikpartner</small><strong>{data.converted_carrier}</strong></div><div><small>Zielort</small><strong>{location || "Nicht angegeben"}</strong></div><div><small>Voraussichtliche Zustellung</small><strong>{data.estimated_delivery || "Noch nicht verfügbar"}</strong></div></div>
      <h2>Sendungsverlauf</h2>{history.length ? <ol className="trackingHistory">{history.map((event, index) => <li key={`${event.at || "event"}-${index}`}><strong>{statusNames[event.status || ""] || "Status aktualisiert"}</strong><span>{event.description || "Lieferantenstatus wurde aktualisiert."}</span><time>{event.at ? new Date(event.at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }) : ""}</time></li>)}</ol> : <p>Es sind noch keine Statusänderungen verfügbar.</p>}
      <small className="trackingNote">Zuletzt aktualisiert: {new Date(data.updated_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" })}</small>
    </section><footer>Status basierend auf den zuletzt synchronisierten Lieferanteninformationen.</footer><style>{trackingStyles}</style>
  </main>;
}

const trackingStyles = `
.trackingShell{min-height:100vh;background:linear-gradient(145deg,#f1f6fb,#e9eef6);color:#172338;padding:36px 18px;font-family:Arial,sans-serif}.trackingBrand{max-width:820px;margin:0 auto 32px;display:flex;gap:12px;align-items:center}.trackingMark{width:42px;height:42px;border-radius:13px;background:#1465d8;color:white;display:grid;place-items:center;font-weight:800}.trackingBrand strong,.trackingBrand small{display:block}.trackingBrand small{margin-top:3px;color:#728098}.trackingCard{max-width:820px;margin:auto;background:#fff;border:1px solid #dce4ee;border-radius:22px;padding:clamp(24px,5vw,48px);box-shadow:0 16px 48px #10294a12}.trackingEyebrow{font-size:12px;letter-spacing:.16em;color:#2673dc;font-weight:800}.trackingCard h1{font-size:clamp(28px,5vw,42px);margin:12px 0}.trackingCard h2{font-size:20px;margin:32px 0 12px}.trackingCard p{color:#58677e;line-height:1.6}.trackingRef{padding:16px;background:#f3f7fc;border-radius:12px;margin:24px 0}.trackingRef small,.trackingRef strong,.trackingInfo small,.trackingInfo strong{display:block}.trackingRef small,.trackingInfo small{color:#718096;margin-bottom:6px}.trackingRef strong{font-size:19px;letter-spacing:.05em;overflow-wrap:anywhere}.trackingSteps{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:28px 0}.trackingStep{text-align:center;color:#8995a7}.trackingStep span{display:grid;place-items:center;margin:0 auto 8px;width:34px;height:34px;border:2px solid #cbd5e1;border-radius:50%;font-weight:700}.trackingStep.active{color:#1465d8}.trackingStep.active span{background:#1465d8;border-color:#1465d8;color:white}.trackingStep small{font-size:12px}.trackingInfo{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:18px 0;border-top:1px solid #e5eaf1;border-bottom:1px solid #e5eaf1}.trackingHistory{list-style:none;padding:0;margin:0}.trackingHistory li{display:grid;gap:5px;border-left:2px solid #b8c9dd;padding:0 0 20px 16px;position:relative}.trackingHistory li:before{content:"";position:absolute;left:-6px;top:3px;width:10px;height:10px;border-radius:50%;background:#2673dc}.trackingHistory span,.trackingHistory time,.trackingNote{color:#748198;font-size:13px}.trackingHistory time{font-size:12px}.trackingException{padding:12px;background:#fff4e5;border-radius:8px;color:#9a5a00!important}.trackingShell footer{max-width:820px;margin:20px auto;color:#778399;font-size:13px}@media(max-width:600px){.trackingSteps{grid-template-columns:repeat(2,1fr);row-gap:18px}.trackingInfo{grid-template-columns:1fr}}`;
