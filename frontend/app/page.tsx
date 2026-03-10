"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  AppSettings,
  AnalyzeRequest,
  AnalyzeResponse,
  PortfolioDeal,
  SavedDeal,
  SearchProfile,
  analyzeListing,
  createSearchProfile,
  createPortfolioDeal,
  createWatchlistDeal,
  deleteSearchProfile,
  deletePortfolioDeal,
  deleteWatchlistDeal,
  fetchAppSettings,
  fetchPortfolio,
  fetchSearchProfiles,
  fetchWatchlist,
  updateAppSettings,
  updatePortfolioNote,
  updatePortfolioStatus,
  updateSearchProfileStatus,
  updateWatchlistNote,
} from "../lib/api";

const initialForm: AnalyzeRequest = {
  source: "Kleinanzeigen",
  url: "",
  brand: "",
  model: "",
  year: null,
  km: null,
  fuel: "",
  asking_price: null,
  city: "Hamburg",
  raw_text: "",
};

const sampleText =
  "VW Golf 5 1.6 2006, 178000 km, TUV yazin bitiyor, klima sogutmuyor. Hamburg Wandsbek. 1350 Euro.";

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

const initialSearchProfile = {
  label: "",
  source: "Kleinanzeigen",
  search_url: "",
  city: "Hamburg",
  max_price: "",
  min_year: "",
  min_profit: "",
  notes: "",
  active: true,
};

