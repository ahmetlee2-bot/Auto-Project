import type { AnalyzeResponse } from "../../lib/api";
import type { LocalBuyBoxSignal, ValuationEstimate } from "../../lib/valuation";
import { buyBoxLabel, formatCurrency } from "../../lib/valuation";

type MarketPanelProps = {
  estimate: ValuationEstimate;
  result: AnalyzeResponse | null;
  localSignal: LocalBuyBoxSignal;
  onSaveWatchlist: () => void;
  onSavePortfolio: () => void;
};

export function MarketPanel({ estimate, result, localSignal, onSaveWatchlist, onSavePortfolio }: MarketPanelProps) {
  const operatorHeadline = result ? result.summary : localSignal.title;
  const operatorBody = result ? result.next_action : localSignal.nextStep;
  const risk = result ? result.risk_level : estimate.risk;
  const recommendation = result ? buyBoxLabel(result.buy_box_status) : buyBoxLabel(localSignal.status);

  return (
    <section className="panelCard glassCard">
      <div className="panelHeader">
        <div>
          <p className="sectionEyebrow">Market output</p>
          <h2>Piyasa sonucu ve deal tag</h2>
        </div>
      </div>

      <div className={`signalBanner tone-${result ? result.buy_box_status : localSignal.status}`}>
        <small>{recommendation}</small>
        <strong>{operatorHeadline}</strong>
        <p>{operatorBody}</p>
      </div>

      <div className="headlineValue">
        <span>Fair market</span>
        <strong>{formatCurrency(estimate.fair)}</strong>
        <p>Risk {risk} / Net preview {formatCurrency(result ? result.net_profit : estimate.netProfit)}</p>
      </div>

      <div className="marketGrid">
        <MarketCard label="Piyasa bandi" value={`${formatCurrency(estimate.low)} - ${formatCurrency(estimate.high)}`} />
        <MarketCard label="Hizli satis" value={formatCurrency(estimate.fastSale)} />
        <MarketCard label="Akilli alim tavani" value={formatCurrency(estimate.buyBox)} />
        <MarketCard label="Risk seviyesi" value={risk} />
      </div>

      <div className="metricStrip">
        <MetricMini label="Prep" value={formatCurrency(estimate.prep)} />
        <MetricMini label="Fees" value={formatCurrency(estimate.fees)} />
        <MetricMini label="Resale" value={formatCurrency(estimate.resale)} />
        <MetricMini label="Margin" value={`%${result ? result.margin_percent : estimate.margin}`} />
      </div>

      <div className="actionRow">
        <button className="primaryButton" type="button" onClick={onSaveWatchlist} disabled={!result}>
          Watchlist'e kaydet
        </button>
        <button className="ghostButton" type="button" onClick={onSavePortfolio} disabled={!result}>
          Portfolio'ya kaydet
        </button>
      </div>

      {!result ? <p className="helperCopy">Kaydetme aksiyonlari backend analyze sonucu geldikten sonra aktif olur.</p> : null}
    </section>
  );
}

function MarketCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="marketCard">
      <small>{label}</small>
      <strong>{value}</strong>
    </article>
  );
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="metricMini">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
