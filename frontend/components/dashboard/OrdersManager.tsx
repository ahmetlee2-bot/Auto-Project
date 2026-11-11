"use client";

import { useCallback, useEffect, useState } from "react";
import { useStores } from "../../lib/ebay/StoreContext";
import { routeSupplierTracking } from "../../lib/tracking/carrierRouter";
import { parseGermanShippingAddress } from "../../lib/orders/germanAddressParser";
import { TopUpCreditsModal } from "./TopUpCreditsModal";

type EbayOrder = {
  tracking?: { source_tracking_id: string | null; tracking_number: string; carrier_code: string; provider: string | null; status: string; last_error: string | null };
  supplierTracking?: { supplier_order_id: string; recipient_name: string; source_carrier: string | null; source_tracking_number: string; amazon_share_url: string | null; estimated_delivery_date: string | null; synced_at: string; public_tracking_number?: string; delivery_status?: string; last_synced_at?: string; recipient_city?: string | null; recipient_zip?: string | null; estimated_delivery?: string | null; buyer_notified_at?: string | null } | null;
  shippingAddress?: { fullName: string; addressLine1: string; addressLine2: string; postalCode: string; city: string; countryCode: string; phoneNumber: string } | null;
  orderId: string; orderFulfillmentStatus?: string; orderPaymentStatus?: string; creationDate?: string;
  lineItems?: Array<{ lineItemId: string; legacyItemId?: string; title?: string; quantity?: number; sourceAsin?: string | null; supplier?: string; supplierUrl?: string; amazonCartUrl?: string | null }>;
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
  mode: "direct", trackingNumber: "", carrierCode: "", provider: "AQUILINE", sourceTrackingId: "",
};

function fieldValueByKey(current: Record<string, TrackingFields>, key: string): TrackingFields {
  return current[key] || emptyTrackingFields;
}

function formatCarrierProvider(order: EbayOrder): string {
  const provider = order.tracking?.provider?.trim();
  if (provider) {
    if (provider.toUpperCase() === "AQUILINE") return "Aquiline";
    if (provider.toUpperCase() === "BLUECARE_EXPRESS") return "BlueCare Express";
    return provider.replaceAll("_", " ");
  }
  return order.tracking?.carrier_code || order.supplierTracking?.source_carrier || "—";
}

function getPortalTrackingCode(order: EbayOrder): string | null {
  const converted = order.tracking?.tracking_number?.trim();
  if (converted && /^(?:AQ[A-Z0-9]{6,20}DE|AL[A-Z0-9]{6,40}DE)$/i.test(converted)) {
    return converted;
  }
  return order.supplierTracking?.public_tracking_number || null;
}

function buildBuyerMessage(order: EbayOrder, portalCode: string): string {
  const recipientName = String(order.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.fullName || "").trim();
  const carrier = formatCarrierProvider(order);
  return `Hallo${recipientName ? ` ${recipientName}` : ""}, Ihre Bestellung wurde auf eBay als versandt markiert. Ihre Sendungsnummer lautet ${portalCode}${carrier && carrier !== "—" ? ` (${carrier})` : ""}. Den aktuellen Lieferstatus finden Sie unter https://autolister-app.de/track/${encodeURIComponent(portalCode)}. Vielen Dank für Ihren Einkauf!`;
}

const carriers = [
  ["DHL", "DHL"], ["DPD", "DPD"], ["HERMES", "Hermes"], ["GLS", "GLS"],
  ["UPS", "UPS"], ["FEDEX", "FedEx"], ["USPS", "USPS"], ["ROYAL_MAIL", "Royal Mail"],
  ["DEUTSCHE_POST", "Deutsche Post"], ["AUSTRALIA_POST", "Australia Post"],
  ["CANADA_POST", "Canada Post"], ["ARAMEX", "Aramex"], ["AQUILINE", "Aquiline"],
  ["BLUECARE_EXPRESS", "BlueCare Express"], ["OTHER", "Other"],
];

