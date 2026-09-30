"use client";

import { useEffect, useState } from "react";
import type {
  AnalyzeResponse,
  AppSettings,
  PortfolioDeal,
  SavedDeal,
  SearchProfile,
} from "../../lib/api";
import {
  analyzeListing,
  createPortfolioDeal,
  createWatchlistDeal,
  fetchAppSettings,
  fetchPortfolio,
  fetchSearchProfiles,
  fetchWatchlist,
} from "../../lib/api";
import {
  applyPreferredCity,
  buildComparables,
  buildScenarios,
  buildStatusCards,
  buildSummaryCards,
  calculateEstimate,
  createInitialFormState,
  createSampleFormState,
  getLocalBuyBoxSignal,
  getSourceAdapter,
  toAnalyzeRequest,
  type ValuationFormState,
} from "../../lib/valuation";
import { ComparablesPanel } from "./comparables-panel";
import { Hero } from "./hero";
import { MarketPanel } from "./market-panel";
import { OperatorDesk } from "./ops-drawer";
import { OperatorPanel } from "./operator-panel";
import { ScenarioPanel } from "./scenario-panel";
import { StatusPanel } from "./status-panel";
import { SummaryGrid } from "./summary-grid";
import { ValuationForm } from "./valuation-form";
import { AuthNav } from "../auth/auth-nav";

const defaultSettings: AppSettings = {
  preferred_city: "Hamburg",
  max_asking_price: 5000,
  min_net_profit: 550,
  min_margin_percent: 18,
  max_km_benzin: 210000,
  max_km_diesel: 190000,
  min_year: 2005,
  clean_prep_cost: 110,
  issue_prep_cost: 180,
  transfer_cost: 120,
  sales_cost_percent: 6,
  exit_discount_percent: 4,
  low_risk_discount_percent: 8,
  medium_risk_discount_percent: 15,
  high_risk_discount_percent: 22,
};

