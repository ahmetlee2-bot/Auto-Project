"use client";

import { useCallback, useEffect, useState } from "react";
import { useStores } from "../../lib/ebay/StoreContext";
import { routeSupplierTracking } from "../../lib/tracking/carrierRouter";
import { TopUpCreditsModal } from "./TopUpCreditsModal";

type EbayOrder = {
  tracking?: { source_tracking_id: string | null; tracking_number: string; carrier_code: string; provider: string | null; status: string; last_error: string | null };
  supplierTracking?: { supplier_order_id: string; recipient_name: string; source_carrier: string | null; source_tracking_number: string; amazon_share_url: string | null; estimated_delivery_date: string | null; synced_at: string } | null;
  orderId: string; orderFulfillmentStatus?: string; orderPaymentStatus?: string; creationDate?: string;
  lineItems?: Array<{ lineItemId: string; title?: string; quantity?: number }>;
  fulfillmentStartInstructions?: Array<{ shippingStep?: { shipTo?: { fullName?: string } } }>;
};
type OrderRow = { storeId: string; order: EbayOrder };
type TrackingFields = {
  mode: "direct" | "adapter";
  trackingNumber: string;
  carrierCode: string;
  provider: "BLUECARE_EXPRESS" | "AQUILINE";
  sourceTrackingId: string;
  amazonShareUrl?: string;
};

const emptyTrackingFields: TrackingFields = {
  mode: "direct", trackingNumber: "", carrierCode: "", provider: "BLUECARE_EXPRESS", sourceTrackingId: "",
};

function fieldValueByKey(current: Record<string, TrackingFields>, key: string): TrackingFields {
  return current[key] || emptyTrackingFields;
}

const carriers = [
  ["DHL", "DHL"], ["DPD", "DPD"], ["HERMES", "Hermes"], ["GLS", "GLS"],
  ["UPS", "UPS"], ["FEDEX", "FedEx"], ["USPS", "USPS"], ["ROYAL_MAIL", "Royal Mail"],
  ["DEUTSCHE_POST", "Deutsche Post"], ["AUSTRALIA_POST", "Australia Post"],
  ["CANADA_POST", "Canada Post"], ["ARAMEX", "Aramex"], ["BLUECARE_EXPRESS", "BlueCare Express (eBay: Other)"],
  ["AQUILINE", "Aquiline (eBay: Other)"], ["OTHER", "Other"],
];

