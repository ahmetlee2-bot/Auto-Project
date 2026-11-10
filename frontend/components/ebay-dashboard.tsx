"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "../lib/supabase/client";
import { HeaderPreferences } from "./header-preferences";
import { ProductTable } from "./dashboard/ProductTable";
import { FavoritesPool } from "./dashboard/FavoritesPool";
import { calculateDraftTargetPrice } from "../lib/drafts/pricing";
import { StoreConnectModal } from "./dashboard/StoreConnectModal";
import { useStores } from "../lib/ebay/StoreContext";
import { DraftsTab } from "./dashboard/DraftsTab";
import { useLocale } from "../lib/locale";
import { translate } from "../lib/messages";
import { DraftListingQueueWidget } from "./dashboard/DraftListingQueueWidget";

type Listing = { listingId?: string; title?: string; price?: string; quantity?: number; status?: string; imageUrls?: string[]; source?: string };
type Margin = {
  sourcePrice: number;
  sellingPrice: number;
  recommendedSalePrice: number;
  ebayFee: number;
  profit: number;
  marginPercent: number;
};
type Automation = {
  inventory: {
    total: number;
    active: number;
    lowStock: number;
    outOfStock: number;
    attention: Array<{
      id: string;
      title: string;
      asin: string;
      stock: number;
    }>;
  };
  margin: Margin | null;
  tracking: null | {
    configured: boolean;
    total: number;
    withTracking: number;
    awaitingTracking: number;
    shipments: Array<{
      orderId: string;
      status: string;
      trackingNumber?: string | null;
    }>;
  };
};
const money = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});
const dashboardTabs = ["server-import", "live", "pool", "drafts", "automation", "archive", "settings"];