export function ValuationDashboard() {
  const [form, setForm] = useState<ValuationFormState>(
    createInitialFormState(),
  );
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [watchlist, setWatchlist] = useState<SavedDeal[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioDeal[]>([]);
  const [searchProfiles, setSearchProfiles] = useState<SearchProfile[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings>(defaultSettings);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState("Noch nicht synchronisiert");

  useEffect(() => {
    void refreshData();
  }, []);

  const estimate = calculateEstimate(form);
  const comparables = buildComparables(form, estimate);
  const scenarios = buildScenarios(form, estimate);
  const localSignal = getLocalBuyBoxSignal(form, estimate);
  const summaryCards = buildSummaryCards(watchlist, portfolio);
  const statusCards = buildStatusCards({
    form,
    estimate,
    result,
    watchlist,
    portfolio,
    searchProfiles,
  });
  const activeSourceLabel = getSourceAdapter(form.source).label;

  async function refreshData() {
    try {
      const [watchlistData, portfolioData, settingsData, searchProfileData] =
        await Promise.all([
          fetchWatchlist(),
          fetchPortfolio(),
          fetchAppSettings(),
          fetchSearchProfiles(),
        ]);

      setWatchlist(watchlistData);
      setPortfolio(portfolioData);
      setAppSettings(settingsData);
      setSearchProfiles(searchProfileData);
      setForm((current) => applyPreferredCity(current, settingsData));
      setLastUpdatedLabel(
        new Date().toLocaleTimeString("de-DE", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
      setError("");
    } catch (loadError) {
      console.error(loadError);
      setError(
        "Backend-Daten konnten nicht geladen werden. Die lokale Schätzung ist weiterhin verfügbar.",
      );
    }
  }

  function updateField<K extends keyof ValuationFormState>(
    field: K,
    value: ValuationFormState[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleAnalyze() {
    setError("");
    setNotice("");

    if (!form.rawText.trim() && !form.url.trim()) {
      setError(
        "Gib einen Angebotstext oder eine URL ein, damit die Analyse starten kann.",
      );
      return;
    }

    setIsLoading(true);
    try {
      const response = await analyzeListing(toAnalyzeRequest(form));
      setResult(response);
      setNotice("Die Analyse ist abgeschlossen.");
    } catch (analyzeError) {
      console.error(analyzeError);
      setError("Die Analyse ist derzeit nicht erreichbar.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveWatchlist() {
    if (!result) {
      return;
    }

    try {
      await createWatchlistDeal(result);
      setNotice("Das Angebot wurde in der Merkliste gespeichert.");
      await refreshData();
    } catch (saveError) {
      console.error(saveError);
      setError("Das Angebot konnte nicht in der Merkliste gespeichert werden.");
    }
  }

  async function handleSavePortfolio() {
    if (!result) {
      return;
    }

    try {
      await createPortfolioDeal(result);
      setNotice("Das Angebot wurde im Portfolio gespeichert.");
      await refreshData();
    } catch (saveError) {
      console.error(saveError);
      setError("Das Angebot konnte nicht im Portfolio gespeichert werden.");
    }
  }

  return (
    <main className="appShell">
      <header className="topBar">
        <div className="brandLockup">
          <small>AutoLister</small>
          <strong>Fahrzeugbewertung</strong>
        </div>
        <div className="topBarMeta">
          <AuthNav />
          <span className="topBarPill">Kaufanalyse</span>
          <span className="topBarPill">Servergestützt</span>
        </div>
      </header>

      <Hero
        preferredCity={appSettings.preferred_city}
        activeSourceLabel={activeSourceLabel}
        lastUpdatedLabel={lastUpdatedLabel}
      />

      <SummaryGrid cards={summaryCards} />

      {error ? <div className="feedbackBanner error">{error}</div> : null}
      {notice ? <div className="feedbackBanner success">{notice}</div> : null}

      <section className="valuationLayout">
        <ValuationForm
          form={form}
          isLoading={isLoading}
          onFieldChange={updateField}
          onSourceChange={(source) => updateField("source", source)}
          onAnalyze={() => void handleAnalyze()}
          onSample={() =>
            setForm(createSampleFormState(appSettings.preferred_city))
          }
        />

        <MarketPanel
          estimate={estimate}
          result={result}
          localSignal={localSignal}
          onSaveWatchlist={() => void handleSaveWatchlist()}
          onSavePortfolio={() => void handleSavePortfolio()}
        />
      </section>

      <section className="contentGrid">
        <OperatorPanel
          result={result}
          estimate={estimate}
          localSignal={localSignal}
        />
        <ComparablesPanel comparables={comparables} />
      </section>

      <section className="contentGrid">
        <StatusPanel cards={statusCards} />
        <ScenarioPanel scenarios={scenarios} />
      </section>

      <OperatorDesk
        watchlist={watchlist}
        portfolio={portfolio}
        searchProfiles={searchProfiles}
        appSettings={appSettings}
      />

      <section
        className="storeCta glassCard"
        aria-label="AutoLister herunterladen"
      >
        <div>
          <p className="sectionEyebrow">AutoLister Erweiterung</p>
          <h2>Amazon-Produkte schneller auf eBay vorbereiten.</h2>
          <p>
            Installieren Sie die Chrome-Erweiterung und starten Sie direkt auf
            einer Produktseite.
          </p>
        </div>
        <a
          className="primaryButton"
          href="https://chromewebstore.google.com/detail/phppekchehibeiphdmjifmceoencigee"
          target="_blank"
          rel="noopener noreferrer"
        >
          Chrome hinzufügen ↗
        </a>
      </section>

      <footer className="siteFooter">
        <span>© {new Date().getFullYear()} AutoLister</span>
        <nav aria-label="Rechtliche Hinweise">
          <a
            href="/privacy-policy.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            Datenschutzerklärung
          </a>
          <a href="/terms.html">Nutzungsbedingungen</a>
        </nav>
      </footer>
    </main>
  );
}
