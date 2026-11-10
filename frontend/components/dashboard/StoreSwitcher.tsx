"use client";

import { useEffect, useState } from "react";
import { StoreConnectModal } from "./StoreConnectModal";
import { useStores } from "../../lib/ebay/StoreContext";

export function StoreSwitcher() {
  const { stores, selectedStoreId, setSelectedStoreId, loading, error, connectionMessage, refreshStores } = useStores();
  const [marketplace, setMarketplace] = useState("EBAY_DE");
  const [connectOpen, setConnectOpen] = useState(false);
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
      <StoreConnectModal open={connectOpen} onClose={() => setConnectOpen(false)} marketplace={marketplace} onMarketplaceChange={setMarketplace} />
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
      {apiStatus?.configured === false ? <span className="proStoreError" role="status" title={apiStatus.missing.join(", ")}>
        eBay API ayarı gerekli ({apiStatus.environment === "sandbox" ? "Sandbox" : "Production"}) · {apiStatus.missing.length} eksik
      </span> : <button type="button" className="proButton proButtonPrimary" onClick={() => setConnectOpen(true)}>
        + Mağaza bağla
      </button>}
      <button className="proIconButton" type="button" onClick={() => void refreshStores()} disabled={loading} aria-label="Mağazaları yenile">
        ↻
      </button>
      {error ? <span className="proStoreError" role="status">{error}</span> : null}
      {connectionMessage ? <span className="proStoreConnected" role="status">{connectionMessage}</span> : null}
    </div>
  );
}