export function OrdersManager() {
  const { stores, selectedStoreId } = useStores();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [fields, setFields] = useState<Record<string, TrackingFields>>({});
  const [notifyBuyer, setNotifyBuyer] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");

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
        const route = routeSupplierTracking(supplier.source_tracking_number, next[key]?.provider || "AQUILINE");
        next[key] = {
          ...emptyTrackingFields,
          mode: route.mode,
          carrierCode: route.carrierCode || "",
          provider: route.provider || "AQUILINE",
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
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, storeId, orderId, notifyBuyer: notifyBuyer[key] !== false }),
      });
      const body = await response.json() as { error?: string; carrierCode?: string; trackingNumber?: string; sourceTrackingId?: string | null; walletBalance?: number | null; provider?: string | null; buyerMessageSent?: boolean; buyerMessageText?: string | null };
      if (!response.ok) throw new Error(body.error || "Trackingdaten konnten nicht übertragen werden.");
      if (typeof body.walletBalance === "number") setCreditBalance(body.walletBalance);
      const updatedProvider = body.provider || (values.mode === "adapter" ? "Aquiline" : null);
      const updatedTrackingNumber = body.trackingNumber || values.trackingNumber || "";
      const updatedCarrierCode = body.carrierCode || (values.mode === "adapter" ? "Aquiline" : values.carrierCode);
      const updatedSourceTracking = body.sourceTrackingId ?? (values.sourceTrackingId || null);

      setOrders((current) =>
        current.map((row) =>
          row.storeId === storeId && row.order.orderId === orderId
            ? {
                ...row,
                order: {
                  ...row.order,
                  orderFulfillmentStatus: "FULFILLED",
                  tracking: {
                    source_tracking_id: updatedSourceTracking,
                    tracking_number: updatedTrackingNumber,
                    carrier_code: updatedCarrierCode,
                    provider: updatedProvider,
                    status: "submitted",
                    last_error: null,
                  },
                },
              }
            : row,
        ),
      );

      if (body.buyerMessageText) {
        setCopyMessage(body.buyerMessageText);
      }
      await loadWallet();
      await loadOrders();
      setOrders((current) =>
        current.map((row) =>
          row.storeId === storeId && row.order.orderId === orderId
            ? {
                ...row,
                order: {
                  ...row.order,
                  orderFulfillmentStatus: "FULFILLED",
                  tracking: row.order.tracking?.tracking_number
                    ? row.order.tracking
                    : {
                        source_tracking_id: updatedSourceTracking,
                        tracking_number: updatedTrackingNumber,
                        carrier_code: updatedCarrierCode,
                        provider: updatedProvider,
                        status: "submitted",
                        last_error: null,
                      },
                },
              }
            : row,
        ),
      );
      setNotice(`Tracking wurde für Bestellung ${orderId} an eBay übermittelt (${updatedProvider || updatedCarrierCode || "Aquiline"}).${notifyBuyer[key] === false ? " Käufernachricht übersprungen." : body.buyerMessageSent ? " Käufer wurde per eBay-Nachricht informiert." : body.buyerMessageText ? " Nachricht konnte nicht automatisch gesendet werden; Vorlage steht zum Kopieren bereit." : " Kein interner Statuslink für eine Nachricht vorhanden."}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Trackingdaten konnten nicht übertragen werden."); }
    finally { setBusy(""); }
  };

  const fieldValue = (storeId: string, orderId: string) => fieldValueByKey(fields, `${storeId}:${orderId}`);
  const updateFields = (key: string, patch: Partial<TrackingFields>) => {
    setFields((current) => ({ ...current, [key]: { ...fieldValueByKey(current, key), ...patch } }));
  };

  return <main className="proWorkspace">
    <div className="proPageHeading"><div><span className="proEyebrow">Versand</span><h1>eBay-Bestellungen</h1><p>Bestellungen aus verbundenen Shops laden und nach dem tatsächlichen Versand die vom Carrier bestätigten Daten eintragen.</p></div><div className="proToolbar"><a className="proButton" href="/track" target="_blank" rel="noreferrer" style={{ background: "rgba(37, 99, 235, 0.08)", borderColor: "#2563eb", color: "#2563eb", fontWeight: 600 }}>📦 Kargo Takip Portalı (/track) ↗</a><span className="proTag" aria-live="polite">Credits: {isUnlimited ? "∞ Unlimited" : creditBalance === null ? "…" : creditBalance}</span>{!isUnlimited && <button className="proButton proButtonPrimary" type="button" onClick={() => setShowTopUp(true)}>+ Kredi Yükle</button>}<button className="proButton" type="button" disabled={loading} onClick={() => { void loadOrders(); void loadWallet(); }}>Aktualisieren</button></div></div>
    <p className="proNotice">Übertrage nur reale Trackingdaten. Im 3PL-Modus wird die Lieferanten-Trackingnummer umgewandelt (Aquiline · AQ…DE) und als „Aquiline“ an eBay übertragen.</p>
    {notice && <p className="proNotice" role="status">{notice}</p>}{error && <p className="proNotice proNoticeError" role="alert">{error}</p>}
    <section className="proPanel"><div className="proToolbar"><h2>Offene Bestellungen</h2><span className="proTag">{orders.length}</span></div>
      {loading ? <div className="proEmpty">eBay-Bestellungen werden geladen…</div> : orders.length ? <div className="proGridTwo">{orders.map(({ storeId, order }) => {
        const store = stores.find((item) => item.id === storeId);
        const key = `${storeId}:${order.orderId}`;
        const value = fieldValue(storeId, order.orderId);
        const isFulfilled = order.orderFulfillmentStatus === "FULFILLED" || order.tracking?.status === "submitted" || order.tracking?.status === "delivered";
        const portalCode = getPortalTrackingCode(order);
        const messageTemplate = portalCode ? buildBuyerMessage(order, portalCode) : "";
        return <article className="proCard" key={key}>
          <div className="proToolbar"><span className="proTag">{store?.marketplace_id.replace("EBAY_", "") || "eBay"} · {store?.store_name}</span><span className={`proTag ${isFulfilled ? "proTagSuccess" : "proTagWarn"}`}>{isFulfilled ? "FULFILLED" : (order.orderFulfillmentStatus || "Offen")}</span></div>
          <h3>Bestellung #{order.orderId}</h3><p className="proMuted">{order.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.fullName || "Kundenname nicht verfügbar"} · {order.creationDate ? new Date(order.creationDate).toLocaleString("de-DE") : ""}</p>
          <dl className="proTrackingDetails"><dt>eBay Sipariş No</dt><dd>{order.orderId}</dd><dt>Müşteri Adı</dt><dd>{order.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.fullName || "—"}</dd><dt>Amazon-Bestellnummer</dt><dd>{order.supplierTracking?.supplier_order_id || "—"}</dd><dt>Amazon / Tedarikçi Takip No</dt><dd>{order.tracking?.source_tracking_id || order.supplierTracking?.source_tracking_number || "—"}</dd><dt>Dönüştürülen Kargo Firması</dt><dd>{formatCarrierProvider(order)}</dd><dt>Gerçek Takip Kodu</dt><dd>{order.tracking?.tracking_number || "—"}</dd><dt>Durum</dt><dd>{order.tracking?.status === "delivered" ? "Teslim Edildi" : isFulfilled ? "FULFILLED · eBay’e İşlendi" : order.tracking?.status === "error" ? "Gönderim hatası" : order.supplierTracking ? "Amazon-Daten übernommen · noch nicht an eBay gesendet" : "Takip bekleniyor"}</dd>{portalCode && <><dt>Takip Portalı (/track)</dt><dd><a href={`/track/${encodeURIComponent(portalCode)}`} target="_blank" rel="noreferrer">/track/{portalCode} · Statusseite öffnen ↗</a></dd></>}{order.supplierTracking?.public_tracking_number && <><dt>Lieferantenstatus</dt><dd>{order.supplierTracking.delivery_status || "Auftragsdaten übernommen"}{order.supplierTracking.last_synced_at ? ` · ${new Date(order.supplierTracking.last_synced_at).toLocaleString("de-DE")}` : ""}</dd></>}</dl>
          {portalCode && (
            <div className="proToolbar" style={{ margin: "10px 0", gap: 8, flexWrap: "wrap" }}>
              <a className="proButton" href={`/track/${encodeURIComponent(portalCode)}`} target="_blank" rel="noreferrer">
                /track/{portalCode} Önizle ↗
              </a>
              <button
                className="proButton"
                type="button"
                onClick={() => {
                  setCopyMessage(messageTemplate);
                  void navigator.clipboard.writeText(messageTemplate).then(() => setNotice("Nachrichtenvorlage wurde kopiert."));
                }}
              >
                Nachrichtenvorlage kopieren
              </button>
            </div>
          )}
          {order.tracking?.last_error && <p role="alert" className="proNotice proNoticeError">{order.tracking.last_error}</p>}
          <ul className="proOrderItems">{(order.lineItems || []).map((line) => <li key={line.lineItemId}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "8px", width: "100%" }}>
              <span>{line.title || line.lineItemId} <b>× {line.quantity || 1}</b> {line.sourceAsin ? <span className="proMuted">({line.sourceAsin})</span> : null}</span>
              <span style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {line.amazonCartUrl && (
                  <a className="proButton proButtonPrimary" style={{ padding: "4px 10px", fontSize: "12px" }} href={line.amazonCartUrl} target="_blank" rel="noreferrer">
                    🛒 Amazon.de Sepete Ekle ↗
                  </a>
                )}
                {line.supplierUrl && (
                  <a className="proButton" style={{ padding: "4px 10px", fontSize: "12px" }} href={line.supplierUrl} target="_blank" rel="noreferrer">
                    🔗 Tedarikçide Aç ↗
                  </a>
                )}
              </span>
            </div>
          </li>)}</ul>
          {order.shippingAddress && (order.shippingAddress.fullName || order.shippingAddress.addressLine1) && (() => {
            const parsed = parseGermanShippingAddress(order.shippingAddress);
            const primaryLine = order.lineItems?.[0];
            const targetSupplierUrl = primaryLine?.supplierUrl || primaryLine?.amazonCartUrl || (primaryLine?.sourceAsin ? `https://www.amazon.de/dp/${primaryLine.sourceAsin}` : null);
            return (
              <div style={{ margin: "10px 0", padding: "12px 14px", borderRadius: "10px", background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(59, 130, 246, 0.4)", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                  <div style={{ fontSize: "12px", lineHeight: 1.5 }}>
                    <div style={{ fontWeight: 700, color: "#60a5fa", display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span>📦 Teslimat Adresi (DE):</span>
                      {parsed.isPackstation && <span style={{ background: "#f59e0b", color: "#000", padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 800 }}>DHL PACKSTATION</span>}
                    </div>
                    <div><b>{parsed.fullName}</b> · {parsed.isPackstation ? parsed.street : `${parsed.street} ${parsed.houseNumber}`.trim()}</div>
                    {parsed.addressLine2 ? <div style={{ color: "#94a3b8" }}>{parsed.addressLine2}</div> : null}
                    <div>{parsed.postalCode} {parsed.city} ({parsed.countryCode}){parsed.phoneNumber ? ` · Tel: ${parsed.phoneNumber}` : ""}</div>
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button
                      className="proButton proButtonPrimary"
                      type="button"
                      style={{ padding: "6px 14px", fontSize: "12px", background: "linear-gradient(135deg, #2563eb, #1d4ed8)", fontWeight: 700, border: "none", boxShadow: "0 2px 8px rgba(37, 99, 235, 0.4)" }}
                      onClick={() => {
                        window.postMessage({
                          type: "AUTOLISTER_TRIGGER_AUTO_ORDER",
                          payload: {
                            orderId: order.orderId,
                            storeId,
                            sourceAsin: primaryLine?.sourceAsin,
                            supplierUrl: primaryLine?.supplierUrl,
                            amazonCartUrl: primaryLine?.amazonCartUrl,
                            quantity: primaryLine?.quantity || 1,
                            parsedAddress: parsed,
                          },
                        }, "*");
                        void navigator.clipboard.writeText(parsed.formattedText).then(() => {
                          setNotice(`⚡ 1-Click Sipariş Hazırlandı: ${parsed.fullName} adresi ayrıştırıldı ve eklentiye iletildi. Amazon/Joybuy sekmesinde otomatik doldurulacaktır.`);
                        });
                        if (targetSupplierUrl) {
                          window.open(targetSupplierUrl, "_blank", "noopener,noreferrer");
                        }
                      }}
                    >
                      ⚡ 1-Click Siparişi Hazırla
                    </button>
                    <button
                      className="proButton"
                      type="button"
                      style={{ padding: "6px 10px", fontSize: "12px" }}
                      onClick={() => {
                        void navigator.clipboard.writeText(parsed.formattedText).then(() => {
                          setNotice(`Teslimat adresi kopyalandı (${parsed.fullName}).`);
                        });
                      }}
                    >
                      📋 Adresi Kopyala
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
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
              <label className="proLabel">3PL-Anbieter<select className="proSelect" value={value.provider} onChange={(event) => updateFields(key, { provider: event.target.value as TrackingFields["provider"] })}><option value="AQUILINE">Aquiline</option><option value="BLUECARE_EXPRESS">BlueCare Express</option></select></label>
              <label className="proLabel">Ursprüngliche Lieferanten-Trackingnummer<input className="proInput" autoComplete="off" value={value.sourceTrackingId} onChange={(event) => updateFields(key, { sourceTrackingId: event.target.value })} placeholder="z. B. TBA… oder DE…" /></label>
            </>}
          </div>
          <label className="proLabel" style={{ display: "flex", alignItems: "center", gap: 9, margin: "12px 0" }}><input type="checkbox" checked={notifyBuyer[key] !== false} onChange={event => setNotifyBuyer(current => ({ ...current, [key]: event.target.checked }))} />Käufer per eBay-Nachricht über den internen Statuslink informieren</label>
          <button className="proButton proButtonPrimary" type="button" disabled={isFulfilled || busy === key || (value.mode === "direct" ? !value.carrierCode || !value.trackingNumber : !value.sourceTrackingId)} onClick={() => void submitTracking(storeId, order.orderId)}>{busy === key ? "Wird übertragen…" : value.mode === "direct" ? "Tracking an eBay senden" : "3PL abrufen und an eBay senden"}</button>
        </article>;
      })}</div> : <div className="proEmpty">Keine offenen Bestellungen für den ausgewählten Shop gefunden.</div>}
    </section>
    {copyMessage && <section className="proPanel" aria-live="polite"><h2>eBay-Nachrichtenvorlage</h2><p>{copyMessage}</p><button className="proButton" type="button" onClick={() => { void navigator.clipboard.writeText(copyMessage).then(() => setNotice("Nachrichtenvorlage wurde kopiert.")); }}>Nachrichtenvorlage kopieren</button></section>}
    {showTopUp && <TopUpCreditsModal onClose={() => setShowTopUp(false)} />}
  </main>;
}
