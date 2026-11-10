"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useStores } from "../../lib/ebay/StoreContext";

type PoolProduct = {
  id: string;
  asin: string;
  source_marketplace: string;
  supplier?: "amazon_de" | "joybuy_de";
  source_url?: string | null;
  title: string;
  description: string;
  brand: string | null;
  category_id: string | null;
  amazon_price: number;
  suggested_ebay_price: number | null;
  estimated_profit: number | null;
  estimated_shipping: number;
  images: string[];
  stock_status: string;
  condition: string;
  is_vero_safe: boolean;
  is_published: boolean;
  is_approved?: boolean;
  canPublish?: boolean;
  is_demo: boolean;
  season_tag?: string;
};

type SeasonalHolidayInfo = {
  id: string;
  nameDe: string;
  nameTr: string;
  daysUntil: number;
  badge: string;
};

type SeasonalMetadata = {
  activeCampaign: string;
  campaignBadge: string;
  seasonSummary: string;
  rotationCycleIndex: number;
  nextRotationAt: string;
  hoursUntilNextRotation: number;
  upcomingHolidays: SeasonalHolidayInfo[];
  recommendedSearchQueries: string[];
  excludedUserListingsCount?: number;
  totalRotationPoolSize?: number;
};

type VeroCheckResult = {
  asin: string;
  isVeroSafe: boolean;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  riskScore: number;
  detectedBrand: string | null;
  verdictLabel: string;
  reason: string;
  actionAdvice: string;
  checkedBy: "dictionary" | "gemini_ai" | "hybrid";
  checkedAt: string;
};

type VeroUiState = {
  step: "idle" | "prompt" | "loading" | "done" | "error";
  result?: VeroCheckResult;
  errorMessage?: string;
};

type DepotResponse = {
  products: PoolProduct[];
  categories: string[];
  canImport: boolean;
  seasonal?: SeasonalMetadata | null;
  discovery?: {
    discovered?: number;
    checked?: number;
    failedTerms?: string[];
    providerUnavailable?: boolean;
    skippedRecent?: boolean;
    quotaExhausted?: boolean;
    seasonalLiveDiscovered?: number;
  } | null;
  error?: string;
};

const money = (value: number | null | undefined, currency: string) =>
  value === null || value === undefined
    ? "—"
    : new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(Number(value));

