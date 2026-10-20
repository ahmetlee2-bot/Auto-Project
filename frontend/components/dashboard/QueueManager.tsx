"use client";

import { useCallback, useEffect, useState } from "react";
import { useStores } from "../../lib/ebay/StoreContext";

type QueueItem = {
  id: string; store_id: string; asin: string; custom_title: string | null; target_price: number; status: string;
  scheduled_for: string; ebay_item_id: string | null; error_message: string | null; processing_attempts: number;
  completed_at: string | null; store: { store_name: string; marketplace_id: string } | null;
  product: { images: string[]; source_marketplace: string } | null;
};

type SettingsForm = {
  dailyListingLimit: number; listingIntervalHours: number; defaultMarginPercent: number; autoListerEnabled: boolean;
  autoPullFromDepot: boolean; merchantLocationKey: string; fulfillmentPolicyId: string; paymentPolicyId: string; returnPolicyId: string;
};

const initialSettings: SettingsForm = { dailyListingLimit: 10, listingIntervalHours: 6, defaultMarginPercent: 15, autoListerEnabled: false, autoPullFromDepot: false, merchantLocationKey: "", fulfillmentPolicyId: "", paymentPolicyId: "", returnPolicyId: "" };
const statusNames: Record<string, string> = { pending: "Ausstehend", processing: "Wird veröffentlicht", completed: "Veröffentlicht", failed: "Fehlgeschlagen" };
const currencyForStore = (marketplaceId?: string) => marketplaceId === "EBAY_US" ? "USD" : marketplaceId === "EBAY_GB" ? "GBP" : marketplaceId === "EBAY_AU" ? "AUD" : marketplaceId === "EBAY_CA" ? "CAD" : "EUR";

