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

export function MarketPanel({
  estimate,
  result,
  localSignal,
  onSaveWatchlist,
  onSavePortfolio,
}: MarketPanelProps) {
  const operatorHeadline = result ? result.summary : localSignal.title;
  const operatorBody = result ? result.next_action : localSignal.nextStep;
  const risk = result ? result.risk_level : estimate.risk;
  const recommendation = result
    ? buyBoxLabel(result.buy_box_status)
    : buyBoxLabel(localSignal.status);

  return (
    <section className="panelCard glassCard">
      <div className="panelHeader">
        <div>
          <p className="sectionEyebrow">Marktanalyse</p>
          <h2>Marktwert und Kaufempfehlung</h2>
        </div>
      </div>

      <div
        className={`signalBanner tone-${result ? result.buy_box_status : localSignal.status}`}
      >
        <small>{recommendation}</small>
        <strong>{operatorHeadline}</strong>
        <p>{operatorBody}</p>
      </div>

      <div className="headlineValue">
        <span>Geschätzter Marktwert</span>
        <strong>{formatCurrency(estimate.fair)}</strong>
        <p>
          Risiko {risk} / geschätzter Nettogewinn{" "}
          {formatCurrency(result ? result.net_profit : estimate.netProfit)}
        </p>
      </div>

      <div className="marketGrid">
        <MarketCard
          label="Marktpreisspanne"
          value={`${formatCurrency(estimate.low)} – ${formatCurrency(estimate.high)}`}
        />
        <MarketCard
          label="Preis für schnellen Verkauf"
          value={formatCurrency(estimate.fastSale)}
        />
        <MarketCard
          label="Empfohlener Höchstpreis"
          value={formatCurrency(estimate.buyBox)}
        />
        <MarketCard label="Risikostufe" value={risk} />
      </div>

      <div className="metricStrip">
        <MetricMini
          label="Aufbereitung"
          value={formatCurrency(estimate.prep)}
        />
        <MetricMini label="Gebühren" value={formatCurrency(estimate.fees)} />
        <MetricMini
          label="Wiederverkauf"
          value={formatCurrency(estimate.resale)}
        />
        <MetricMini
          label="Marge"
          value={`${result ? result.margin_percent : estimate.margin} %`}
        />
      </div>

      <div className="actionRow">
        <button
          className="primaryButton"
          type="button"
          onClick={onSaveWatchlist}
          disabled={!result}
        >
          In der Merkliste speichern
        </button>
        <button
          className="ghostButton"
          type="button"
          onClick={onSavePortfolio}
          disabled={!result}
        >
          Im Portfolio speichern
        </button>
      </div>

      {!result ? (
        <p className="helperCopy">
          Speicheraktionen werden verfügbar, sobald die Analyse abgeschlossen
          ist.
        </p>
      ) : null}
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
