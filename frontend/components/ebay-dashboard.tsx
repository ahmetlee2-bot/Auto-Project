"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "../lib/supabase/client";

type Draft = {
  id: string;
  sku?: string;
  offerId?: string;
  title?: string;
  price?: string;
  quantity?: number;
  status?: string;
  imageUrls?: string[];
};
type Listing = {
  listingId?: string;
  title?: string;
  price?: string;
  quantity?: number;
  status?: string;
  imageUrls?: string[];
  source?: string;
};
type DraftJob = {
  jobId: string;
  sourceId: string;
  status: string;
  message?: string;
  result?: { listingId?: string; draftId?: string };
};
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
  margin: Margin;
  tracking: {
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
const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.autolister-app.de"
).replace(/\/$/, "");

function ProductThumbnail({ src, title }: { src?: string; title?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed)
    return (
      <div
        className="productPlaceholder"
        role="img"
        aria-label={`${title || "Produkt"}: kein Bild verfügbar`}
      >
        <span aria-hidden="true">▧</span>
        <small>Bild nicht verfügbar</small>
      </div>
    );
  return (
    <img
      className="productThumbnail"
      src={src}
      alt={title || "Produktbild"}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

export function EbayDashboard({ email }: { email: string }) {
  const [activeTab, setActiveTab] = useState("server-import");
  const [copiedItemId, setCopiedItemId] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [jobs, setJobs] = useState<DraftJob[]>([]);
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
  const [importAutoPublish, setImportAutoPublish] = useState(false);
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
  const api = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetch(`${API_BASE}/api/v1${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
          ...(init.headers || {}),
        },
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(body.error || `API-Fehler (${response.status})`);
      return body;
    },
    [supabase],
  );
  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    const requests = await Promise.allSettled([
      api("/ebay/drafts"),
      api("/ebay/draft-jobs"),
      api("/automation/overview"),
      api("/ebay/active-listings"),
    ]);
    const labels = [
      "Entwürfe",
      "Server-Aufträge",
      "Synchronisierung",
      "eBay-Angebote",
    ];
    const failures: string[] = [];
    requests.forEach((result, index) => {
      if (result.status === "rejected") {
        failures.push(
          `${labels[index]}: ${result.reason instanceof Error ? result.reason.message : "Laden fehlgeschlagen"}`,
        );
        return;
      }
      const body = result.value;
      if (index === 0) setDrafts(body.drafts || []);
      if (index === 1) setJobs(body.jobs || []);
      if (index === 2) {
        setAutomation(body);
        setMargin(body.margin || null);
      }
      if (index === 3) {
        setListings(body.listings || []);
        setListedCount((body.listings || []).length);
      }
    });
    if (failures.length)
      setError(
        `Einige Dashboard-Daten konnten nicht geladen werden. ${failures.join(" · ")}`,
      );
    setBusy(false);
  }, [api]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    let active = true;
    void api("/ebay/connection-status")
      .then((status) => {
        if (active) setConnectionStatus(status);
      })
      .catch(() => {
        if (active)
          setConnectionStatus({
            error:
              "Das eBay-Verkäuferkonto ist noch nicht verbunden oder für dieses AutoLister-Konto nicht freigeschaltet.",
          });
      });
    return () => {
      active = false;
    };
  }, [api]);
  useEffect(() => {
    if (!jobs.some((job) => job.status === "RUNNING")) return;
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [jobs, refresh]);
  async function calculateMargin(
    targetMarginPercent = targetMargin,
    showPreview = false,
  ) {
    try {
      const result = await api("/automation/margin/calculate", {
        method: "POST",
        body: JSON.stringify({ sourcePrice, targetMarginPercent }),
      });
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
      await api("/automation/mapping", {
        method: "POST",
        body: JSON.stringify({
          itemId: mappingItemId,
          amazonUrl: mappingAmazonUrl,
        }),
      });
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
      Number(importMargin) > 500
    ) {
      setImportNotice(
        "Bitte eine gültige Zielmarge zwischen 0 und 500 eingeben.",
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
      const result = await api("/ebay/import-amazon", {
        method: "POST",
        body: JSON.stringify({
          amazonUrl: importAmazonUrl.trim(),
          targetMarginPercent: Number(importMargin),
          quantity: Number(importQuantity),
          autoPublish: importAutoPublish,
          imageRightsConfirmed,
        }),
      });
      setImportNotice(
        `Server-Auftrag gestartet${result.sourceId ? `: ${result.sourceId}` : ""}. Der Auftrag läuft auch bei geschlossenem Browser weiter.`,
      );
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
  async function publishDraft(draft: Draft) {
    if (!draft.offerId || !draft.id) {
      setError("Für dieses Produkt fehlen eBay-Angebots-ID oder Entwurfs-ID.");
      return;
    }
    try {
      setError("");
      setBusy(true);
      await api("/ebay/publish", {
        method: "POST",
        body: JSON.stringify({ draftId: draft.id }),
      });
      setImportNotice(
        `„${draft.title || "Produkt"}“ wurde an eBay zur Veröffentlichung übergeben.`,
      );
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Das Produkt konnte nicht veröffentlicht werden.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    await supabase.auth.signOut();
    window.location.assign("/login");
  }
  async function connectEbay() {
    setConnectBusy(true);
    setSetupNotice("");
    try {
      const result = await api("/ebay/auth-url");
      const authorizationUrl = new URL(String(result.authorizationUrl || ""));
      if (
        authorizationUrl.protocol !== "https:" ||
        authorizationUrl.hostname !== "auth.ebay.com"
      )
        throw new Error(
          "Die eBay-Anmeldeseite konnte nicht sicher geöffnet werden.",
        );
      window.location.assign(authorizationUrl.toString());
    } catch {
      setSetupNotice(
        "Die eBay-Verbindung konnte nicht gestartet werden. Prüfe die eBay-App-Konfiguration oder wende dich an den AutoLister-Administrator.",
      );
      setConnectBusy(false);
    }
  }
  async function copyItemId(itemId: string) {
    try {
      await navigator.clipboard.writeText(itemId);
      setCopiedItemId(itemId);
    } catch {
      setError("Die eBay-Artikelnummer konnte nicht kopiert werden.");
    }
  }
  const inventory = automation?.inventory;
  const tracking = automation?.tracking;
  const tabs = [
    ["server-import", "Amazon-Import"],
    ["jobs", "Server-Aufträge"],
    ["live", "Aktive eBay-Angebote"],
    ["pool", "Produktpool"],
    ["automation", "Synchronisation"],
    ["matcher", "Amazon-Zuordnung"],
    ["archive", "Archiv"],
    ["settings", "Einstellungen"],
  ];
  return (
    <main className="webDashboard">
      <header className="dashboardHeader">
        <div>
          <span className="sectionEyebrow">AUTOLISTER · EBAY.DE</span>
          <h1>Verwaltungsübersicht</h1>
          <p className="dashboardSubtitle">
            Angebote, Server-Aufträge und Lagerbestand an einem Ort.
          </p>
        </div>
        <div className="dashboardUser">
          <span
            className={
              error ? "dashboardHealth dashboardHealthWarn" : "dashboardHealth"
            }
          >
            {error
              ? "Prüfung erforderlich"
              : busy
                ? "Synchronisierung läuft"
                : "System ist bereit"}
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
                Ausloggen
              </button>
            </div>
          </details>
        </div>
      </header>
      <section className="dashboardStats">
        <article>
          <span>Wartende Produkte</span>
          <strong>{drafts.length}</strong>
        </article>
        <article>
          <span>Gelistet auf eBay</span>
          <strong>{listedCount ?? "—"}</strong>
        </article>
        <article>
          <span>Synchronisierungswarnungen</span>
          <strong>
            {inventory ? inventory.lowStock + inventory.outOfStock : "—"}
          </strong>
        </article>
      </section>
      {error ? <p className="authError">{error}</p> : null}
      <nav
        className="dashboardTabs"
        role="tablist"
        aria-label="Dashboard Bereiche"
      >
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            className={activeTab === id ? "active" : ""}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {activeTab === "server-import" ? (
        <section id="server-import" className="dashboardCard">
          <div>
            <p className="sectionEyebrow">SERVERVERARBEITUNG</p>
            <h2>Amazon-Produkt ohne Erweiterung verarbeiten</h2>
            <p className="emptyDashboard">
              Amazon.de URL oder ASIN eingeben. Der Server liest das Produkt,
              verarbeitet die Bilder, berechnet den Preis und führt den
              eBay-Auftrag unabhängig von diesem Gerät aus.
            </p>
          </div>
          <div className="mappingInputs">
            <label>
              Amazon.de URL oder ASIN
              <input
                value={importAmazonUrl}
                onChange={(event) => setImportAmazonUrl(event.target.value)}
                placeholder="https://www.amazon.de/dp/B0..."
              />
            </label>
            <label>
              Zielmarge %
              <input
                inputMode="decimal"
                value={importMargin}
                onChange={(event) => setImportMargin(event.target.value)}
              />
            </label>
            <label>
              Stückzahl
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
              Ich bestätige die Nutzungsrechte der Produktbilder.
            </label>
            <label>
              <input
                type="checkbox"
                checked={importAutoPublish}
                onChange={(event) => setImportAutoPublish(event.target.checked)}
              />{" "}
              Nach erfolgreicher Prüfung automatisch bei eBay veröffentlichen.
            </label>
            <button
              className="primaryButton"
              disabled={importBusy || !importAmazonUrl.trim()}
              onClick={() => void importFromAmazon()}
            >
              {importBusy
                ? "Auftrag wird gestartet …"
                : "Server-Auftrag starten"}
            </button>
          </div>
          {importNotice ? <p className="authNotice">{importNotice}</p> : null}
        </section>
      ) : null}
      {activeTab === "jobs" ? (
        <section className="dashboardCard">
          <div className="dashboardCardHeading">
            <div>
              <p className="sectionEyebrow">SERVER</p>
              <h2>eBay-Aufträge</h2>
            </div>
            <button className="quietButton" onClick={() => void refresh()}>
              Aktualisieren
            </button>
          </div>
          {jobs.length ? (
            <ul className="attentionList">
              {jobs.slice(0, 30).map((job) => (
                <li key={job.jobId}>
                  <span>
                    {job.sourceId} · {job.status}
                  </span>
                  <b>
                    {job.result?.listingId
                      ? `Item ID ${job.result.listingId}`
                      : job.message || job.jobId}
                  </b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="emptyDashboard">Keine Server-Aufträge vorhanden.</p>
          )}
        </section>
      ) : null}
      {activeTab === "automation" ? (
        <section id="automation" className="automationGrid">
          <article className="dashboardCard">
            <div className="dashboardCardHeading">
              <div>
                <p className="sectionEyebrow">Lagerbestand & Preis</p>
                <h2>Synchronisationsmotor</h2>
              </div>
              <button className="quietButton" onClick={() => void refresh()}>
                Aktualisieren
              </button>
            </div>
            <div className="moduleMetrics">
              <span>
                <b>{inventory?.total ?? "—"}</b> Produkte überwacht
              </span>
              <span>
                <b>{inventory?.lowStock ?? "—"}</b> Niedriger Bestand
              </span>
              <span>
                <b>{inventory?.outOfStock ?? "—"}</b> Nicht verfügbar
              </span>
            </div>
            {inventory?.attention?.length ? (
              <ul className="attentionList">
                {inventory.attention.map((item) => (
                  <li key={item.id}>
                    <span>{item.title}</span>
                    <b>{item.stock} Stk.</b>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="emptyDashboard">Keine Bestandswarnungen.</p>
            )}
          </article>
          <article className="dashboardCard">
            <div>
              <p className="sectionEyebrow">PREISBERECHNUNG</p>
              <h2>Gewinn & Provision</h2>
            </div>
            <div className="marginInputs">
              <label>
                Amazon-Preis
                <input
                  inputMode="decimal"
                  value={sourcePrice}
                  onChange={(event) => setSourcePrice(event.target.value)}
                />
              </label>
              <label>
                Zielmarge %
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
                Berechnen
              </button>
            </div>
            {margin ? (
              <div className="marginResult">
                <span>
                  Empfohlener eBay-Preis
                  <strong>{money.format(margin.recommendedSalePrice)}</strong>
                </span>
                <span>
                  Gewinn
                  <strong>
                    {money.format(margin.profit)} · {margin.marginPercent}%
                  </strong>
                </span>
              </div>
            ) : (
              <p className="emptyDashboard">Berechnung wird geladen …</p>
            )}
          </article>
          <article className="dashboardCard">
            <div className="dashboardCardHeading">
              <div>
                <p className="sectionEyebrow">VERSAND</p>
                <h2>Tracking-Nummern</h2>
              </div>
              <span
                className={
                  tracking?.configured ? "statusChip" : "statusChip mutedChip"
                }
              >
                {tracking?.configured ? "Verbunden" : "eBay verbinden"}
              </span>
            </div>
            <div className="moduleMetrics">
              <span>
                <b>{tracking?.total ?? "—"}</b> Bestellungen
              </span>
              <span>
                <b>{tracking?.withTracking ?? "—"}</b> Mit Tracking
              </span>
              <span>
                <b>{tracking?.awaitingTracking ?? "—"}</b> Offen
              </span>
            </div>
            {tracking?.shipments?.length ? (
              <ul className="attentionList">
                {tracking.shipments.slice(0, 3).map((shipment) => (
                  <li key={shipment.orderId}>
                    <span>{shipment.orderId}</span>
                    <b>{shipment.trackingNumber || "Tracking fehlt"}</b>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="emptyDashboard">
                Noch keine eBay-Sendungen verfügbar.
              </p>
            )}
          </article>
        </section>
      ) : null}
      {activeTab === "live" ? (
        <section id="live" className="dashboardCard">
          <div className="dashboardCardHeading">
            <div>
              <p className="sectionEyebrow">eBay Live</p>
              <h2>Aktive eBay-Angebote</h2>
            </div>
            <span className="statusChip">{listings.length} Listings</span>
          </div>
          {busy ? (
            <p>Live-Angebote werden geladen …</p>
          ) : listings.length === 0 ? (
            <p className="emptyDashboard">
              Keine veröffentlichten eBay-Angebote gefunden.
            </p>
          ) : (
            <div className="productGrid">
              <div className="productTableHead">
                <span>PRODUKT</span>
                <span>STATUS</span>
              </div>
              {listings.map((listing) => (
                <article className="productCard" key={listing.listingId}>
                  <ProductThumbnail
                    src={listing.imageUrls?.[0]}
                    title={listing.title}
                  />
                  <div>
                    <strong>{listing.title || "Ohne Titel"}</strong>
                    <small>
                      <button
                        className="copyItemId"
                        type="button"
                        onClick={() => void copyItemId(listing.listingId || "")}
                      >
                        {copiedItemId === listing.listingId
                          ? "Kopiert ✓"
                          : `Item ID: ${listing.listingId || "—"} ⧉`}
                      </button>{" "}
                      · {listing.price || "—"} € · {listing.quantity ?? 0} Stück
                    </small>
                  </div>
                  <span className="statusChip">Aktiv</span>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}
      {activeTab === "pool" ? (
        <section id="pool" className="dashboardCard">
          <div className="dashboardCardHeading">
            <div>
              <p className="sectionEyebrow">Produktpool</p>
              <h2>Entwürfe &amp; Angebote</h2>
            </div>
            <button className="quietButton" onClick={() => void refresh()}>
              Aktualisieren
            </button>
          </div>
          {busy ? (
            <p>Produktdaten werden geladen …</p>
          ) : drafts.length === 0 ? (
            <p className="emptyDashboard">Keine Entwürfe vorhanden.</p>
          ) : (
            <div className="productGrid">
              {drafts.map((draft) => (
                <article className="productCard" key={draft.id}>
                  <ProductThumbnail
                    src={draft.imageUrls?.[0]}
                    title={draft.title}
                  />
                  <div>
                    <strong>{draft.title || "Ohne Titel"}</strong>
                    <small>
                      {draft.price || "—"} · {draft.quantity ?? 0} Stück
                    </small>
                  </div>
                  <span className="statusChip">{draft.status || "READY"}</span>
                  {draft.offerId ? (
                    <button
                      className="primaryButton"
                      disabled={busy}
                      onClick={() => void publishDraft(draft)}
                    >
                      Auf eBay veröffentlichen
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}
      {activeTab === "matcher" ? (
        <section id="matcher" className="dashboardCard">
          <div>
            <p className="sectionEyebrow">Manuelle Produktzuordnung</p>
            <h2>Amazon-Produkt manuell verknüpfen</h2>
          </div>
          <div className="mappingInputs">
            <label>
              eBay Item ID
              <input
                value={mappingItemId}
                onChange={(event) => setMappingItemId(event.target.value)}
                placeholder="z. B. 407164679608"
              />
            </label>
            <label>
              Amazon ASIN oder URL
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
              Zuordnung speichern
            </button>
          </div>
          {mappingNotice ? <p className="authNotice">{mappingNotice}</p> : null}
        </section>
      ) : null}
      {activeTab === "archive" ? (
        <section id="archive" className="dashboardCard">
          <div>
            <p className="sectionEyebrow">Archiv</p>
            <h2>Gelöschte und zurückgesetzte Entwürfe</h2>
          </div>
          <p className="emptyDashboard">
            Das Archiv wird aus dem eBay-Bridge-Verlauf synchronisiert.
          </p>
        </section>
      ) : null}
      {activeTab === "settings" ? (
        <section id="settings" className="dashboardCard setupGuide">
          <div>
            <p className="sectionEyebrow">ERSTE SCHRITTE</p>
            <h2>In 3 Schritten startklar</h2>
            <p className="dashboardSubtitle">
              Verbinde den Produktimport mit deinem eBay-Ablauf.
            </p>
          </div>
          <div className="setupSteps">
            <article className="setupStep">
              <div className="setupStepHead">
                <span className="setupStepNumber">SCHRITT 1</span>
                <span aria-hidden="true">▣</span>
              </div>
              <h3>Chrome-Erweiterung installieren</h3>
              <p>
                Erfasse Produktdaten direkt auf Amazon.de. Der Importauftrag
                wird anschließend an AutoLister übergeben.
              </p>
              <a
                className="secondaryButton"
                href="https://chromewebstore.google.com/detail/phppekchehibeiphdmjifmceoencigee"
                target="_blank"
                rel="noopener noreferrer"
              >
                Erweiterung im Chrome Web Store öffnen ↗
              </a>
            </article>
            <article className="setupStep">
              <div className="setupStepHead">
                <span className="setupStepNumber">SCHRITT 2</span>
                <span
                  className={
                    connectionStatus?.ok
                      ? "setupStatus connected"
                      : "setupStatus"
                  }
                >
                  {connectionStatus === null
                    ? "Status wird geprüft"
                    : connectionStatus.ok
                      ? "Token aktiv"
                      : "Nicht verbunden"}
                </span>
              </div>
              <h3>eBay-Konto autorisieren</h3>
              <p>
                Die Zugangsdaten werden serverseitig geschützt. AutoLister nutzt
                die offizielle eBay REST-Schnittstelle. Aktuell wird das für
                dieses Konto freigeschaltete eBay-Verkäuferkonto verbunden.
              </p>
              <button
                className="primaryButton"
                type="button"
                disabled={connectBusy}
                onClick={() => void connectEbay()}
              >
                {connectBusy
                  ? "eBay wird geöffnet …"
                  : "eBay-Konto sicher verbinden"}
              </button>
              {connectionStatus?.error ? (
                <p className="setupFeedback authError">
                  {connectionStatus.error}
                </p>
              ) : null}
            </article>
            <article className="setupStep">
              <div className="setupStepHead">
                <span className="setupStepNumber">SCHRITT 3</span>
                <span className="setupStatus">Produkt vorbereiten</span>
              </div>
              <h3>Erstes Produkt erfassen</h3>
              <p>
                Amazon-URL oder ASIN eingeben und Marge, Menge sowie Bildrechte
                vor dem Auftrag prüfen.
              </p>
              <div className="setupImportAction">
                <div className="mappingInputs">
                  <label>
                    Amazon-URL oder ASIN
                    <input
                      value={importAmazonUrl}
                      onChange={(event) =>
                        setImportAmazonUrl(event.target.value)
                      }
                      placeholder="https://www.amazon.de/dp/B0…"
                    />
                  </label>
                  <label>
                    Amazon-Einkaufspreis €
                    <input
                      inputMode="decimal"
                      value={sourcePrice}
                      onChange={(event) => setSourcePrice(event.target.value)}
                    />
                  </label>
                  <label>
                    Zielmarge %
                    <input
                      inputMode="decimal"
                      value={importMargin}
                      onChange={(event) => setImportMargin(event.target.value)}
                    />
                  </label>
                  <label>
                    Stückzahl
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
                  Preisvorschau berechnen
                </button>
                {marginPreviewRequested && margin ? (
                  <div className="marginResult">
                    <span>
                      Empfohlener eBay-Preis
                      <strong>
                        {money.format(margin.recommendedSalePrice)}
                      </strong>
                    </span>
                    <span>
                      Geschätzter Gewinn
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
                  Ich darf die Produktbilder verwenden.
                </label>
                <label className="setupCheck">
                  <input
                    type="checkbox"
                    checked={importAutoPublish}
                    onChange={(event) =>
                      setImportAutoPublish(event.target.checked)
                    }
                  />{" "}
                  Nach erfolgreicher Prüfung automatisch veröffentlichen.
                </label>
                <button
                  className="primaryButton"
                  type="button"
                  disabled={importBusy || !importAmazonUrl.trim()}
                  onClick={() => void importFromAmazon()}
                >
                  {importBusy
                    ? "Auftrag wird gestartet …"
                    : "Server-Auftrag starten"}
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
            Der eBay-Verbindungsstatus bezieht sich auf das aktuell für dieses
            AutoLister-Konto konfigurierte Verkäuferkonto.
          </p>
        </section>
      ) : null}
    </main>
  );
}