export default function Page() {
  const [form, setForm] = useState<AnalyzeRequest>(initialForm);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [watchlist, setWatchlist] = useState<SavedDeal[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioDeal[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings>(defaultSettings);
  const [searchProfiles, setSearchProfiles] = useState<SearchProfile[]>([]);
  const [searchProfileForm, setSearchProfileForm] = useState(initialSearchProfile);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>("");
  const [notice, setNotice] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  useEffect(() => {
    void refreshData();
  }, []);

  useEffect(() => {
    setNoteDrafts((current) => {
      const next = { ...current };
      for (const deal of watchlist) {
        const key = noteKey("watchlist", deal.id);
        if (!(key in next)) {
          next[key] = deal.operator_note ?? "";
        }
      }
      for (const deal of portfolio) {
        const key = noteKey("portfolio", deal.id);
        if (!(key in next)) {
          next[key] = deal.operator_note ?? "";
        }
      }
      return next;
    });
  }, [watchlist, portfolio]);

  async function refreshData() {
    try {
      setIsBootstrapping(true);
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
      setForm((current) =>
        current.city === initialForm.city ? { ...current, city: settingsData.preferred_city } : current,
      );
      setError("");
    } catch (loadError) {
      console.error(loadError);
      setError("Backend calisiyor ama ayarlar veya koleksiyon verileri okunamadi.");
    } finally {
      setIsBootstrapping(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!form.raw_text?.trim() && !form.url?.trim()) {
      setError("Ilan metni veya ilan linki girmeden analiz baslatilamaz.");
      return;
    }

    setIsLoading(true);

    try {
      const data = await analyzeListing(form);
      setResult(data);
    } catch (submitError) {
      console.error(submitError);
      setError("Backend analizi su anda ulasilabilir degil. Once backend servisini calistirmak gerekecek.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveToWatchlist() {
    if (!result) return;

    try {
      await createWatchlistDeal(result);
      setNotice("Analiz sonucu watchlist'e kaydedildi.");
      await refreshData();
    } catch (saveError) {
      console.error(saveError);
      setError("Watchlist kaydi olusturulamadi.");
    }
  }

  async function handleSaveToPortfolio() {
    if (!result) return;

    try {
      await createPortfolioDeal(result);
      setNotice("Analiz sonucu portfolio'ya kaydedildi.");
      await refreshData();
    } catch (saveError) {
      console.error(saveError);
      setError("Portfolio kaydi olusturulamadi.");
    }
  }

  async function handleDeleteWatchlist(id: number) {
    try {
      await deleteWatchlistDeal(id);
      setNotice("Watchlist kaydi silindi.");
      await refreshData();
    } catch (deleteError) {
      console.error(deleteError);
      setError("Watchlist kaydi silinemedi.");
    }
  }

  async function handlePromoteWatchlist(deal: SavedDeal) {
    try {
      await createPortfolioDeal(deal);
      await deleteWatchlistDeal(deal.id);
      setNotice("Deal watchlist'ten portfolio'ya tasindi.");
      await refreshData();
    } catch (promoteError) {
      console.error(promoteError);
      setError("Watchlist deal'i portfolio'ya tasinamadi.");
    }
  }

  async function handleCyclePortfolioStatus(deal: PortfolioDeal) {
    const nextStatus: PortfolioDeal["status"] =
      deal.status === "sourcing" ? "prep" : deal.status === "prep" ? "sold" : "sourcing";

    try {
      await updatePortfolioStatus(deal.id, nextStatus);
      setNotice(`Portfolio durumu ${nextStatus} olarak guncellendi.`);
      await refreshData();
    } catch (updateError) {
      console.error(updateError);
      setError("Portfolio durumu guncellenemedi.");
    }
  }

  async function handleDeletePortfolio(id: number) {
    try {
      await deletePortfolioDeal(id);
      setNotice("Portfolio kaydi silindi.");
      await refreshData();
    } catch (deleteError) {
      console.error(deleteError);
      setError("Portfolio kaydi silinemedi.");
    }
  }

  async function handleSaveWatchlistNote(id: number) {
    const key = noteKey("watchlist", id);
    try {
      await updateWatchlistNote(id, noteDrafts[key] ?? "");
      setNotice("Watchlist operator note kaydedildi.");
      await refreshData();
    } catch (saveError) {
      console.error(saveError);
      setError("Watchlist operator note kaydedilemedi.");
    }
  }

  async function handleSavePortfolioNote(id: number) {
    const key = noteKey("portfolio", id);
    try {
      await updatePortfolioNote(id, noteDrafts[key] ?? "");
      setNotice("Portfolio operator note kaydedildi.");
      await refreshData();
    } catch (saveError) {
      console.error(saveError);
      setError("Portfolio operator note kaydedilemedi.");
    }
  }

  async function handleSaveSettings() {
    try {
      await updateAppSettings(appSettings);
      setNotice("Operator ayarlari kaydedildi.");
      await refreshData();
    } catch (saveError) {
      console.error(saveError);
      setError("Operator ayarlari kaydedilemedi.");
    }
  }

  async function handleCreateSearchProfile() {
    try {
      await createSearchProfile({
        label: searchProfileForm.label,
        source: searchProfileForm.source,
        search_url: searchProfileForm.search_url,
        city: searchProfileForm.city,
        max_price: searchProfileForm.max_price ? Number(searchProfileForm.max_price) : null,
        min_year: searchProfileForm.min_year ? Number(searchProfileForm.min_year) : null,
        min_profit: searchProfileForm.min_profit ? Number(searchProfileForm.min_profit) : null,
        notes: searchProfileForm.notes,
        active: searchProfileForm.active,
      });
      setSearchProfileForm(initialSearchProfile);
      setNotice("Search profile kaydedildi.");
      await refreshData();
    } catch (saveError) {
      console.error(saveError);
      setError("Search profile kaydedilemedi.");
    }
  }

  async function handleToggleSearchProfile(profile: SearchProfile) {
    try {
      await updateSearchProfileStatus(profile.id, !profile.active);
      setNotice(`Search profile ${!profile.active ? "aktif" : "pasif"} yapildi.`);
      await refreshData();
    } catch (toggleError) {
      console.error(toggleError);
      setError("Search profile durumu guncellenemedi.");
    }
  }

  async function handleDeleteSearchProfile(id: number) {
    try {
      await deleteSearchProfile(id);
      setNotice("Search profile silindi.");
      await refreshData();
    } catch (deleteError) {
      console.error(deleteError);
      setError("Search profile silinemedi.");
    }
  }

  const activePortfolio = portfolio.filter((item) => item.status !== "sold");
  const expectedProfit = activePortfolio.reduce((total, item) => total + item.net_profit, 0);
  const soldProfit = portfolio.filter((item) => item.status === "sold").reduce((total, item) => total + item.net_profit, 0);
  const buyBoxFitDeals = watchlist.filter((item) => item.buy_box_status === "fit").length;
  const activeSearchProfiles = searchProfiles.filter((item) => item.active).length;

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">AUTONOW Phase 1</p>
          <h1>Ilan yapistir, riski gor, teklif cizgisini hemen cikar.</h1>
          <p className="lead">
            Bu demo artik tek bir operator ekranina donuyor. Amacimiz her seyi elle doldurmak degil;
            linki veya ilan metnini birakip saniyeler icinde karlilik, risk, pazarlik ve sonraki
            adimi gorebilmek.
          </p>
        </div>
        <div className="heroCard">
          <span>Current milestone</span>
          <strong>operator-first live demo</strong>
          <p>
            {activePortfolio.length} aktif portfolio deal'i, {buyBoxFitDeals} buy-box fit lead ve {activeSearchProfiles} aktif
            search profili ayni operator akisi icinde duruyor.
          </p>
        </div>
      </section>

      <section className="dashboardGrid">
        <MetricCard label="Watchlist deals" value={String(watchlist.length)} />
        <MetricCard label="Active portfolio" value={String(activePortfolio.length)} />
        <MetricCard label="Buy-box fit" value={String(buyBoxFitDeals)} />
        <MetricCard label="Expected profit" value={`${expectedProfit} EUR`} />
        <MetricCard label="Sold profit" value={`${soldProfit} EUR`} />
      </section>

      <section className="grid">
        <form className="card" onSubmit={onSubmit}>
          <div className="cardHeader">
            <div>
              <h2>Deal Intake</h2>
              <p>Zorunlu olan sey sadece ilan linki veya ilan metni. Geri kalan alanlar artik opsiyonel.</p>
            </div>
            <button
              className="secondaryButton"
              type="button"
              onClick={() =>
                setForm({
                  ...initialForm,
                  source: "Kleinanzeigen",
                  asking_price: 1350,
                  city: appSettings.preferred_city,
                  raw_text: sampleText,
                })
              }
            >
              Sample
            </button>
          </div>

          <div className="intakeNote">
            <strong>Hizli kullanim</strong>
            <p>
              Ilan metnini yapistir veya linki birak. Sadece fiyat ilanda net degilse manuel yaz. Marka,
              model, km ve yakit artik gelismis override alanlarinda.
            </p>
          </div>

          <div className="formGrid">
            <label className="full">
              <span>Quick paste</span>
              <textarea
                className="quickPaste"
                value={form.raw_text ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, raw_text: event.target.value }))}
                placeholder={sampleText}
              />
            </label>
            <div className="supportText full">
              Parser yil, km, yakit, fiyat ve ariza ipuclarini bu alandan toplamaya calisir. Link varsa asagidaki gelismis
              alanda birakman yeterli.
            </div>
            <label>
              <span>Kaynak</span>
              <select
                value={form.source}
                onChange={(event) => setForm((current) => ({ ...current, source: event.target.value }))}
              >
                <option>Kleinanzeigen</option>
                <option>Facebook Marketplace</option>
                <option>Mobile.de</option>
                <option>Manual Import</option>
              </select>
            </label>
            <label>
              <span>Istenen fiyat</span>
              <input
                type="number"
                value={form.asking_price ?? ""}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    asking_price: event.target.value ? Number(event.target.value) : null,
                  }))
                }
                placeholder="1350"
              />
            </label>
          </div>

          <details className="detailsBlock">
            <summary>Gelismis manuel alanlar</summary>
            <p>Parser eksik okursa sadece burada override girmen yeterli.</p>

            <div className="formGrid compactForm">
              <label className="full">
                <span>Ilan linki</span>
                <input
                  value={form.url ?? ""}
                  onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
                  placeholder="https://..."
                />
              </label>
              <label>
                <span>Marka</span>
                <input
                  value={form.brand ?? ""}
                  onChange={(event) => setForm((current) => ({ ...current, brand: event.target.value }))}
                  placeholder="VW"
                />
              </label>
              <label>
                <span>Model</span>
                <input
                  value={form.model ?? ""}
                  onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
                  placeholder="Golf"
                />
              </label>
              <label>
                <span>Yil</span>
                <input
                  type="number"
                  value={form.year ?? ""}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      year: event.target.value ? Number(event.target.value) : null,
                    }))
                  }
                  placeholder="2007"
                />
              </label>
              <label>
                <span>KM</span>
                <input
                  type="number"
                  value={form.km ?? ""}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      km: event.target.value ? Number(event.target.value) : null,
                    }))
                  }
                  placeholder="148000"
                />
              </label>
              <label>
                <span>Yakit</span>
                <select
                  value={form.fuel ?? ""}
                  onChange={(event) => setForm((current) => ({ ...current, fuel: event.target.value }))}
                >
                  <option value="">Belirtilmedi</option>
                  <option value="Benzin">Benzin</option>
                  <option value="Diesel">Diesel</option>
                </select>
              </label>
            </div>
          </details>

          <div className="formActions">
            <button className="primaryButton" type="submit" disabled={isLoading}>
              {isLoading ? "Analiz ediliyor..." : "Hizli analiz"}
            </button>
            <button
              className="secondaryButton"
              type="button"
              onClick={() => setForm({ ...initialForm, city: appSettings.preferred_city })}
            >
              Temizle
            </button>
          </div>
        </form>

        <section className="card">
          <div className="cardHeader">
            <div>
              <h2>Analysis Output</h2>
              <p>Ilk bakista karar ver, detay gerekiyorsa asagidaki notlari ac.</p>
            </div>
          </div>

          {error ? <div className="notice noticeWarning">{error}</div> : null}
          {notice ? <div className="notice noticebuy"><strong>{notice}</strong></div> : null}

          {!result ? (
            <div className="emptyState">
              <strong>Ilk backend cevabi burada gorunecek.</strong>
              <p>Bu panel artik sadece analiz gostermiyor; ayni sonucu watchlist veya portfolio'ya kaydediyor.</p>
            </div>
          ) : (
            <div className="resultGrid">
              <div className={`notice notice${result.recommendation}`}>
                <strong>{result.summary}</strong>
              </div>
              <div className="resultHero">
                <div>
                  <div className="badgeRow">
                    <span className="pill">{result.source}</span>
                    <span className="pill">{result.risk_level}</span>
                    <span className="pill">{result.recommendation}</span>
                    <span className="pill">{buyBoxLabel(result.buy_box_status)}</span>
                    <span className="pill">parser {result.source_parser}</span>
                    <span className="pill">{confidenceLabel(result.confidence_score)}</span>
                  </div>
                  <h3>{result.title}</h3>
                  <p>
                    {result.city} | {result.km.toLocaleString("de-DE")} km | {result.fuel} | Asking{" "}
                    {result.asking_price} EUR
                  </p>
                </div>
              </div>

              <div className="metricGrid">
                <Metric label="Offer price" value={`${result.offer_price} EUR`} />
                <Metric label="Total cost" value={`${result.total_cost} EUR`} />
                <Metric label="Target sale" value={`${result.target_sale_price} EUR`} />
                <Metric label="Net profit" value={`${result.net_profit} EUR`} />
                <Metric label="Confidence" value={`${result.confidence_score}/100`} />
              </div>

              {result.verification_required ? (
                <div className="notice noticecaution">
                  <strong>Manual verification required</strong>
                  <p>Bu analiz sahada teyit gerektiriyor. Ozellikle asagidaki notlara gore hareket et.</p>
                </div>
              ) : null}

              {result.buy_box_status !== "fit" ? (
                <div className="notice noticecaution">
                  <strong>Buy-box {result.buy_box_status}</strong>
                  <p>Bu ilan senin Hamburg flip kriterlerine tam oturmuyor olabilir.</p>
                </div>
              ) : (
                <div className="notice noticebuy">
                  <strong>Buy-box fit</strong>
                  <p>Bu ilan mevcut Hamburg hedeflerine gore uygun gorunuyor.</p>
                </div>
              )}

              <div className="columns">
                <div className="subCard">
                  <h4>Quick Read</h4>
                  <ul>
                    {result.strengths.map((item, index) => (
                      <li key={`strength-${index}`}>{item}</li>
                    ))}
                    {result.warnings.slice(0, 2).map((item, index) => (
                      <li key={`warning-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="subCard">
                  <h4>Negotiation</h4>
                  <p>{result.recommended_message}</p>
                  <ul>
                    {result.negotiation_points.slice(0, 3).map((item, index) => (
                      <li key={`negotiation-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="subCard">
                <h4>Next Action</h4>
                <p>{result.next_action}</p>
              </div>

              <details className="detailsBlock">
                <summary>Detayli kontrol notlari</summary>
                <p>Parser, verification ve buy-box detaylari burada. Ilk ekrani sade tutmak icin katlandi.</p>

                <div className="columns">
                  <div className="subCard">
                    <h4>Warnings</h4>
                    <ul>
                      {result.warnings.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="subCard">
                    <h4>Parser Notes</h4>
                    <ul>
                      {result.parser_notes.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="subCard">
                    <h4>Verification Checklist</h4>
                    <ul>
                      {(result.verification_notes.length
                        ? result.verification_notes
                        : ["Standart kontrol: cold start, test drive, TUV ve alt takim teyidi."]).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="subCard">
                    <h4>Buy-box Notes</h4>
                    <ul>
                      {result.buy_box_notes.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </details>

              <div className="formActions">
                <button className="primaryButton" type="button" onClick={() => void handleSaveToWatchlist()}>
                  Watchlist'e kaydet
                </button>
                <button className="secondaryButton" type="button" onClick={() => void handleSaveToPortfolio()}>
                  Portfolio'ya kaydet
                </button>
              </div>
            </div>
          )}
        </section>
      </section>

      <section className="grid">
        <section className="card">
          <div className="cardHeader">
            <div>
              <h2>Watchlist</h2>
              <p>Ilk gorusme ve saha kontrolu bekleyen lead listesi.</p>
            </div>
          </div>

          {isBootstrapping ? (
            <div className="emptyState">
              <strong>Watchlist yukleniyor...</strong>
            </div>
          ) : watchlist.length === 0 ? (
            <div className="emptyState">
              <strong>Watchlist bos.</strong>
              <p>Bir analiz sonucunu kaydettiginde burada gorunecek.</p>
            </div>
          ) : (
            <div className="collection">
              {watchlist.map((deal) => (
                <WatchlistCard
                  key={deal.id}
                  deal={deal}
                  noteValue={noteDrafts[noteKey("watchlist", deal.id)] ?? deal.operator_note}
                  onNoteChange={(value) =>
                    setNoteDrafts((current) => ({
                      ...current,
                      [noteKey("watchlist", deal.id)]: value,
                    }))
                  }
                  onPromote={() => void handlePromoteWatchlist(deal)}
                  onSaveNote={() => void handleSaveWatchlistNote(deal.id)}
                  onDelete={() => void handleDeleteWatchlist(deal.id)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="cardHeader">
            <div>
              <h2>Portfolio</h2>
              <p>Alinmis veya hazirlanan araclarin operasyon paneli.</p>
            </div>
          </div>

          {isBootstrapping ? (
            <div className="emptyState">
              <strong>Portfolio yukleniyor...</strong>
            </div>
          ) : portfolio.length === 0 ? (
            <div className="emptyState">
              <strong>Portfolio bos.</strong>
              <p>Bir deal'i portfolio'ya aldiginda burada gorunecek.</p>
            </div>
          ) : (
            <div className="collection">
              {portfolio.map((deal) => (
                <PortfolioCard
                  key={deal.id}
                  deal={deal}
                  noteValue={noteDrafts[noteKey("portfolio", deal.id)] ?? deal.operator_note}
                  onNoteChange={(value) =>
                    setNoteDrafts((current) => ({
                      ...current,
                      [noteKey("portfolio", deal.id)]: value,
                    }))
                  }
                  onSaveNote={() => void handleSavePortfolioNote(deal.id)}
                  onCycleStatus={() => void handleCyclePortfolioStatus(deal)}
                  onDelete={() => void handleDeletePortfolio(deal.id)}
                />
              ))}
            </div>
          )}
        </section>
      </section>

      <section className="grid">
        <details className="card collapseCard">
          <summary className="cardSummary">
            <div>
              <h2>Operator Settings</h2>
              <p>Her ziyarette acik kalmasin diye katlandi. Buy-box ve maliyet varsayimlari burada.</p>
            </div>
          </summary>

          <div className="formGrid">
            <label>
              <span>Preferred city</span>
              <input
                value={appSettings.preferred_city}
                onChange={(event) => setAppSettings((current) => ({ ...current, preferred_city: event.target.value }))}
              />
            </label>
            <label>
              <span>Max asking price</span>
              <input
                type="number"
                value={appSettings.max_asking_price}
                onChange={(event) =>
                  setAppSettings((current) => ({ ...current, max_asking_price: Number(event.target.value) || 0 }))
                }
              />
            </label>
            <label>
              <span>Min net profit</span>
              <input
                type="number"
                value={appSettings.min_net_profit}
                onChange={(event) =>
                  setAppSettings((current) => ({ ...current, min_net_profit: Number(event.target.value) || 0 }))
                }
              />
            </label>
            <label>
              <span>Min margin %</span>
              <input
                type="number"
                value={appSettings.min_margin_percent}
                onChange={(event) =>
                  setAppSettings((current) => ({ ...current, min_margin_percent: Number(event.target.value) || 0 }))
                }
              />
            </label>
            <label>
              <span>Max km benzin</span>
              <input
                type="number"
                value={appSettings.max_km_benzin}
                onChange={(event) =>
                  setAppSettings((current) => ({ ...current, max_km_benzin: Number(event.target.value) || 0 }))
                }
              />
            </label>
            <label>
              <span>Max km diesel</span>
              <input
                type="number"
                value={appSettings.max_km_diesel}
                onChange={(event) =>
                  setAppSettings((current) => ({ ...current, max_km_diesel: Number(event.target.value) || 0 }))
                }
              />
            </label>
            <label>
              <span>Min year</span>
              <input
                type="number"
                value={appSettings.min_year}
                onChange={(event) =>
                  setAppSettings((current) => ({ ...current, min_year: Number(event.target.value) || 0 }))
                }
              />
            </label>
            <label>
              <span>Clean prep cost</span>
              <input
                type="number"
                value={appSettings.clean_prep_cost}
                onChange={(event) =>
                  setAppSettings((current) => ({ ...current, clean_prep_cost: Number(event.target.value) || 0 }))
                }
              />
            </label>
            <label>
              <span>Issue prep cost</span>
              <input
                type="number"
                value={appSettings.issue_prep_cost}
                onChange={(event) =>
                  setAppSettings((current) => ({ ...current, issue_prep_cost: Number(event.target.value) || 0 }))
                }
              />
            </label>
            <label>
              <span>Transfer cost</span>
              <input
                type="number"
                value={appSettings.transfer_cost}
                onChange={(event) =>
                  setAppSettings((current) => ({ ...current, transfer_cost: Number(event.target.value) || 0 }))
                }
              />
            </label>
            <label>
              <span>Sales cost %</span>
              <input
                type="number"
                value={appSettings.sales_cost_percent}
                onChange={(event) =>
                  setAppSettings((current) => ({ ...current, sales_cost_percent: Number(event.target.value) || 0 }))
                }
              />
            </label>
            <label>
              <span>Exit discount %</span>
              <input
                type="number"
                value={appSettings.exit_discount_percent}
                onChange={(event) =>
                  setAppSettings((current) => ({ ...current, exit_discount_percent: Number(event.target.value) || 0 }))
                }
              />
            </label>
            <label>
              <span>Low risk discount %</span>
              <input
                type="number"
                value={appSettings.low_risk_discount_percent}
                onChange={(event) =>
                  setAppSettings((current) => ({ ...current, low_risk_discount_percent: Number(event.target.value) || 0 }))
                }
              />
            </label>
            <label>
              <span>Medium risk discount %</span>
              <input
                type="number"
                value={appSettings.medium_risk_discount_percent}
                onChange={(event) =>
                  setAppSettings((current) => ({ ...current, medium_risk_discount_percent: Number(event.target.value) || 0 }))
                }
              />
            </label>
            <label>
              <span>High risk discount %</span>
              <input
                type="number"
                value={appSettings.high_risk_discount_percent}
                onChange={(event) =>
                  setAppSettings((current) => ({ ...current, high_risk_discount_percent: Number(event.target.value) || 0 }))
                }
              />
            </label>
          </div>

          <div className="formActions">
            <button className="primaryButton" type="button" onClick={() => void handleSaveSettings()}>
              Ayarlari kaydet
            </button>
          </div>
        </details>

        <details className="card collapseCard">
          <summary className="cardSummary">
            <div>
              <h2>Saved Search Profiles</h2>
              <p>Arama linkleri ve otomasyon hazirliklari burada. Ana akistan ayirdim.</p>
            </div>
          </summary>

          <div className="formGrid">
            <label>
              <span>Label</span>
              <input
                value={searchProfileForm.label}
                onChange={(event) => setSearchProfileForm((current) => ({ ...current, label: event.target.value }))}
                placeholder="Hamburg Golf tarama"
              />
            </label>
            <label>
              <span>Source</span>
              <select
                value={searchProfileForm.source}
                onChange={(event) => setSearchProfileForm((current) => ({ ...current, source: event.target.value }))}
              >
                <option>Kleinanzeigen</option>
                <option>Facebook Marketplace</option>
                <option>Mobile.de</option>
              </select>
            </label>
            <label className="full">
              <span>Search URL</span>
              <input
                value={searchProfileForm.search_url}
                onChange={(event) => setSearchProfileForm((current) => ({ ...current, search_url: event.target.value }))}
                placeholder="https://..."
              />
            </label>
            <label>
              <span>City</span>
              <input
                value={searchProfileForm.city}
                onChange={(event) => setSearchProfileForm((current) => ({ ...current, city: event.target.value }))}
              />
            </label>
            <label>
              <span>Max price</span>
              <input
                type="number"
                value={searchProfileForm.max_price}
                onChange={(event) => setSearchProfileForm((current) => ({ ...current, max_price: event.target.value }))}
              />
            </label>
            <label>
              <span>Min year</span>
              <input
                type="number"
                value={searchProfileForm.min_year}
                onChange={(event) => setSearchProfileForm((current) => ({ ...current, min_year: event.target.value }))}
              />
            </label>
            <label>
              <span>Min profit</span>
              <input
                type="number"
                value={searchProfileForm.min_profit}
                onChange={(event) => setSearchProfileForm((current) => ({ ...current, min_profit: event.target.value }))}
              />
            </label>
            <label className="full">
              <span>Notes</span>
              <textarea
                value={searchProfileForm.notes}
                onChange={(event) => setSearchProfileForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Ornek: sadece manuel, klima, 5-kapi, Hamburg ici"
              />
            </label>
          </div>

          <div className="formActions">
            <button className="primaryButton" type="button" onClick={() => void handleCreateSearchProfile()}>
              Search profile ekle
            </button>
          </div>

          {searchProfiles.length === 0 ? (
            <div className="emptyState compactState">
              <strong>Kayitli arama yok.</strong>
              <p>Ilk filtreli arama linkini eklediginde burada gorunecek.</p>
            </div>
          ) : (
            <div className="collection">
              {searchProfiles.map((profile) => (
                <article className="savedCard" key={profile.id}>
                  <div className="badgeRow">
                    <span className="pill">{profile.source}</span>
                    <span className="pill">{profile.active ? "active" : "paused"}</span>
                  </div>
                  <h3>{profile.label}</h3>
                  <p>{profile.city} | URL ready for future ingestion</p>
                  <p>
                    Max {profile.max_price ?? "-"} EUR | Min year {profile.min_year ?? "-"} | Min profit {profile.min_profit ?? "-"} EUR
                  </p>
                  <p>{profile.notes || "Not yok."}</p>
                  <div className="inlineActions">
                    <button className="secondaryButton" type="button" onClick={() => void handleToggleSearchProfile(profile)}>
                      {profile.active ? "Pasif yap" : "Aktif yap"}
                    </button>
                    <button className="secondaryButton" type="button" onClick={() => void handleDeleteSearchProfile(profile.id)}>
                      Sil
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </details>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

type WatchlistCardProps = {
  deal: SavedDeal;
  noteValue: string;
  onNoteChange: (value: string) => void;
  onPromote: () => void;
  onSaveNote: () => void;
  onDelete: () => void;
};

function WatchlistCard({ deal, noteValue, onNoteChange, onPromote, onSaveNote, onDelete }: WatchlistCardProps) {
  return (
    <article className="savedCard savedCardCompact">
      <div className="savedTop">
        <div>
          <div className="badgeRow compactBadgeRow">
            <span className="pill">{deal.source}</span>
            <span className="pill">{deal.risk_level}</span>
            <span className="pill">{buyBoxLabel(deal.buy_box_status)}</span>
            <span className="pill">{confidenceLabel(deal.confidence_score)}</span>
            {deal.verification_required ? <span className="pill">manual check</span> : null}
          </div>
          <h3>{deal.title}</h3>
          <p className="savedSubtitle">
            {deal.city} | {deal.km.toLocaleString("de-DE")} km | {deal.fuel}
          </p>
        </div>
        <div className="dealValue">
          <span>net</span>
          <strong>{formatMoney(deal.net_profit)}</strong>
        </div>
      </div>

      <div className="quickMetrics">
        <MetricInline label="offer" value={formatMoney(deal.offer_price)} />
        <MetricInline label="target" value={formatMoney(deal.target_sale_price)} />
        <MetricInline label="margin" value={`%${deal.margin_percent}`} />
      </div>

      <div className="nextStep">
        <strong>Next</strong>
        <p>{deal.next_action}</p>
      </div>

      <p className="compactHint">{verificationSummary(deal)}</p>

      <div className="inlineActions">
        <button className="primaryButton" type="button" onClick={onPromote}>
          Portfolio'ya tasi
        </button>
        <button className="secondaryButton" type="button" onClick={onDelete}>
          Sil
        </button>
      </div>

      <details className="detailsBlock compactDetails">
        <summary>Notlar ve detaylar</summary>
        <p>{deal.recommended_message}</p>
        <p>Buy-box: {deal.buy_box_notes[0] ?? "Ek buy-box notu yok."}</p>
        <label className="noteField">
          <span>Operator note</span>
          <textarea
            value={noteValue}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="Satici ne dedi, ne kontrol edeceksin, hedef fiyat ne?"
          />
        </label>
        <div className="inlineActions">
          <button className="secondaryButton" type="button" onClick={onSaveNote}>
            Note kaydet
          </button>
        </div>
      </details>
    </article>
  );
}

type PortfolioCardProps = {
  deal: PortfolioDeal;
  noteValue: string;
  onNoteChange: (value: string) => void;
  onSaveNote: () => void;
  onCycleStatus: () => void;
  onDelete: () => void;
};

function PortfolioCard({
  deal,
  noteValue,
  onNoteChange,
  onSaveNote,
  onCycleStatus,
  onDelete,
}: PortfolioCardProps) {
  return (
    <article className="savedCard savedCardCompact">
      <div className="savedTop">
        <div>
          <div className="badgeRow compactBadgeRow">
            <span className="pill">{deal.status}</span>
            <span className="pill">{deal.source}</span>
            <span className="pill">{buyBoxLabel(deal.buy_box_status)}</span>
            <span className="pill">{confidenceLabel(deal.confidence_score)}</span>
          </div>
          <h3>{deal.title}</h3>
          <p className="savedSubtitle">
            {deal.city} | {deal.km.toLocaleString("de-DE")} km | {deal.fuel}
          </p>
        </div>
        <div className="dealValue">
          <span>net</span>
          <strong>{formatMoney(deal.net_profit)}</strong>
        </div>
      </div>

      <div className="quickMetrics">
        <MetricInline label="offer" value={formatMoney(deal.offer_price)} />
        <MetricInline label="cost" value={formatMoney(deal.total_cost)} />
        <MetricInline label="target" value={formatMoney(deal.target_sale_price)} />
      </div>

      <div className="nextStep">
        <strong>Next</strong>
        <p>{deal.next_action}</p>
      </div>

      <p className="compactHint">{verificationSummary(deal)}</p>

      <div className="inlineActions">
        <button className="primaryButton" type="button" onClick={onCycleStatus}>
          {nextPortfolioStatusLabel(deal.status)}
        </button>
        <button className="secondaryButton" type="button" onClick={onDelete}>
          Sil
        </button>
      </div>

      <details className="detailsBlock compactDetails">
        <summary>Notlar ve detaylar</summary>
        <p>{deal.recommended_message}</p>
        <p>Buy-box: {deal.buy_box_notes[0] ?? "Ek buy-box notu yok."}</p>
        <label className="noteField">
          <span>Operator note</span>
          <textarea
            value={noteValue}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder="Alindi mi, hangi masraf cikti, sonraki adim ne?"
          />
        </label>
        <div className="inlineActions">
          <button className="secondaryButton" type="button" onClick={onSaveNote}>
            Note kaydet
          </button>
        </div>
      </details>
    </article>
  );
}

function MetricInline({ label, value }: { label: string; value: string }) {
  return (
    <div className="metricInline">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function confidenceLabel(score: number): string {
  if (score >= 80) {
    return `high confidence ${score}`;
  }
  if (score >= 60) {
    return `medium confidence ${score}`;
  }
  return `low confidence ${score}`;
}

function buyBoxLabel(status: "fit" | "review" | "out"): string {
  if (status === "fit") {
    return "buy-box fit";
  }
  if (status === "review") {
    return "buy-box review";
  }
  return "buy-box out";
}

function noteKey(scope: "watchlist" | "portfolio", id: number): string {
  return `${scope}-${id}`;
}

function formatMoney(value: number): string {
  return `${value} EUR`;
}

function verificationSummary(deal: SavedDeal | PortfolioDeal): string {
  if (deal.verification_required) {
    return `Check: ${deal.verification_notes[0] ?? "Manual saha kontrolu oneriliyor."}`;
  }

  return "Check: Bu analiz daha guclu confidence ile geldi.";
}

function nextPortfolioStatusLabel(status: PortfolioDeal["status"]): string {
  if (status === "sourcing") {
    return "Prep'e gec";
  }
  if (status === "prep") {
    return "Sold'a gec";
  }
  return "Sourcing'e don";
}