export function QueueManager() {
  const { stores, selectedStoreId, selectedStore, isAllStores, refreshStores } = useStores();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [settings, setSettings] = useState<SettingsForm>(initialSettings);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      if (selectedStoreId !== "ALL_STORES") params.set("storeId", selectedStoreId);
      const response = await fetch(`/api/queue${params.size ? `?${params}` : ""}`, { cache: "no-store" });
      const body = await response.json() as { items?: QueueItem[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Warteschlange konnte nicht geladen werden.");
      setItems(body.items || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Warteschlange konnte nicht geladen werden."); }
    finally { setLoading(false); }
  }, [selectedStoreId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!selectedStore) return;
    setSettings({ dailyListingLimit: selectedStore.daily_listing_limit, listingIntervalHours: selectedStore.listing_interval_hours,
      defaultMarginPercent: selectedStore.default_margin_percent, autoListerEnabled: selectedStore.auto_lister_enabled,
      autoPullFromDepot: selectedStore.auto_pull_from_depot, merchantLocationKey: selectedStore.merchant_location_key || "",
      fulfillmentPolicyId: selectedStore.fulfillment_policy_id || "", paymentPolicyId: selectedStore.payment_policy_id || "",
      returnPolicyId: selectedStore.return_policy_id || "" });
  }, [selectedStore]);

  const changeItem = async (id: string, method: "POST" | "DELETE") => {
    setBusyId(id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/queue/${id}`, { method, ...(method === "POST" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "retry" }) } : {}) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Warteschlangenaktion fehlgeschlagen.");
      setNotice(method === "POST" ? "Eintrag wurde zur erneuten Verarbeitung freigegeben." : "Ausstehender Eintrag wurde entfernt.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Aktion fehlgeschlagen."); }
    finally { setBusyId(""); }
  };

  const saveSettings = async () => {
    if (!selectedStore) return;
    setBusyId("settings"); setError(""); setNotice("");
    try {
      const response = await fetch("/api/ebay/stores", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storeId: selectedStore.id, ...settings }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Shop-Einstellungen konnten nicht gespeichert werden.");
      await refreshStores();
      setNotice("Shop-Einstellungen gespeichert.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Speichern fehlgeschlagen."); }
    finally { setBusyId(""); }
  };

  return <main className="proWorkspace">
    <div className="proPageHeading"><div><span className="proEyebrow">Automatisierung</span><h1>Queue &amp; Automation Logs</h1><p>Neue Angebote werden pro eBay-Shop nacheinander verarbeitet und beachten das konfigurierte Intervall sowie das Tageslimit.</p></div><button className="proButton" type="button" onClick={() => void load()}>Aktualisieren</button></div>
    {notice && <p className="proNotice" role="status">{notice}</p>}{error && <p className="proNotice proNoticeError" role="alert">{error}</p>}
    <div className="proQueueLayout">
      <section className="proPanel"><div className="proToolbar"><h2>Geplante Listungen</h2><span className="proTag">{items.length} Einträge</span></div>
        {loading ? <div className="proEmpty">Warteschlange wird geladen…</div> : items.length ? <div className="proQueueRows">{items.map((item) => <article className="proQueueRow" key={item.id}>
          <div className="proQueueMain"><strong>{item.custom_title || item.asin}</strong><span className="proMuted">{item.asin} · {item.store?.marketplace_id.replace("EBAY_", "") || "eBay"} · {item.store?.store_name || "Shop"}</span><span className="proMuted">Geplant: {new Date(item.scheduled_for).toLocaleString("de-DE")} · Zielpreis: {new Intl.NumberFormat("de-DE", { style: "currency", currency: currencyForStore(item.store?.marketplace_id) }).format(Number(item.target_price))}</span>{item.error_message && <span className="proQueueError">{item.error_message}</span>}{item.ebay_item_id && <span className="proMuted">eBay-Angebots-ID: {item.ebay_item_id}</span>}</div>
          <div className="proQueueActions"><span className={`proTag ${item.status === "completed" ? "proTagSuccess" : item.status === "failed" ? "proTagWarn" : ""}`}>{statusNames[item.status] || item.status}</span>{item.status === "failed" && <button className="proButton" disabled={busyId === item.id} type="button" onClick={() => void changeItem(item.id, "POST")}>Erneut versuchen</button>}{item.status === "pending" && <button className="proButton proButtonDanger" disabled={busyId === item.id} type="button" onClick={() => void changeItem(item.id, "DELETE")}>Entfernen</button>}</div>
        </article>)}</div> : <div className="proEmpty">Noch keine Listungen in der Warteschlange. Im Depot können Sie Produkte zum ausgewählten Shop hinzufügen.</div>}
      </section>
      {!isAllStores && selectedStore && <section className="proPanel"><h2>Shop- und Queue-Einstellungen</h2><p className="proMuted">{selectedStore.marketplace_id} · {selectedStore.store_name}</p>
        <div className="proFormGrid"><label className="proLabel">Tageslimit<input className="proInput" type="number" min="1" max="500" value={settings.dailyListingLimit} onChange={(event) => setSettings((current) => ({ ...current, dailyListingLimit: Number(event.target.value) }))} /></label><label className="proLabel">Abstand (Stunden)<input className="proInput" type="number" min="1" max="720" value={settings.listingIntervalHours} onChange={(event) => setSettings((current) => ({ ...current, listingIntervalHours: Number(event.target.value) }))} /></label><label className="proLabel">Standardmarge (%)<input className="proInput" type="number" min="0" max="300" step="0.1" value={settings.defaultMarginPercent} onChange={(event) => setSettings((current) => ({ ...current, defaultMarginPercent: Number(event.target.value) }))} /></label></div>
        <label className="proCheckbox"><input type="checkbox" checked={settings.autoListerEnabled} onChange={(event) => setSettings((current) => ({ ...current, autoListerEnabled: event.target.checked }))} />Automatisierte Listungen aktivieren</label><label className="proCheckbox"><input type="checkbox" checked={settings.autoPullFromDepot} onChange={(event) => setSettings((current) => ({ ...current, autoPullFromDepot: event.target.checked }))} />Freigegebene Depotprodukte automatisch einreihen</label>
        <details className="proStoreSettings"><summary>eBay-Listing-Richtlinien</summary><div className="proFormGrid"><label className="proLabel">Versandstandort-Schlüssel<input className="proInput" value={settings.merchantLocationKey} onChange={(event) => setSettings((current) => ({ ...current, merchantLocationKey: event.target.value }))} /></label><label className="proLabel">Versandrichtlinie-ID<input className="proInput" value={settings.fulfillmentPolicyId} onChange={(event) => setSettings((current) => ({ ...current, fulfillmentPolicyId: event.target.value }))} /></label><label className="proLabel">Zahlungsrichtlinie-ID<input className="proInput" value={settings.paymentPolicyId} onChange={(event) => setSettings((current) => ({ ...current, paymentPolicyId: event.target.value }))} /></label><label className="proLabel">Rückgaberichtlinie-ID<input className="proInput" value={settings.returnPolicyId} onChange={(event) => setSettings((current) => ({ ...current, returnPolicyId: event.target.value }))} /></label></div></details>
        <button className="proButton proButtonPrimary" type="button" disabled={busyId === "settings"} onClick={() => void saveSettings()}>{busyId === "settings" ? "Wird gespeichert…" : "Einstellungen speichern"}</button>
      </section>}
      {isAllStores && <section className="proPanel"><h2>Shop konfigurieren</h2><p className="proMuted">Wählen Sie oben im Shop-Auswahlfeld einen einzelnen eBay-Shop, um Intervall, Tageslimit und die offiziellen eBay-Listing-Richtlinien einzustellen.</p><div className="proMuted">{stores.length} verbundene Shops</div></section>}
    </div>
  </main>;
}