export function EbayDashboard({ email, initialTab = "server-import" }: { email: string; initialTab?: string }) {
  const { locale } = useLocale();
  const tr = (text: string) => translate(locale, text);
  const { stores } = useStores();
  const [showStoreConnect, setShowStoreConnect] = useState(false);
  const [summary, setSummary] = useState<{ pending: number; listed: number; warnings: number } | null>(null);
  const refreshSummary = useCallback(async () => {
    try { const response = await fetch("/api/dashboard/summary", { cache: "no-store" }); if (response.ok) setSummary(await response.json()); } catch { /* Keep last known counts. */ }
  }, []);
  useEffect(() => {
    void refreshSummary();
    window.addEventListener("products-changed", refreshSummary);
    const timer = window.setInterval(refreshSummary, 30000);
    return () => { window.removeEventListener("products-changed", refreshSummary); window.clearInterval(timer); };
  }, [refreshSummary]);
  const [activeTab, setActiveTab] = useState(initialTab);
  const navigateTab = useCallback((tab: string) => {
    if (!dashboardTabs.includes(tab)) return;
    setActiveTab(tab);
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem("autolister-dashboard-tab", tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.pushState({ autolisterTab: tab }, "", url);
  }, []);
  useEffect(() => {
    const restore = () => {
      const url = new URL(window.location.href);
      const queryTab = url.searchParams.get("tab");
      const stored = window.sessionStorage.getItem("autolister-dashboard-tab");
      const selected = dashboardTabs.includes(queryTab || "") ? queryTab! : dashboardTabs.includes(stored || "") ? stored! : initialTab;
      setActiveTab(selected);
      if (!queryTab) {
        url.searchParams.set("tab", selected);
        window.history.replaceState({ autolisterTab: selected }, "", url);
      }
    };
    const onPopState = () => restore();
    restore();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [initialTab]);
  const [mappings, setMappings] = useState<Array<{ id: string; title: string; amazon_asin: string; ebay_item_id: string; amazon_url: string; ebay_url: string }>>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [automation, setAutomation] = useState<Automation | null>(null);
  const [listedCount, setListedCount] = useState<number | null>(null);
  const [margin, setMargin] = useState<Margin | null>(null);
  const [marginPreviewRequested, setMarginPreviewRequested] = useState(false);
  const [sourcePrice, setSourcePrice] = useState("20");
  const [targetMargin, setTargetMargin] = useState("20");
  const [mappingItemId, setMappingItemId] = useState("");
  const [mappingAmazonUrl, setMappingAmazonUrl] = useState("");
  const [mappingNotice, setMappingNotice] = useState("");
  const [importAmazonUrl, setImportAmazonUrl] = useState("");
  const [importMargin, setImportMargin] = useState("20");
  const [importQuantity, setImportQuantity] = useState("1");
  const [imageRightsConfirmed, setImageRightsConfirmed] = useState(false);
  const [importNotice, setImportNotice] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [supabase] = useState(createClient);
  const [connectionStatus, setConnectionStatus] = useState<{
    ok?: boolean;
    error?: string;
  } | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  const [setupNotice, setSetupNotice] = useState("");
  const refresh = useCallback(async () => {
    setBusy(true); setError("");
    const read = async (path: string) => { const response = await fetch(path, { cache: "no-store" }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "Veriler alınamadı."); return body; };
    const results = await Promise.allSettled([read("/api/ebay/listings"), read("/api/tracked-products")]);
    const failures: string[] = [];
    if (results[0].status === "fulfilled") {
      const body = results[0].value;
      setListings(body.listings || []); setListedCount((body.listings || []).length); setConnectionStatus({ ok: body.connected === true });
    } else { failures.push(results[0].reason.message); }
    if (results[1].status === "fulfilled") {
      const products = results[1].value.products || [];
      setMappings(products);
      setAutomation({ inventory: {
        total: products.length, active: products.filter((p: { active: boolean }) => p.active).length,
        lowStock: products.filter((p: { active: boolean; ebay_quantity: number }) => p.active && p.ebay_quantity > 0 && p.ebay_quantity < 3).length,
        outOfStock: products.filter((p: { active: boolean; amazon_stock_status: boolean | null }) => p.active && p.amazon_stock_status === false).length,
        attention: products.filter((p: { active: boolean; sync_status: string; last_error?: string | null }) => p.active && ["error", "out_of_stock"].includes(p.sync_status) && !p.last_error?.startsWith("VERIFICATION_PENDING:")).map((p: { id: string; title: string; amazon_asin: string; ebay_quantity: number }) => ({ id: p.id, title: p.title, asin: p.amazon_asin, stock: p.ebay_quantity })),
      }, margin: null, tracking: null });
    } else { failures.push(results[1].reason.message); }
    if (failures.length) setError(failures.join(" · "));
    setBusy(false);
  }, []);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  async function calculateMargin(
    targetMarginPercent = targetMargin,
    showPreview = false,
  ) {
    try {
      const cost = Number(sourcePrice), requestedMargin = Number(targetMarginPercent);
      const recommendedSalePrice = calculateDraftTargetPrice({ source_price: cost, shipping_cost: 0, profit_margin_percent: requestedMargin });
      if (recommendedSalePrice == null || cost <= 0 || !Number.isFinite(requestedMargin) || requestedMargin < 0 || requestedMargin > 300) throw new Error("Geçerli fiyat ve %0–300 arası marj girin.");
      const ebayFee = Math.round(recommendedSalePrice * 0.15 * 100) / 100;
      const profit = Math.round((recommendedSalePrice - cost - ebayFee) * 100) / 100;
      const result = { sourcePrice: cost, sellingPrice: recommendedSalePrice, recommendedSalePrice, ebayFee, profit, marginPercent: Math.round(profit / cost * 10000) / 100 };
      setMargin(result);
      if (showPreview) setMarginPreviewRequested(true);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Berechnung fehlgeschlagen.",
      );
    }
  }
  async function saveMapping() {
    try {
      const response = await fetch("/api/tracked-products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ebayItemId: mappingItemId, amazonUrl: mappingAmazonUrl }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      window.dispatchEvent(new Event("products-changed"));
      await refresh();
      setMappingItemId("");
      setMappingAmazonUrl("");
      setMappingNotice("Amazon-Zuordnung gespeichert.");
    } catch (cause) {
      setMappingNotice(
        cause instanceof Error
          ? cause.message
          : "Zuordnung konnte nicht gespeichert werden.",
      );
    }
  }
  async function importFromAmazon() {
    if (!importAmazonUrl.trim()) {
      setImportNotice("Bitte zuerst eine Amazon-URL oder ASIN eingeben.");
      return;
    }
    if (!imageRightsConfirmed) {
      setImportNotice(
        "Bitte bestätige zuerst die Nutzungsrechte der Produktbilder.",
      );
      return;
    }
    if (
      !Number.isFinite(Number(importMargin)) ||
      Number(importMargin) < 0 ||
      Number(importMargin) > 300
    ) {
      setImportNotice(
        "Bitte eine gültige Zielmarge zwischen 0 und 300 eingeben.",
      );
      return;
    }
    if (
      !Number.isInteger(Number(importQuantity)) ||
      Number(importQuantity) < 1
    ) {
      setImportNotice("Bitte eine gültige Stückzahl ab 1 eingeben.");
      return;
    }
    setImportBusy(true);
    setImportNotice("Verbinde mit dem Server und starte den Amazon-Auftrag …");
    try {
      const response = await fetch("/api/favorites/import", {
        headers: { "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({
          amazonUrl: importAmazonUrl.trim(),
          targetMarginPercent: Number(importMargin),
          quantity: Number(importQuantity),
          imageRightsConfirmed,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Ürün alınamadı.");
      setImportNotice(locale === "tr" ? "Ürün havuzuna eklendi. İnceleyip düzenleyebilirsiniz." : locale === "en" ? "Added to the pool. Review and edit before publishing." : "Im Produktpool gespeichert. Vor der Veröffentlichung prüfen und bearbeiten.");
      window.dispatchEvent(new Event("products-changed"));
      navigateTab("pool");
      setImportAmazonUrl("");
      await refresh();
    } catch (cause) {
      setImportNotice(
        cause instanceof Error
          ? cause.message
          : "Der Server-Auftrag konnte nicht gestartet werden.",
      );
    } finally {
      setImportBusy(false);
    }
  }
  async function logout() {
    await supabase.auth.signOut();
    window.location.assign("/login");
  }
  async function connectEbay() { setShowStoreConnect(true); }
  const inventory = automation?.inventory;
  const tracking = automation?.tracking;
  const tabs = [
    ["server-import", locale === "tr" ? "Amazon Merkezi" : locale === "en" ? "Amazon Center" : "Amazon-Zentrale"],
    ["live", tr("Aktive eBay-Angebote")],
    ["pool", tr("Produktpool")],
    ["drafts", tr("Produktentwürfe")],
    ["automation", tr("Synchronisation")],
    ["archive", tr("Archiv")],
    ["settings", tr("Einstellungen")],
  ];
  return (
    <main className="webDashboard">
      <StoreConnectModal open={showStoreConnect} onClose={() => setShowStoreConnect(false)} />
      <DraftListingQueueWidget onNavigate={navigateTab} />
      <header className="dashboardHeader">
        <div>
          <span className="sectionEyebrow">AUTOLISTER · EBAY.DE</span>
          <h1>{tr("Verwaltungsübersicht")}</h1>
          <p className="dashboardSubtitle">
            {locale === "tr" ? "Ürünler, ilanlar ve stok tek yerde." : locale === "en" ? "Products, listings and stock in one place." : "Produkte, Angebote und Bestand an einem Ort."}
          </p>
        </div>
        <div className="dashboardUser">
          <HeaderPreferences />
          <span
            className={
              error ? "dashboardHealth dashboardHealthWarn" : "dashboardHealth"
            }
          >
            {error
              ? tr("Prüfung erforderlich")
              : busy
                ? tr("Synchronisierung läuft")
                : tr("System ist bereit")}
          </span>
          <details className="dashboardAccount">
            <summary>
              <span className="dashboardAvatar" aria-hidden="true">
                {email.slice(0, 1).toUpperCase()}
              </span>
              <span>{email || "Konto"}</span>
              <span aria-hidden="true">⌄</span>
            </summary>
            <div className="dashboardAccountMenu">
              <span>{email}</span>
              <button type="button" onClick={() => void logout()}>
                {tr("Ausloggen")}
              </button>
            </div>
          </details>
        </div>
      </header>
      <section className="dashboardStats">
        <article>
          <span>{tr("Wartende Produkte")}</span>
          <strong>{summary?.pending ?? "…"}</strong><small>{locale === "tr" ? "Havuzda inceleme bekliyor" : locale === "en" ? "Awaiting review in your pool" : "Warten im Pool auf Prüfung"}</small>
        </article>
        <article>
          <span>{tr("Gelistet auf eBay")}</span>
          <strong>{listedCount ?? summary?.listed ?? "…"}</strong><small>{locale === "tr" ? "Fiyat ve stok takibinde" : locale === "en" ? "Price and stock monitoring" : "Preis- und Bestandsüberwachung"}</small>
        </article>
        <article>
          <span>{tr("Synchronisierungswarnungen")}</span>
          <strong>
            {summary?.warnings ?? "…"}
          </strong><small>{locale === "tr" ? (summary?.warnings === 0 ? "Tüm sistemler stabil" : "Kontrol gereken ürünler") : locale === "en" ? "Products requiring attention" : "Produkte mit Prüfbedarf"}</small>
        </article>
      </section>
      {connectionStatus && !connectionStatus.ok && !stores.some(store => store.status === "active") && activeTab !== "settings" ? (
        <div className="dashboardOnboardingBanner" role="status">
          <div>
            <strong>{tr("eBay-Konto noch nicht verbunden")}</strong>
            <p>{tr("Verbinde zuerst dein eBay-Verkäuferkonto unter Einstellungen, damit Entwürfe, Angebote und Synchronisierung geladen werden können.")}</p>
          </div>
          <button
            type="button"
            className="primaryButton"
            onClick={() => navigateTab("settings")}
          >
            {tr("Zur Einrichtung →")}
          </button>
        </div>
      ) : error ? (
        <p className="authError">{error}</p>
      ) : null}
      <nav
        className="dashboardTabs"
        role="tablist"
        aria-label={locale === "de" ? "Dashboard Bereiche" : locale === "en" ? "Dashboard sections" : "Panel bölümleri"}
      >
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            className={activeTab === id ? "active" : ""}
            onClick={() => navigateTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {activeTab === "server-import" ? (
        <section id="server-import" className="dashboardCard">
          <div>
            <p className="sectionEyebrow">{tr("SERVERVERARBEITUNG")}</p>
            <h2>{locale === "tr" ? "Amazon’dan Ürün Çek & Havuza Ekle" : locale === "en" ? "Import Amazon product to your pool" : "Amazon-Produkt laden und im Pool prüfen"}</h2>
            <p className="emptyDashboard">
              {locale === "tr" ? "Amazon URL’si veya ASIN girin. Ürün, fiyat, görseller ve standart açıklama inceleme havuzunuza kaydedilir. İnceledikten sonra yayınlayın." : locale === "en" ? "Enter an Amazon URL or ASIN. Review product details, images, price and the standard description in your pool before publishing." : "Amazon-URL oder ASIN eingeben. Produktdaten, Bilder, Preis und Standardbeschreibung werden im Pool zur Prüfung gespeichert. Erst nach der Prüfung veröffentlichen."}
            </p>
          </div>
          <div className="mappingInputs">
            <label>
              {tr("Amazon.de URL oder ASIN")}
              <input
                value={importAmazonUrl}
                onChange={(event) => setImportAmazonUrl(event.target.value)}
                placeholder="https://www.amazon.de/dp/B0..."
              />
            </label>
            <label>
              {tr("Zielmarge %")}
              <input
                inputMode="decimal"
                value={importMargin}
                onChange={(event) => setImportMargin(event.target.value)}
              />
            </label>
            <label>
              {tr("Stückzahl")}
              <input
                inputMode="numeric"
                value={importQuantity}
                onChange={(event) => setImportQuantity(event.target.value)}
              />
            </label>
          </div>
          <div className="mappingInputs">
            <label>
              <input
                type="checkbox"
                checked={imageRightsConfirmed}
                onChange={(event) =>
                  setImageRightsConfirmed(event.target.checked)
                }
              />{" "}
              {tr("Ich bestätige die Nutzungsrechte der Produktbilder.")}
            </label>
            <button
              className="primaryButton"
              disabled={importBusy || !importAmazonUrl.trim()}
              onClick={() => void importFromAmazon()}
            >
              {importBusy
                ? tr("Auftrag wird gestartet …")
                : locale === "tr" ? "Ürün Havuzuna Ekle & İncele" : locale === "en" ? "Add to pool & review" : "Im Pool speichern & prüfen"}
            </button>
          </div>
          {importNotice ? <p className="authNotice">{importNotice}</p> : null}
        </section>
      ) : null}
      {activeTab === "automation" ? (
        <section id="automation" className="automationGrid">
          <article className="dashboardCard">
            <div className="dashboardCardHeading">
              <div>
                <p className="sectionEyebrow">{tr("Lagerbestand & Preis")}</p>
                <h2>{tr("Synchronisationsmotor")}</h2>
              </div>
              <button className="quietButton" onClick={() => void refresh()}>
                {tr("Aktualisieren")}
              </button>
            </div>
            <div className="moduleMetrics">
              <span>
                <b>{inventory?.total ?? "—"}</b> {tr("Produkte überwacht")}
              </span>
              <span>
                <b>{inventory?.lowStock ?? "—"}</b> {tr("Niedriger Bestand")}
              </span>
              <span>
                <b>{inventory?.outOfStock ?? "—"}</b> {tr("Nicht verfügbar")}
              </span>
            </div>
            {inventory?.attention?.length ? (
              <ul className="attentionList">
                {inventory.attention.map((item) => (
                  <li key={item.id}>
                    <span>{item.title}</span>
                    <b>{item.stock} {locale === "de" ? "Stk." : locale === "en" ? "pcs" : "adet"}</b>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="emptyDashboard">{tr("Keine Bestandswarnungen.")}</p>
            )}
          </article>
          <article className="dashboardCard">
            <div>
              <p className="sectionEyebrow">{tr("PREISBERECHNUNG")}</p>
              <h2>{tr("Gewinn & Provision")}</h2>
            </div>
            <div className="marginInputs">
              <label>
                {tr("Amazon-Preis")}
                <input
                  inputMode="decimal"
                  value={sourcePrice}
                  onChange={(event) => setSourcePrice(event.target.value)}
                />
              </label>
              <label>
                {tr("Zielmarge %")}
                <input
                  inputMode="decimal"
                  value={targetMargin}
                  onChange={(event) => setTargetMargin(event.target.value)}
                />
              </label>
              <button
                className="primaryButton"
                onClick={() => void calculateMargin()}
              >
                {tr("Berechnen")}
              </button>
            </div>
            {margin ? (
              <div className="marginResult">
                <span>
                  {tr("Empfohlener eBay-Preis")}
                  <strong>{money.format(margin.recommendedSalePrice)}</strong>
                </span>
                <span>
                  {locale === "de" ? "Gewinn" : locale === "en" ? "Profit" : "Kâr"}
                  <strong>
                    {money.format(margin.profit)} · {margin.marginPercent}%
                  </strong>
                </span>
              </div>
            ) : (
              <p className="emptyDashboard">{tr("Berechnung wird geladen …")}</p>
            )}
          </article>
          <article className="dashboardCard">
            <div className="dashboardCardHeading">
              <div>
                <p className="sectionEyebrow">{tr("VERSAND")}</p>
                <h2>{tr("Tracking-Nummern")}</h2>
              </div>
              <span
                className={
                  tracking?.configured ? "statusChip" : "statusChip mutedChip"
                }
              >
                {tracking?.configured ? tr("Verbunden") : tr("eBay verbinden")}
              </span>
            </div>
            <p className="dashboardSubtitle">{locale === "tr" ? "Sipariş, müşteri, kargo ve gerçek takip bilgilerini yönetin." : "Manage orders, carriers and verified tracking data."}</p>
            <a className="primaryButton" href="/dashboard/orders">{locale === "tr" ? "Takip Kodu Gir / Dönüştür & eBay’e Gönder →" : "Orders & tracking →"}</a>
          </article>
        </section>
      ) : null}
      {activeTab === "live" ? (
        <section id="live" className="dashboardCard">
          <div className="dashboardCardHeading">
            <div>
              <p className="sectionEyebrow">{tr("eBay Live")}</p>
              <h2>{tr("Aktive eBay-Angebote")} & {tr("Produktüberwachung")}</h2>
            </div>
            <span className="statusChip">{listings.length} {tr("Listings")}</span>
          </div>
          {busy ? <p>{tr("Live-Angebote werden geladen …")}</p> : <ProductTable listings={listings} />}
        </section>
      ) : null}
      {activeTab === "pool" ? (
        <section id="pool" className="dashboardCard">
          <FavoritesPool onInspect={() => navigateTab("drafts")} />
        </section>
      ) : null}
      {activeTab === "drafts" ? <DraftsTab /> : null}
      {activeTab === "server-import" ? (
        <section id="matcher" className="dashboardCard">
          <div>
            <p className="sectionEyebrow">{tr("Manuelle Produktzuordnung")}</p>
            <h2>{tr("Amazon-Produkt manuell verknüpfen")}</h2>
          </div>
          <div className="mappingInputs">
            <label>
              {tr("eBay Item ID")}
              <input
                value={mappingItemId}
                onChange={(event) => setMappingItemId(event.target.value)}
                placeholder="z. B. 407164679608"
              />
            </label>
            <label>
              {tr("Amazon ASIN oder URL")}
              <input
                value={mappingAmazonUrl}
                onChange={(event) => setMappingAmazonUrl(event.target.value)}
                placeholder="https://www.amazon.de/dp/B0..."
              />
            </label>
            <button
              className="primaryButton"
              onClick={() => void saveMapping()}
            >
              {tr("Zuordnung speichern")}
            </button>
          </div>
          {mappingNotice ? <p className="authNotice">{mappingNotice}</p> : null}
          <div className="proTableWrap"><table className="proTable"><thead><tr><th>Amazon ASIN</th><th>eBay Item ID</th><th>{locale === "tr" ? "Ürün" : "Product"}</th></tr></thead><tbody>{mappings.map(item => <tr key={item.id}><td><a href={item.amazon_url} target="_blank" rel="noopener noreferrer">{item.amazon_asin}</a></td><td><a href={item.ebay_url} target="_blank" rel="noopener noreferrer">{item.ebay_item_id}</a></td><td>{item.title}</td></tr>)}</tbody></table>{!mappings.length && <p className="proEmpty">{locale === "tr" ? "Henüz ASIN – eBay eşlemesi yok." : "No ASIN – eBay mappings yet."}</p>}</div>

        </section>
      ) : null}
      {activeTab === "archive" ? (
        <section id="archive" className="dashboardCard">
          <div>
            <p className="sectionEyebrow">{tr("Archiv")}</p>
            <h2>{tr("Gelöschte und zurückgesetzte Entwürfe")}</h2>
          </div>
          <p className="emptyDashboard">
            {tr("Das Archiv wird aus dem eBay-Bridge-Verlauf synchronisiert.")}
          </p>
        </section>
      ) : null}
      {activeTab === "settings" ? (
        <section id="settings" className="dashboardCard setupGuide">
          <div>
            <p className="sectionEyebrow">{tr("ERSTE SCHRITTE")}</p>
            <h2>{tr("In 3 Schritten startklar")}</h2>
            <p className="dashboardSubtitle">
              {tr("Verbinde den Produktimport mit deinem eBay-Ablauf.")}
            </p>
          </div>
          <div className="setupSteps">
            <article className="setupStep">
              <div className="setupStepHead">
                <span className="setupStepNumber">{tr("Schritt 1").toUpperCase()}</span>
                <span aria-hidden="true">▣</span>
              </div>
              <h3>{locale === "tr" ? "Chrome Eklentisi veya Bulut Motoru" : "Chrome / Cloud Import"}</h3>
              <p>
                {tr("Erfasse Produktdaten direkt auf Amazon.de. Der Importauftrag wird anschließend an AutoLister übergeben.")}
              </p>
              <a
                className="secondaryButton"
                href="https://chromewebstore.google.com/detail/phppekchehibeiphdmjifmceoencigee"
                target="_blank"
                rel="noopener noreferrer"
              >
                {tr("Erweiterung im Chrome Web Store öffnen ↗")}
              </a>
            </article>
            <article className="setupStep">
              <div className="setupStepHead">
                <span className="setupStepNumber">{tr("Schritt 2").toUpperCase()}</span>
                <span
                  className={
                    (stores.some(store => store.status === "active") || connectionStatus?.ok)
                      ? "setupStatus connected"
                      : "setupStatus"
                  }
                >
                  {connectionStatus === null
                    ? tr("Status wird geprüft")
                    : (stores.some(store => store.status === "active") || connectionStatus.ok)
                      ? tr("Token aktiv")
                      : tr("Nicht verbunden")}
                </span>
              </div>
              <h3>{tr("eBay-Konto autorisieren")}</h3>
              <p>
                {tr("Die Zugangsdaten werden serverseitig geschützt. AutoLister nutzt die offizielle eBay REST-Schnittstelle. Aktuell wird das für dieses Konto freigeschaltete eBay-Verkäuferkonto verbunden.")}
              </p>
              <button
                className="primaryButton"
                type="button"
                disabled={connectBusy}
                onClick={() => void connectEbay()}
              >
                {connectBusy ? tr("eBay wird geöffnet …") : tr("eBay-Konto sicher verbinden")}
              </button>
              {stores.map(store => <p key={store.id}>{store.store_name}<br /><small>{locale === "tr" ? "Token bitişi: " : "Token: "}{new Date(store.token_expires_at).toLocaleString()}</small></p>)}
              {connectionStatus?.error && !stores.some(store => store.status === "active") ? (
                <p className="setupFeedback authError">
                  {connectionStatus.error}
                </p>
              ) : null}
            </article>
            <article className="setupStep">
              <div className="setupStepHead">
                <span className="setupStepNumber">{tr("Schritt 3").toUpperCase()}</span>
                <span className="setupStatus">{tr("Produkt vorbereiten")}</span>
              </div>
              <h3>{locale === "tr" ? "Favori Havuzuna Ekle & İncele" : "Im Pool speichern & prüfen"}</h3>
              <p>
                {tr("Amazon-URL oder ASIN eingeben und Marge, Menge sowie Bildrechte vor dem Auftrag prüfen.")}
              </p>
              <div className="setupImportAction">
                <div className="mappingInputs">
                  <label>
                    {tr("Amazon-URL oder ASIN")}
                    <input
                      value={importAmazonUrl}
                      onChange={(event) =>
                        setImportAmazonUrl(event.target.value)
                      }
                      placeholder="https://www.amazon.de/dp/B0…"
                    />
                  </label>
                  <label>
                    {tr("Amazon-Einkaufspreis €")}
                    <input
                      inputMode="decimal"
                      value={sourcePrice}
                      onChange={(event) => setSourcePrice(event.target.value)}
                    />
                  </label>
                  <label>
                    {tr("Zielmarge %")}
                    <input
                      inputMode="decimal"
                      value={importMargin}
                      onChange={(event) => setImportMargin(event.target.value)}
                    />
                  </label>
                  <label>
                    {tr("Stückzahl")}
                    <input
                      inputMode="numeric"
                      value={importQuantity}
                      onChange={(event) =>
                        setImportQuantity(event.target.value)
                      }
                    />
                  </label>
                </div>
                <button
                  className="secondaryButton"
                  type="button"
                  onClick={() => void calculateMargin(importMargin, true)}
                >
                  {tr("Preisvorschau berechnen")}
                </button>
                {marginPreviewRequested && margin ? (
                  <div className="marginResult">
                    <span>
                      {tr("Empfohlener eBay-Preis")}
                      <strong>
                        {money.format(margin.recommendedSalePrice)}
                      </strong>
                    </span>
                    <span>
                      {tr("Geschätzter Gewinn")}
                      <strong>{money.format(margin.profit)}</strong>
                    </span>
                  </div>
                ) : null}
                <label className="setupCheck">
                  <input
                    type="checkbox"
                    checked={imageRightsConfirmed}
                    onChange={(event) =>
                      setImageRightsConfirmed(event.target.checked)
                    }
                  />{" "}
                  {tr("Ich darf die Produktbilder verwenden.")}
                </label>
                <button
                  className="primaryButton"
                  type="button"
                  disabled={importBusy || !importAmazonUrl.trim()}
                  onClick={() => void importFromAmazon()}
                >
                  {importBusy ? tr("Auftrag wird gestartet …") : locale === "tr" ? "Ürün Havuzuna Ekle & İncele" : locale === "en" ? "Add to pool & review" : "Im Pool speichern & prüfen"}
                </button>
                {importNotice ? (
                  <p className="setupFeedback authNotice">{importNotice}</p>
                ) : null}
              </div>
            </article>
          </div>
          {setupNotice ? (
            <p className="setupFeedback authError">{setupNotice}</p>
          ) : null}
          <p className="setupFootnote">
            {tr("Der eBay-Verbindungsstatus bezieht sich auf das aktuell für dieses AutoLister-Konto konfigurierte Verkäuferkonto.")}
          </p>
        </section>
      ) : null}
    </main>
  );
}
