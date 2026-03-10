"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  AnalyzeRequest,
  AnalyzeResponse,
  PortfolioDeal,
  SavedDeal,
  analyzeListing,
  createPortfolioDeal,
  createWatchlistDeal,
  deletePortfolioDeal,
  deleteWatchlistDeal,
  fetchPortfolio,
  fetchWatchlist,
  updatePortfolioNote,
  updatePortfolioStatus,
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

export default function Page() {
  const [form, setForm] = useState<AnalyzeRequest>(initialForm);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [watchlist, setWatchlist] = useState<SavedDeal[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioDeal[]>([]);
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
      const [watchlistData, portfolioData] = await Promise.all([fetchWatchlist(), fetchPortfolio()]);
      setWatchlist(watchlistData);
      setPortfolio(portfolioData);
      setError("");
    } catch (loadError) {
      console.error(loadError);
      setError("Backend calisiyor ama watchlist veya portfolio verisi okunamadi.");
    } finally {
      setIsBootstrapping(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
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

  const activePortfolio = portfolio.filter((item) => item.status !== "sold");
  const expectedProfit = activePortfolio.reduce((total, item) => total + item.net_profit, 0);
  const soldProfit = portfolio.filter((item) => item.status === "sold").reduce((total, item) => total + item.net_profit, 0);
  const buyBoxFitDeals = watchlist.filter((item) => item.buy_box_status === "fit").length;

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">AUTONOW Phase 1</p>
          <h1>Analizden sonra kararlar artik backend'de saklaniyor.</h1>
          <p className="lead">
            Bu ekran artik sadece intake paneli degil. Analiz sonucunu watchlist ve portfolio'ya kaydedip
            ayni backend API uzerinden geri okuyabiliyoruz. Bir sonraki mantikli adim artik database
            uzerinde operator akisini buyutmek. Bu sprintte source parser ve Hamburg buy-box
            siniflamasi da eklendi.
          </p>
        </div>
        <div className="heroCard">
          <span>Current milestone</span>
          <strong>analysis + parser + buy-box + persistence</strong>
          <p>SQLite tabani aktif. Frontend artik parser sonucu ve buy-box uygunlugunu da canli okuyor.</p>
        </div>
      </section>

      <section className="dashboardGrid">
        <MetricCard label="Watchlist deals" value={String(watchlist.length)} />
        <MetricCard label="Portfolio deals" value={String(portfolio.length)} />
        <MetricCard label="Buy-box fit" value={String(buyBoxFitDeals)} />
        <MetricCard label="Expected profit" value={`${expectedProfit} EUR`} />
        <MetricCard label="Sold profit" value={`${soldProfit} EUR`} />
      </section>

      <section className="grid">
        <form className="card" onSubmit={onSubmit}>
          <div className="cardHeader">
            <div>
              <h2>Deal Intake</h2>
              <p>Link veya ilan metnini gir. Backend analizi artik kaydedilebilir sonuc uretiyor.</p>
            </div>
            <button
              className="secondaryButton"
              type="button"
              onClick={() =>
                setForm({
                  ...initialForm,
                  source: "Kleinanzeigen",
                  brand: "VW",
                  model: "Golf",
                  year: 2006,
                  km: 178000,
                  fuel: "Benzin",
                  asking_price: 1350,
                  city: "Hamburg",
                  raw_text: sampleText,
                })
              }
            >
              Sample
            </button>
          </div>

          <div className="formGrid">
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
            <label className="full">
              <span>Ilan metni / notlar</span>
              <textarea
                value={form.raw_text ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, raw_text: event.target.value }))}
                placeholder={sampleText}
              />
            </label>
          </div>

          <div className="formActions">
            <button className="primaryButton" type="submit" disabled={isLoading}>
              {isLoading ? "Analiz ediliyor..." : "Backend ile analiz et"}
            </button>
            <button className="secondaryButton" type="button" onClick={() => setForm(initialForm)}>
              Temizle
            </button>
          </div>
        </form>

        <section className="card">
          <div className="cardHeader">
            <div>
              <h2>Analysis Output</h2>
              <p>Backend'den gelen normalize analiz sonucu burada ve artik kaydedilebilir durumda.</p>
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
                  <h4>Strengths</h4>
                  <ul>
                    {result.strengths.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
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
                  <h4>Negotiation Plan</h4>
                  <ul>
                    {result.negotiation_points.map((item) => (
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
                <div className="subCard">
                  <h4>Action Prompt</h4>
                  <p>{result.next_action}</p>
                  <p>{result.recommended_message}</p>
                </div>
              </div>

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
              <p>Backend tarafinda kalici tutulan ilk secim havuzu.</p>
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
                <article className="savedCard" key={deal.id}>
                  <div className="badgeRow">
                    <span className="pill">{deal.source}</span>
                    <span className="pill">{deal.risk_level}</span>
                    <span className="pill">{buyBoxLabel(deal.buy_box_status)}</span>
                    <span className="pill">parser {deal.source_parser}</span>
                    <span className="pill">{confidenceLabel(deal.confidence_score)}</span>
                    {deal.verification_required ? <span className="pill">manual check</span> : null}
                  </div>
                  <h3>{deal.title}</h3>
                  <p>
                    Offer {deal.offer_price} EUR | Net {deal.net_profit} EUR | Margin %{deal.margin_percent}
                  </p>
                  <p>Verification: {deal.verification_notes[0] ?? "Ek saha teyidi notu yok."}</p>
                  <p>Buy-box: {deal.buy_box_notes[0] ?? "Kural notu yok."}</p>
                  <p>Next step: {deal.next_action}</p>
                  <p>Message: {deal.recommended_message}</p>
                  <label className="noteField">
                    <span>Operator note</span>
                    <textarea
                      value={noteDrafts[noteKey("watchlist", deal.id)] ?? deal.operator_note}
                      onChange={(event) =>
                        setNoteDrafts((current) => ({
                          ...current,
                          [noteKey("watchlist", deal.id)]: event.target.value,
                        }))
                      }
                      placeholder="Satici ne dedi, ne kontrol edeceksin, hedef fiyat ne?"
                    />
                  </label>
                  <div className="inlineActions">
                    <button className="primaryButton" type="button" onClick={() => void handlePromoteWatchlist(deal)}>
                      Portfolio'ya tasi
                    </button>
                    <button className="secondaryButton" type="button" onClick={() => void handleSaveWatchlistNote(deal.id)}>
                      Note kaydet
                    </button>
                    <button className="secondaryButton" type="button" onClick={() => void handleDeleteWatchlist(deal.id)}>
                      Sil
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="cardHeader">
            <div>
              <h2>Portfolio</h2>
              <p>Durum takibi artik backend kaydi uzerinden donuyor.</p>
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
                <article className="savedCard" key={deal.id}>
                  <div className="badgeRow">
                    <span className="pill">{deal.status}</span>
                    <span className="pill">{deal.source}</span>
                    <span className="pill">{buyBoxLabel(deal.buy_box_status)}</span>
                    <span className="pill">parser {deal.source_parser}</span>
                    <span className="pill">{confidenceLabel(deal.confidence_score)}</span>
                  </div>
                  <h3>{deal.title}</h3>
                  <p>
                    Offer {deal.offer_price} EUR | Total {deal.total_cost} EUR | Net {deal.net_profit} EUR
                  </p>
                  <p>
                    {deal.verification_required
                      ? `Verification: ${deal.verification_notes[0] ?? "Manual kontrol oneriliyor."}`
                      : "Verification: confidence seviyesi bu analiz icin daha guclu."}
                  </p>
                  <p>Buy-box: {deal.buy_box_notes[0] ?? "Kural notu yok."}</p>
                  <p>Next step: {deal.next_action}</p>
                  <p>Message: {deal.recommended_message}</p>
                  <label className="noteField">
                    <span>Operator note</span>
                    <textarea
                      value={noteDrafts[noteKey("portfolio", deal.id)] ?? deal.operator_note}
                      onChange={(event) =>
                        setNoteDrafts((current) => ({
                          ...current,
                          [noteKey("portfolio", deal.id)]: event.target.value,
                        }))
                      }
                      placeholder="Alindi mi, hangi masraf cikti, sonraki adim ne?"
                    />
                  </label>
                  <div className="inlineActions">
                    <button className="secondaryButton" type="button" onClick={() => void handleSavePortfolioNote(deal.id)}>
                      Note kaydet
                    </button>
                    <button className="secondaryButton" type="button" onClick={() => void handleCyclePortfolioStatus(deal)}>
                      Durum degistir
                    </button>
                    <button className="secondaryButton" type="button" onClick={() => void handleDeletePortfolio(deal.id)}>
                      Sil
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
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
