"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type StoreSummary = {
  id: string;
  store_name: string;
  seller_username: string | null;
  marketplace_id: string;
  token_expires_at: string;
  daily_listing_limit: number;
  auto_lister_enabled: boolean;
  auto_pull_from_depot: boolean;
  listing_interval_hours: number;
  default_margin_percent: number;
  merchant_location_key: string | null;
  fulfillment_policy_id: string | null;
  payment_policy_id: string | null;
  return_policy_id: string | null;
  status: "active" | "token_expired" | "paused";
  last_listed_at: string | null;
};

type StoreContextValue = {
  stores: StoreSummary[];
  selectedStoreId: string;
  selectedStore: StoreSummary | null;
  isAllStores: boolean;
  loading: boolean;
  error: string;
  connectionMessage: string;
  setSelectedStoreId: (storeId: string) => void;
  refreshStores: () => Promise<StoreSummary[]>;
};

const STORE_STORAGE_KEY = "autolister:selected-ebay-store";
const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [selectedStoreId, setSelectedStoreIdState] = useState("ALL_STORES");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connectionMessage, setConnectionMessage] = useState("");

  const refreshStores = useCallback(async (): Promise<StoreSummary[]> => {
    setLoading(true);
    try {
      const response = await fetch("/api/ebay/stores", { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as { stores?: StoreSummary[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Mağazalar yüklenemedi.");
      const available = body.stores || [];
      setStores(available);
      setError("");
      setSelectedStoreIdState((selected) => selected !== "ALL_STORES" && !available.some((store) => store.id === selected) ? "ALL_STORES" : selected);
      return available;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Mağazalar yüklenemedi.");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORE_STORAGE_KEY);
    if (stored) setSelectedStoreIdState(stored);
    const params = new URLSearchParams(window.location.search);
    const storeConnection = params.get("store_connection");
    const connectedStoreId = params.get("store_id");
    void refreshStores().then((available) => {
      if (storeConnection === "connected" && connectedStoreId && available.some((store) => store.id === connectedStoreId)) {
        setSelectedStoreIdState(connectedStoreId);
        window.localStorage.setItem(STORE_STORAGE_KEY, connectedStoreId);
      }
      if (storeConnection) {
        const messages: Record<string, string> = {
          connected: "eBay-Shop wurde verbunden.",
          cancelled: "Die eBay-Verbindung wurde abgebrochen.",
          invalid: "Die eBay-Verbindung konnte nicht verifiziert werden. Bitte erneut verbinden.",
          session: "Sitzung abgelaufen. Bitte erneut anmelden und den Shop verbinden.",
          failed: "eBay-Shop konnte nicht verbunden werden. Prüfen Sie die OAuth-Konfiguration.",
        };
        setConnectionMessage(messages[storeConnection] || "");
      }
      if (storeConnection) {
        params.delete("store_connection");
        params.delete("store_id");
        const query = params.toString();
        window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
      }
    });
  }, [refreshStores]);

  const setSelectedStoreId = useCallback((storeId: string) => {
    setSelectedStoreIdState(storeId);
    window.localStorage.setItem(STORE_STORAGE_KEY, storeId);
  }, []);

  const value = useMemo<StoreContextValue>(() => ({
    stores,
    selectedStoreId,
    selectedStore: stores.find((store) => store.id === selectedStoreId) || null,
    isAllStores: selectedStoreId === "ALL_STORES",
    loading,
    error,
    connectionMessage,
    setSelectedStoreId,
    refreshStores,
  }), [stores, selectedStoreId, loading, error, connectionMessage, setSelectedStoreId, refreshStores]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStores(): StoreContextValue {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStores must be used inside StoreProvider.");
  return context;
}