export function OrdersManager() {
  const { stores, selectedStoreId } = useStores();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [fields, setFields] = useState<Record<string, TrackingFields>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);

  const loadWallet = useCallback(async () => {
    try {
      const response = await fetch("/api/wallet", { cache: "no-store" });
      const body = await response.json() as { creditBalance?: number; isUnlimited?: boolean };
      if (response.ok) {
        setCreditBalance(Number(body.creditBalance ?? 0));
        setIsUnlimited(Boolean(body.isUnlimited));
      }
    } catch { /* The orders page remains usable if the badge request fails. */ }
  }, []);

  const loadOrders = useCallback(async () => {
    const targets = selectedStoreId === "ALL_STORES" ? stores.filter((store) => store.status === "active") : stores.filter((store) => store.id === selectedStoreId);
    if (!targets.length) { setOrders([]); return; }
    setLoading(true); setError(""); setNotice("");
    try {
      const results = await Promise.all(targets.map(async (store) => {
        const response = await fetch(`/api/ebay/stores/${store.id}/orders`, { cache: "no-store" });
        const body = await response.json() as { orders?: EbayOrder[]; error?: string };
        if (!response.ok) throw new Error(`${store.store_name}: ${body.error || "Bestellungen konnten nicht geladen werden."}`);
        return (body.orders || []).map((order) => ({ storeId: store.id, order }));
      }));
      setOrders(results.flat());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Bestellungen konnten nicht geladen werden."); }
    finally { setLoading(false); }
  }, [selectedStoreId, stores]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);
  useEffect(() => { void loadWallet(); }, [loadWallet]);
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    if (payment === "cancelled") setNotice("Checkout abgebrochen. Es wurde nichts berechnet.");
    if (payment === "success") {
      setNotice("Zahlung bestätigt. Das Guthaben wird sicher verbucht und der Kontostand aktualisiert.");
      const delays = [0, 1500, 3000, 5000, 8000];
      void (async () => {
        for (const delay of delays) {
          if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
          if (!active) return;
          await loadWallet();
        }
      })();
    }
    if (payment) {
      params.delete("payment"); params.delete("session_id");
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`);
    }
    return () => { active = false; };
  }, [loadWallet]);
  useEffect(() => {
    setFields((current) => {
      const next = { ...current };
      for (const { storeId, order } of orders) {
        const supplier = order.supplierTracking;
        const key = `${storeId}:${order.orderId}`;
        if (!supplier || next[key]?.sourceTrackingId) continue;
        const route = routeSupplierTracking(supplier.source_tracking_number, next[key]?.provider || "BLUECARE_EXPRESS");
        next[key] = {
          ...emptyTrackingFields,
          mode: route.mode,
          carrierCode: route.carrierCode || "",
          provider: route.provider || "BLUECARE_EXPRESS",
          trackingNumber: route.trackingNumber,
          sourceTrackingId: supplier.source_tracking_number,
          amazonShareUrl: supplier.amazon_share_url || undefined,
        };
      }
      return next;
    });
  }, [orders]);

  const submitTracking = async (storeId: string, orderId: string) => {
    const key = `${storeId}:${orderId}`;
    const values = fields[key] || emptyTrackingFields;
    setBusy(key); setError(""); setNotice("");
    try {
      const response = await fetch("/api/orders/fulfill-tracking", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, storeId, orderId }),
      });
      const body = await response.json() as { error?: string; carrierCode?: string; trackingNumber?: string; walletBalance?: number | null; mockMode?: boolean; provider?: string };
      if (!response.ok) throw new Error(body.error || "Trackingdaten konnten nicht übertragen werden.");
      if (body.mockMode) {
        setNotice(`MOCK-Test erfolgreich: ${body.provider || "3PL"} → ${body.trackingNumber}. Es wurde nichts an eBay gesendet und keine Testnummer gespeichert.`);
        await loadWallet();
        return;
      }
      if (typeof body.walletBalance === "number") setCreditBalance(body.walletBalance);
      await loadWallet();
      await loadOrders();
      setNotice(`Tracking wurde für Bestellung ${orderId} an eBay übermittelt${body.carrierCode ? ` (${body.carrierCode})` : ""}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Trackingdaten konnten nicht übertragen werden."); }
    finally { setBusy(""); }
  };

  const fieldValue = (storeId: string, orderId: string) => fieldValueByKey(fields, `${storeId}:${orderId}`);
  const updateFields = (key: string, patch: Partial<TrackingFields>) => {
    setFields((current) => ({ ...current, [key]: { ...fieldValueByKey(current, key), ...patch } }));
  };

  return <main className="proWorkspace">
    <div className="proPageHeading"><div><span className="proEyebrow">Versand</span><h1>eBay-Bestellungen</h1><p>Bestellungen aus verbundenen Shops laden und nach dem tatsächlichen Versand die vom Carrier bestätigten Daten eintragen.</p></div><div className="proToolbar"><span className="proTag" aria-live="polite">Credits: {isUnlimited ? "∞ Unlimited" : creditBalance === null ? "…" : creditBalance}</span>{!isUnlimited && <button className="proButton proButtonPrimary" type="button" onClick={() => setShowTopUp(true)}>+ Kredi Yükle</button>}<button className="proButton" type="button" disabled={loading} onClick={() => { void loadOrders(); void loadWallet(); }}>Aktualisieren</button></div></div>
    <p className="proNotice">Übertrage nur reale Trackingdaten. Im 3PL-Modus wird die Lieferanten-Trackingnummer ausschließlich an den konfigurierten Dienst gesendet; an eBay geht nur die vom Dienst zurückgegebene Nummer. BlueCare Express und Aquiline werden als Anbieter geführt und mangels bestätigtem eBay-Code mit „Other“ übertragen.</p>
    {notice && <p className="proNotice" role="status">{notice}</p>}{error && <p className="proNotice proNoticeError" role="alert">{error}</p>}
    <section className="proPanel"><div className="proToolbar"><h2>Offene Bestellungen</h2><span className="proTag">{orders.length}</span></div>
      {loading ? <div className="proEmpty">eBay-Bestellungen werden geladen…</div> : orders.length ? <div className="proGridTwo">{orders.map(({ storeId, order }) => {
        const store = stores.find((item) => item.id === storeId);
        const key = `${storeId}:${order.orderId}`;
        const value = fieldValue(storeId, order.orderId);
        return <article className="proCard" key={key}>
          <div className="proToolbar"><span className="proTag">{store?.marketplace_id.replace("EBAY_", "") || "eBay"} · {store?.store_name}</span><span className="proTag proTagWarn">{order.orderFulfillmentStatus || "Offen"}</span></div>
          <h3>Bestellung #{order.orderId}</h3><p className="proMuted">{order.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.fullName || "Kundenname nicht verfügbar"} · {order.creationDate ? new Date(order.creationDate).toLocaleString("de-DE") : ""}</p>
          <dl className="proTrackingDetails"><dt>eBay Sipariş No</dt><dd>{order.orderId}</dd><dt>Müşteri Adı</dt><dd>{order.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.fullName || "—"}</dd><dt>Amazon-Bestellnummer</dt><dd>{order.supplierTracking?.supplier_order_id || "—"}</dd><dt>Amazon / Tedarikçi Takip No</dt><dd>{order.tracking?.source_tracking_id || order.supplierTracking?.source_tracking_number || "—"}</dd><dt>Dönüştürülen Kargo Firması</dt><dd>{order.tracking?.provider?.replaceAll("_", " ") || order.tracking?.carrier_code || order.supplierTracking?.source_carrier || "—"}</dd><dt>Gerçek eBay-Trackingnummer</dt><dd>{order.tracking?.tracking_number || "—"}</dd><dt>Durum</dt><dd>{order.tracking?.status === "delivered" ? "Teslim Edildi" : order.tracking?.status === "submitted" ? "eBay’e İşlendi" : order.tracking?.status === "error" ? "Gönderim hatası" : order.supplierTracking ? "Amazon-Daten übernommen · noch nicht an eBay gesendet" : "Takip bekleniyor"}</dd></dl>
          {order.tracking?.last_error && <p role="alert" className="proNotice proNoticeError">{order.tracking.last_error}</p>}
          <ul className="proOrderItems">{(order.lineItems || []).map((line) => <li key={line.lineItemId}>{line.title || line.lineItemId} <span>× {line.quantity || 1}</span></li>)}</ul>
          <div className="proFormGrid">
            <label className="proLabel">Amazon / Tedarikçi Takip No<input className="proInput" autoComplete="off" value={value.sourceTrackingId} onChange={e => {
              const sourceTrackingId = e.target.value;
              const route = routeSupplierTracking(sourceTrackingId, value.provider);
              updateFields(key, {
                sourceTrackingId,
                ...(route.mode === "adapter" ? { mode: "adapter" as const, provider: route.provider || value.provider } : {}),
                ...(route.mode === "direct" && route.carrierCode ? { mode: "direct" as const, carrierCode: route.carrierCode, trackingNumber: route.trackingNumber } : {}),
              });
            }} /></label>
            <label className="proLabel">Übertragungsmodus<select className="proSelect" value={value.mode} onChange={(event) => updateFields(key, { mode: event.target.value as TrackingFields["mode"] })}><option value="direct">Direkt mit Carrier-Code</option><option value="adapter">3PL Tracking Adapter</option></select></label>
            {value.mode === "direct" ? <>
              <label className="proLabel">Tatsächlicher Carrier<select className="proSelect" value={value.carrierCode} onChange={(event) => updateFields(key, { carrierCode: event.target.value })}><option value="">Auswählen…</option>{carriers.map(([carrierValue, label]) => <option key={carrierValue} value={carrierValue}>{label}</option>)}</select></label>
              <label className="proLabel">Echte Sendungsnummer<input className="proInput" autoComplete="off" value={value.trackingNumber} onChange={(event) => updateFields(key, { trackingNumber: event.target.value })} placeholder="Nur Buchstaben und Ziffern" /></label>
            </> : <>
              <label className="proLabel">3PL-Anbieter<select className="proSelect" value={value.provider} onChange={(event) => updateFields(key, { provider: event.target.value as TrackingFields["provider"] })}><option value="BLUECARE_EXPRESS">BlueCare Express</option><option value="AQUILINE">Aquiline</option></select></label>
              <label className="proLabel">Ursprüngliche Lieferanten-Trackingnummer<input className="proInput" autoComplete="off" value={value.sourceTrackingId} onChange={(event) => updateFields(key, { sourceTrackingId: event.target.value })} placeholder="Nur an den konfigurierten 3PL-Dienst" /></label>
            </>}
          </div>
          <button className="proButton proButtonPrimary" type="button" disabled={!!order.tracking && order.tracking.status === "submitted" || order.orderFulfillmentStatus === "FULFILLED" || busy === key || (value.mode === "direct" ? !value.carrierCode || !value.trackingNumber : !value.sourceTrackingId)} onClick={() => void submitTracking(storeId, order.orderId)}>{busy === key ? "Wird übertragen…" : value.mode === "direct" ? "Tracking an eBay senden" : "3PL abrufen und an eBay senden"}</button>
        </article>;
      })}</div> : <div className="proEmpty">Keine offenen Bestellungen für den ausgewählten Shop gefunden.</div>}
    </section>
    {showTopUp && <TopUpCreditsModal onClose={() => setShowTopUp(false)} />}
  </main>;
}