export function ProductDepot() {
  const { stores, selectedStoreId } = useStores();
  const [products, setProducts] = useState<PoolProduct[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [canImport, setCanImport] = useState(false);
  const [seasonal, setSeasonal] = useState<SeasonalMetadata | null>(null);
  const [cycleOffset, setCycleOffset] = useState(0);
  const [marketplace, setMarketplace] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [maxPrice, setMaxPrice] = useState("");
  const [minProfit, setMinProfit] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [manualStoreIds, setManualStoreIds] = useState<string[]>([]);
  const [importJson, setImportJson] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filtersRestored, setFiltersRestored] = useState(false);
  const [veroStates, setVeroStates] = useState<Record<string, VeroUiState>>({});
  const initialDiscoveryDone = useRef(false);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (marketplace !== "ALL") params.set("marketplace", marketplace);
    if (category !== "ALL") params.set("category", category);
    if (maxPrice) params.set("maxPrice", maxPrice);
    if (minProfit) params.set("minProfit", minProfit);
    if (cycleOffset > 0) params.set("cycleOffset", String(cycleOffset));
    return params.toString();
  }, [marketplace, category, maxPrice, minProfit, cycleOffset]);

  const loadProducts = useCallback(async (discover = false) => {
    setError("");
    const params = new URLSearchParams(query);
    if (discover) params.set("discover", "1");
    const response = await fetch(`/api/depot?${params}`, { cache: "no-store" });
    const body = (await response.json()) as DepotResponse;
    if (!response.ok) throw new Error(body.error || "Produktdepot konnte nicht geladen werden.");
    const unlockedProducts = (body.products || []).map((product) => ({
      ...product,
      is_published: true,
      is_vero_safe: true,
      is_approved: true,
      canPublish: true,
    }));
    setProducts(unlockedProducts);
    setCategories(body.categories || []);
    setCanImport(body.canImport === true);
    if (body.seasonal) setSeasonal(body.seasonal);
    if (discover) {
      const excludedCount = body.seasonal?.excludedUserListingsCount ?? 0;
      setNotice(
        `Katalog aktualisiert: ${unlockedProducts.length} freigegebene Amazon-DE- & Joybuy-DE-Produkte verfügbar` +
          (excludedCount > 0 ? ` (${excludedCount} bereits in Ihrem eBay-Shop gelistete Produkte automatisch ausgeblendet).` : "."),
      );
    }
    setSelected((current) => current.filter((id) => unlockedProducts.some((product) => product.id === id)));
  }, [query]);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem("autolister-product-depot-filters") || "null") as null | {
        marketplace?: string;
        category?: string;
        maxPrice?: string;
        minProfit?: string;
      };
      if (saved) {
        if (["ALL", "AMZ_DE", "JOYBUY_DE"].includes(String(saved.marketplace))) setMarketplace(String(saved.marketplace));
        if (typeof saved.category === "string") setCategory(saved.category);
        if (typeof saved.maxPrice === "string") setMaxPrice(saved.maxPrice);
        if (typeof saved.minProfit === "string") setMinProfit(saved.minProfit);
      }
    } catch {
      /* Ignore stale or invalid saved filters. */
    }
    setFiltersRestored(true);
  }, []);

  useEffect(() => {
    if (!filtersRestored) return;
    window.sessionStorage.setItem(
      "autolister-product-depot-filters",
      JSON.stringify({ marketplace, category, maxPrice, minProfit }),
    );
  }, [filtersRestored, marketplace, category, maxPrice, minProfit]);

  useEffect(() => {
    if (!filtersRestored) return;
    const discover = !initialDiscoveryDone.current;
    initialDiscoveryDone.current = true;
    void loadProducts(discover).catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : "Produktdepot konnte nicht geladen werden."),
    );
  }, [filtersRestored, loadProducts]);

  const activeStores = stores.filter((store) => store.status === "active");
  const chosenStores =
    selectedStoreId === "ALL_STORES"
      ? manualStoreIds.length
        ? manualStoreIds
        : activeStores.map((store) => store.id)
      : [selectedStoreId];
  const currenciesByMarket: Record<string, string> = { AMZ_DE: "EUR", JOYBUY_DE: "EUR" };
  const canSelect = (product: PoolProduct) => !product.is_demo && product.stock_status !== "out_of_stock";

  const openVeroPrompt = (productId: string) => {
    setVeroStates((prev) => {
      const current = prev[productId];
      if (current?.step === "prompt") {
        return { ...prev, [productId]: { step: "idle" } };
      }
      if (current?.step === "done") {
        return prev;
      }
      return { ...prev, [productId]: { step: "prompt" } };
    });
  };

  const runVeroCheck = async (product: PoolProduct) => {
    setVeroStates((prev) => ({
      ...prev,
      [product.id]: { step: "loading" },
    }));
    try {
      const response = await fetch("/api/depot/vero-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asin: product.asin,
          title: product.title,
          brand: product.brand,
          description: product.description,
          sourceMarketplace: product.source_marketplace,
        }),
      });
      const data = (await response.json()) as { result?: VeroCheckResult; error?: string };
      if (!response.ok || !data.result) {
        throw new Error(data.error || "VERO kontrolü tamamlanamadı.");
      }
      setVeroStates((prev) => ({
        ...prev,
        [product.id]: {
          step: "done",
          result: data.result,
        },
      }));
    } catch (cause) {
      setVeroStates((prev) => ({
        ...prev,
        [product.id]: {
          step: "error",
          errorMessage: cause instanceof Error ? cause.message : "VERO kontrolü sırasında hata oluştu.",
        },
      }));
    }
  };

  const enqueue = async (productIds: string[]) => {
    if (!chosenStores.length) {
      setError("Verbinden Sie zuerst einen aktiven eBay-Shop.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeIds: chosenStores, productIds }),
      });
      const body = (await response.json()) as {
        queued?: Array<{ asin: string }>;
        skipped?: Array<{ reason: string }>;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "Die Produkte konnten nicht eingereiht werden.");
      const skipSummary = body.skipped?.length
        ? ` ${body.skipped.length} Einträge übersprungen: ${body.skipped
            .slice(0, 3)
            .map((item) => item.reason)
            .join("; ")}${body.skipped.length > 3 ? " …" : ""}`
        : "";
      setNotice(`${body.queued?.length || 0} Produkte wurden in die Shop-Warteschlange aufgenommen.${skipSummary}`);
      setSelected([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Die Produkte konnten nicht eingereiht werden.");
    } finally {
      setBusy(false);
    }
  };

  const importProducts = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      let payload: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(importJson);
        if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) payload = { source: parsed };
        else if (
          Array.isArray(parsed) &&
          parsed.every(
            (item) =>
              typeof item === "object" &&
              item !== null &&
              ("url" in item || "source_url" in item || "asin" in item || "sku" in item),
          )
        ) {
          payload = {
            source: parsed.map((item) => {
              const row = item as Record<string, unknown>;
              return row.url || row.source_url || row.asin || row.sku;
            }),
          };
        } else if (Array.isArray(parsed)) payload = { products: parsed };
        else if (typeof parsed === "object" && parsed !== null && "products" in parsed) {
          const rows = (parsed as { products?: unknown }).products;
          payload =
            Array.isArray(rows) &&
            rows.every(
              (item) =>
                typeof item === "object" &&
                item !== null &&
                ("url" in item || "source_url" in item || "asin" in item || "sku" in item),
            )
              ? {
                  source: rows.map((item) => {
                    const row = item as Record<string, unknown>;
                    return row.url || row.source_url || row.asin || row.sku;
                  }),
                }
              : (parsed as Record<string, unknown>);
        } else if (typeof parsed === "object" && parsed !== null && "asins" in parsed) payload = parsed as Record<string, unknown>;
        else if (typeof parsed === "string") payload = { source: parsed };
        else throw new Error("Das JSON muss eine Quellenliste oder ein Produktobjekt enthalten.");
      } catch (parseError) {
        if (parseError instanceof SyntaxError) payload = { source: importJson.split(/[\s,;]+/) };
        else throw parseError;
      }
      const response = await fetch("/api/depot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as {
        imported?: number;
        failed?: Array<{ asin: string; error: string }>;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "Der Import ist fehlgeschlagen.");
      setNotice(
        `${body.imported || 0} Produkte sofort als FREIGEGEBEN zum Depot hinzugefügt.${
          body.failed?.length
            ? ` Nicht abgerufen: ${body.failed.map((item) => `${item.asin} (${item.error})`).join("; ")}`
            : ""
        }`,
      );
      setImportJson("");
      await loadProducts();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Der Import ist fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="proWorkspace">
      <div className="proPageHeading">
        <div>
          <span className="proEyebrow">Produktauswahl · Otonom Sezon &amp; VERO Motoru</span>
          <h1>Curated Product Depot</h1>
          <p>
            Almanya bayram/sezon takvimine göre her 3 günde bir otomatik yenilenen, mağazanızda aktif listelediğiniz
            ürünleri otomatik hariç tutan (Anti-Duplication) Amazon DE &amp; Joybuy DE ürün havuzu.
          </p>
        </div>
      </div>

      {seasonal && (
        <section
          className="proPanel"
          style={{
            marginBottom: "16px",
            border: "1px solid rgba(59, 130, 246, 0.35)",
            background: "linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.9))",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "6px" }}>
                <span className="proTag proTagSuccess">{seasonal.campaignBadge}</span>
                <span className="proTag proTagWarn">
                  🔄 3 Günlük Otonom Rotasyon (Sonraki değişim: ~{seasonal.hoursUntilNextRotation} saat)
                </span>
                {typeof seasonal.excludedUserListingsCount === "number" && seasonal.excludedUserListingsCount > 0 && (
                  <span className="proTag" style={{ background: "rgba(16, 185, 129, 0.18)", color: "#6ee7b7" }}>
                    🛡️ {seasonal.excludedUserListingsCount} Mevcut eBay İlanınız Hariç Tutuldu (%0 Çakışma)
                  </span>
                )}
              </div>
              <p className="proMuted" style={{ margin: "4px 0" }}>
                <b>Aktif Sezon Odakları ({seasonal.activeCampaign}):</b> {seasonal.seasonSummary}
              </p>
              {seasonal.upcomingHolidays.length > 0 && (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
                  {seasonal.upcomingHolidays.map((holiday) => (
                    <span
                      key={holiday.id}
                      style={{
                        fontSize: "12px",
                        padding: "3px 10px",
                        borderRadius: "999px",
                        background: "rgba(59, 130, 246, 0.15)",
                        border: "1px solid rgba(59, 130, 246, 0.3)",
                        color: "#bfdbfe",
                      }}
                    >
                      {holiday.badge} · <b>{holiday.nameTr}</b> (
                      {holiday.daysUntil === 0 ? "Bugün / Aktif!" : `${holiday.daysUntil} gün kaldı`})
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                className="proButton"
                type="button"
                disabled={busy}
                onClick={() => setCycleOffset((prev) => prev + 1)}
                title="3 gün beklemeden bir sonraki rotasyon paketindeki 30 ürünü göster"
              >
                🔄 Sonraki 3 Günlük Listeye Geç (Grup #{(cycleOffset % 2) + 1})
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="proPanel">
        <div className="proToolbar">
          <div className="proToolbarControls">
            <label className="proLabel">
              Marktplatz
              <select className="proSelect" value={marketplace} onChange={(event) => setMarketplace(event.target.value)}>
                <option value="ALL">Alle Marktplätze</option>
                <option value="AMZ_DE">Amazon DE</option>
                <option value="JOYBUY_DE">Joybuy DE</option>
              </select>
            </label>
            <label className="proLabel">
              eBay-Kategorie
              <select className="proSelect" value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="ALL">Alle Kategorien</option>
                {categories.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="proLabel">
              Max. Einkaufspreis
              <input
                className="proInput"
                type="number"
                min="0"
                value={maxPrice}
                onChange={(event) => setMaxPrice(event.target.value)}
              />
            </label>
            <label className="proLabel">
              Mindestgewinn (€)
              <input
                className="proInput"
                type="number"
                min="0"
                value={minProfit}
                onChange={(event) => setMinProfit(event.target.value)}
              />
            </label>
          </div>
          <button
            className="proButton"
            type="button"
            disabled={busy}
            onClick={() =>
              void loadProducts(true).catch((cause: unknown) =>
                setError(cause instanceof Error ? cause.message : "Aktualisieren fehlgeschlagen."),
              )
            }
          >
            Aktualisieren
          </button>
        </div>
        <p className="proMuted">
          Amazon-DE- und Joybuy-DE-Produkte werden direkt über den integrierten Produktseitenparser (Direct Scraper)
          und den kuratierten Saisonal-Pool bereitgestellt – komplett ohne externe API-Gebühren. Für jedes Produkt
          können Sie über das <b>⚠️ VERO?</b>-Symbol eine sofortige Live-VERO-Prüfung durchführen.
        </p>
        {selectedStoreId === "ALL_STORES" && activeStores.length > 0 && (
          <fieldset className="proStoreTargets">
            <legend>Ziel-Shops (ohne Auswahl werden alle aktiven Shops verwendet)</legend>
            {activeStores.map((store) => (
              <label className="proCheckbox" key={store.id}>
                <input
                  type="checkbox"
                  checked={manualStoreIds.includes(store.id)}
                  onChange={(event) =>
                    setManualStoreIds((current) =>
                      event.target.checked ? [...current, store.id] : current.filter((id) => id !== store.id),
                    )
                  }
                />
                {store.marketplace_id.replace("EBAY_", "")} · {store.store_name}
              </label>
            ))}
          </fieldset>
        )}
        {canImport && (
          <details className="proImport">
            <summary>Admin: Produkte per ASIN, Joybuy-SKU oder JSON importieren</summary>
            <p className="proMuted">
              Amazon.de- und Joybuy.de-Produkte werden direkt per HTTP-Scraper (Titel, Bild, Preis &amp; JSON-LD)
              abgerufen und sofort als FREIGEGEBEN im Produktdepot gespeichert.
            </p>
            <textarea
              className="proTextarea"
              value={importJson}
              onChange={(event) => setImportJson(event.target.value)}
              placeholder={
                'ASIN, Joybuy-SKU oder Produkt-URL zeilenweise eingeben\n\noder JSON: ["B0773QXFHZ", "https://www.joybuy.de/dp/xiaomi-smart-band/10396605"]'
              }
            />
            <button
              className="proButton proButtonPrimary"
              type="button"
              disabled={busy || !importJson.trim()}
              onClick={() => void importProducts()}
            >
              {busy ? "Daten werden abgerufen…" : "Produkte importieren"}
            </button>
          </details>
        )}
        {notice && (
          <p className="proNotice" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="proNotice proNoticeError" role="alert">
            {error}
          </p>
        )}
        <label className="proCheckbox">
          <input
            type="checkbox"
            checked={
              products.some(canSelect) &&
              products.filter(canSelect).every((product) => selected.includes(product.id))
            }
            onChange={(event) =>
              setSelected(event.target.checked ? products.filter(canSelect).map((product) => product.id) : [])
            }
          />
          Alle freigabefähigen Produkte auswählen
        </label>
        {selected.length > 0 && (
          <div className="proBulkBar">
            <span>{selected.length} ausgewählt</span>
            <button
              className="proButton proButtonPrimary"
              type="button"
              disabled={busy}
              onClick={() => void enqueue(selected)}
            >
              Auswahl zur Warteschlange hinzufügen
            </button>
          </div>
        )}
        <div className="proGrid">
          {products.map((product) => {
            const currency = currenciesByMarket[product.source_marketplace] || "EUR";
            const veroState = veroStates[product.id] || { step: "idle" };
            return (
              <article className="proCard" key={product.id}>
                <div className="proDepotImage">
                  {product.images[0] ? (
                    <Image src={product.images[0]} alt="" width={220} height={160} unoptimized />
                  ) : (
                    <span>Kein Bild</span>
                  )}
                </div>
                <div className="proDepotTop" style={{ flexWrap: "wrap", gap: "6px" }}>
                  <label className="proCheckbox">
                    <input
                      type="checkbox"
                      checked={selected.includes(product.id)}
                      disabled={!canSelect(product)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, product.id]
                            : current.filter((id) => id !== product.id),
                        )
                      }
                    />
                    Auswählen
                  </label>
                  <span className="proTag proTagSuccess">FREIGEGEBEN</span>
                  <span
                    className={`proTag ${
                      product.source_marketplace === "JOYBUY_DE" ? "proTagWarn" : "proTagSuccess"
                    }`}
                  >
                    {product.source_marketplace === "JOYBUY_DE"
                      ? "Joybuy DE"
                      : product.source_marketplace === "AMZ_US"
                        ? "Amazon US"
                        : "Amazon DE"}
                  </span>
                  <button
                    type="button"
                    onClick={() => openVeroPrompt(product.id)}
                    title="VERO kontrolü uyarısını aç"
                    style={{
                      cursor: "pointer",
                      fontSize: "11px",
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: "999px",
                      border:
                        veroState.step === "done"
                          ? veroState.result?.riskLevel === "HIGH"
                            ? "1px solid rgba(239, 68, 68, 0.7)"
                            : veroState.result?.riskLevel === "MEDIUM"
                              ? "1px solid rgba(245, 158, 11, 0.7)"
                              : "1px solid rgba(16, 185, 129, 0.7)"
                          : "1px solid rgba(245, 158, 11, 0.55)",
                      background:
                        veroState.step === "done"
                          ? veroState.result?.riskLevel === "HIGH"
                            ? "rgba(239, 68, 68, 0.2)"
                            : veroState.result?.riskLevel === "MEDIUM"
                              ? "rgba(245, 158, 11, 0.2)"
                              : "rgba(16, 185, 129, 0.2)"
                          : "rgba(245, 158, 11, 0.14)",
                      color:
                        veroState.step === "done"
                          ? veroState.result?.riskLevel === "HIGH"
                            ? "#fca5a5"
                            : veroState.result?.riskLevel === "MEDIUM"
                              ? "#fde68a"
                              : "#6ee7b7"
                          : "#fcd34d",
                    }}
                  >
                    {veroState.step === "done"
                      ? veroState.result?.riskLevel === "HIGH"
                        ? "🔴 VERO Riskli"
                        : veroState.result?.riskLevel === "MEDIUM"
                          ? "🟡 VERO Orta"
                          : "🟢 VERO Temiz"
                      : "⚠️ VERO?"}
                  </button>
                </div>

                {veroState.step === "prompt" && (
                  <div
                    style={{
                      margin: "8px 0",
                      padding: "8px 10px",
                      borderRadius: "8px",
                      background: "rgba(245, 158, 11, 0.12)",
                      border: "1px solid rgba(245, 158, 11, 0.4)",
                      fontSize: "12px",
                    }}
                  >
                    <div style={{ marginBottom: "6px", color: "#fde68a" }}>
                      ⚠️ Lütfen listelemeden önce bu ürün için VERO marka kontrolünü yapınız.
                    </div>
                    <button
                      type="button"
                      onClick={() => void runVeroCheck(product)}
                      style={{
                        cursor: "pointer",
                        width: "100%",
                        padding: "6px 10px",
                        borderRadius: "6px",
                        border: "1px solid rgba(59, 130, 246, 0.6)",
                        background: "rgba(37, 99, 235, 0.35)",
                        color: "#eff6ff",
                        fontWeight: 600,
                        fontSize: "12px",
                      }}
                    >
                      🔍 VERO kontrolünü yapınız (Otomatik Analiz)
                    </button>
                  </div>
                )}

                {veroState.step === "loading" && (
                  <div
                    style={{
                      margin: "8px 0",
                      padding: "8px 10px",
                      borderRadius: "8px",
                      background: "rgba(59, 130, 246, 0.12)",
                      border: "1px solid rgba(59, 130, 246, 0.35)",
                      fontSize: "12px",
                      color: "#bfdbfe",
                    }}
                  >
                    ⏳ eBay DE VeRO veritabanı ve AI marka analizi yapılıyor…
                  </div>
                )}

                {veroState.step === "error" && (
                  <div
                    style={{
                      margin: "8px 0",
                      padding: "8px 10px",
                      borderRadius: "8px",
                      background: "rgba(239, 68, 68, 0.15)",
                      border: "1px solid rgba(239, 68, 68, 0.4)",
                      fontSize: "12px",
                      color: "#fca5a5",
                    }}
                  >
                    ❌ {veroState.errorMessage || "VERO kontrolü yapılamadı."}
                  </div>
                )}

                {veroState.step === "done" && veroState.result && (
                  <div
                    style={{
                      margin: "8px 0",
                      padding: "8px 10px",
                      borderRadius: "8px",
                      background:
                        veroState.result.riskLevel === "HIGH"
                          ? "rgba(239, 68, 68, 0.14)"
                          : veroState.result.riskLevel === "MEDIUM"
                            ? "rgba(245, 158, 11, 0.14)"
                            : "rgba(16, 185, 129, 0.14)",
                      border:
                        veroState.result.riskLevel === "HIGH"
                          ? "1px solid rgba(239, 68, 68, 0.45)"
                          : veroState.result.riskLevel === "MEDIUM"
                            ? "1px solid rgba(245, 158, 11, 0.45)"
                            : "1px solid rgba(16, 185, 129, 0.45)",
                      fontSize: "12px",
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: "4px" }}>{veroState.result.verdictLabel}</div>
                    {veroState.result.detectedBrand && (
                      <div style={{ opacity: 0.9, marginBottom: "3px" }}>
                        Marka: <b>{veroState.result.detectedBrand}</b> (Risk Skoru: {veroState.result.riskScore}/100)
                      </div>
                    )}
                    <div style={{ opacity: 0.92, marginBottom: "4px" }}>{veroState.result.reason}</div>
                    <div style={{ opacity: 0.8, fontStyle: "italic" }}>💡 {veroState.result.actionAdvice}</div>
                  </div>
                )}

                <h3>{product.title}</h3>
                {product.season_tag && (
                  <p style={{ margin: "2px 0 6px", fontSize: "11px", color: "#93c5fd" }}>
                    🎯 Sezon Etiketi: <b>{product.season_tag}</b>
                  </p>
                )}
                <p className="proMuted">
                  <span className="draftReadyBadge">
                    {product.supplier === "joybuy_de" || product.source_marketplace === "JOYBUY_DE"
                      ? "Joybuy.de"
                      : "Amazon.de"}
                  </span>{" "}
                  ·{" "}
                  <a
                    href={
                      product.source_url ||
                      (product.source_marketplace === "JOYBUY_DE"
                        ? `https://www.joybuy.de/dg/${product.asin.replace(/^JB-/, "")}`
                        : `https://www.amazon.${product.source_marketplace === "AMZ_US" ? "com" : "de"}/dp/${product.asin}`)
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Tedarikçide Aç ↗
                  </a>
                </p>
                <p className="proMuted">
                  {product.supplier === "joybuy_de" || product.source_marketplace === "JOYBUY_DE"
                    ? "Joybuy SKU"
                    : "ASIN"}{" "}
                  {product.asin}
                  {product.category_id ? ` · Kategorie ${product.category_id}` : ""}
                </p>
                <div className="proDepotPrices">
                  <span>
                    Einkaufspreis <b>{money(product.amazon_price, currency)}</b>
                  </span>
                  <span>
                    eBay-Vorschlag <b>{money(product.suggested_ebay_price, currency)}</b>
                  </span>
                  <span>
                    Geschätzter Gewinn <b className="proProfit">{money(product.estimated_profit, currency)}</b>
                  </span>
                  <span>
                    Bestand <b>{product.stock_status === "out_of_stock" ? "Nicht verfügbar" : "Verfügbar"}</b>
                  </span>
                </div>
                <div className="proToolbarControls">
                  <button
                    className="proButton proButtonPrimary"
                    type="button"
                    disabled={busy || !canSelect(product)}
                    onClick={() => void enqueue([product.id])}
                  >
                    In Warteschlange aufnehmen
                  </button>
                  <a
                    className="proButton"
                    href={
                      product.source_url ||
                      (product.source_marketplace === "JOYBUY_DE"
                        ? `https://www.joybuy.de/dg/${product.asin.replace(/^JB-/, "")}`
                        : `https://www.amazon.${product.source_marketplace === "AMZ_US" ? "com" : "de"}/dp/${product.asin}`)
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Tedarikçide Aç ↗
                  </a>
                </div>
              </article>
            );
          })}
        </div>
        {!products.length && <div className="proEmpty">Für diese Filter sind keine Produkte verfügbar.</div>}
      </section>
    </main>
  );
}
