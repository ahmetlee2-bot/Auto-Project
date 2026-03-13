"use client";

import { useEffect, useState } from "react";
import type { AnalyzeResponse, AppSettings, PortfolioDeal, SavedDeal, SearchProfile } from "../../lib/api";
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
  const [form, setForm] = useState<ValuationFormState>(createInitialFormState());
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [watchlist, setWatchlist] = useState<SavedDeal[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioDeal[]>([]);
  const [searchProfiles, setSearchProfiles] = useState<SearchProfile[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings>(defaultSettings);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState("not synced yet");

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
      const [watchlistData, portfolioData, settingsData, searchProfileData] = await Promise.all([
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
      setLastUpdatedLabel(new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }));
      setError("");
    } catch (loadError) {
      console.error(loadError);
      setError("Backend collection verileri okunamadi. Local valuation preview yine calisiyor.");
    }
  }

  function updateField<K extends keyof ValuationFormState>(field: K, value: ValuationFormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleAnalyze() {
    setError("");
    setNotice("");

    if (!form.rawText.trim() && !form.url.trim()) {
      setError("Backend analyze icin listing text veya listing URL gerekli.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await analyzeListing(toAnalyzeRequest(form));
      setResult(response);
      setNotice("Operator analyze tamamlandi.");
    } catch (analyzeError) {
      console.error(analyzeError);
      setError("Operator analyze su anda ulasilabilir degil.");
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
      setNotice("Deal watchlist'e kaydedildi.");
      await refreshData();
    } catch (saveError) {
      console.error(saveError);
      setError("Watchlist kaydi olusturulamadi.");
    }
  }

  async function handleSavePortfolio() {
    if (!result) {
      return;
    }

    try {
      await createPortfolioDeal(result);
      setNotice("Deal portfolio'ya kaydedildi.");
      await refreshData();
    } catch (saveError) {
      console.error(saveError);
      setError("Portfolio kaydi olusturulamadi.");
    }
  }

  return (
    <main className="appShell">
      <header className="topBar">
        <div className="brandLockup">
          <small>AUTONOW Select</small>
          <strong>Valuation cockpit</strong>
        </div>
        <div className="topBarMeta">
          <span className="topBarPill">balanced premium</span>
          <span className="topBarPill">backend-ready</span>
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
          onSample={() => setForm(createSampleFormState(appSettings.preferred_city))}
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
        <OperatorPanel result={result} estimate={estimate} localSignal={localSignal} />
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
    </main>
  );
}
