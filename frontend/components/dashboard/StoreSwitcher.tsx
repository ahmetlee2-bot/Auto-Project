"use client";

import { useEffect, useState } from "react";
import { useStores } from "../../lib/ebay/StoreContext";

const marketplaces = [
  ["EBAY_DE", "🇩🇪 DE"],
  ["EBAY_US", "🇺🇸 US"],
  ["EBAY_GB", "🇬🇧 UK"],
  ["EBAY_AU", "🇦🇺 AU"],
  ["EBAY_CA", "🇨🇦 CA"],
  ["EBAY_FR", "🇫🇷 FR"],
  ["EBAY_IT", "🇮🇹 IT"],
  ["EBAY_ES", "🇪🇸 ES"],
] as const;

export function StoreSwitcher() {
  const { stores, selectedStoreId, setSelectedStoreId, loading, error, connectionMessage, refreshStores } = useStores();
  const [marketplace, setMarketplace] = useState("EBAY_DE");
  const [apiStatus, setApiStatus] = useState<{ configured: boolean; environment: string; missing: string[] } | null>(null);
  const selected = stores.find((store) => store.id === selectedStoreId);
  const status = selected?.status || "active";

  useEffect(() => {
    let active = true;
    void fetch("/api/ebay/config", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ configured: boolean; environment: string; missing: string[] }> : null)
      .then((result) => { if (active && result) setApiStatus(result); })
      .catch(() => { if (active) setApiStatus({ configured: false, environment: "production", missing: ["eBay API status unavailable"] }); });
    return () => { active = false; };
  }, []);

  return (
    <div className="proStoreSwitch" aria-label="eBay mağaza seçimi">
      <span className={`proStoreDot ${status === "active" ? "isActive" : "isWarn"}`} aria-hidden="true" />
      <label className="srOnly" htmlFor="pro-store-select">Aktif mağaza</label>
      <select id="pro-store-select" value={selectedStoreId} onChange={(event) => setSelectedStoreId(event.target.value)}>
        <option value="ALL_STORES">Tüm mağazalar</option>
        {stores.map((store) => (
          <option key={store.id} value={store.id}>
            {store.marketplace_id.replace("EBAY_", "")} · {store.store_name}
            {store.status !== "active" ? " · Yeniden bağlanmalı" : ""}
          </option>
        ))}
      </select>
      <select aria-label="Yeni mağaza pazaryeri" value={marketplace} onChange={(event) => setMarketplace(event.target.value)}>
        {marketplaces.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      {apiStatus?.configured === false ? <span className="proStoreError" role="status" title={apiStatus.missing.join(", ")}>
        eBay API ayarı gerekli ({apiStatus.environment === "sandbox" ? "Sandbox" : "Production"}) · {apiStatus.missing.length} eksik
      </span> : <a className="proButton proButtonPrimary" href={`/api/ebay/stores/connect?marketplace=${marketplace}`}>
        + Mağaza bağla
      </a>}
      <button className="proIconButton" type="button" onClick={() => void refreshStores()} disabled={loading} aria-label="Mağazaları yenile">
        ↻
      </button>
      {error ? <span className="proStoreError" role="status">{error}</span> : null}
      {connectionMessage ? <span className="proStoreConnected" role="status">{connectionMessage}</span> : null}
    </div>
  );
}
