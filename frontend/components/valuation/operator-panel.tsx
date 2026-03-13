import type { AnalyzeResponse } from "../../lib/api";
import type { LocalBuyBoxSignal, ValuationEstimate } from "../../lib/valuation";
import { buyBoxLabel, formatCurrency } from "../../lib/valuation";

type OperatorPanelProps = {
  result: AnalyzeResponse | null;
  estimate: ValuationEstimate;
  localSignal: LocalBuyBoxSignal;
};

export function OperatorPanel({ result, estimate, localSignal }: OperatorPanelProps) {
  const notes = result ? [...result.strengths.slice(0, 2), ...result.buy_box_notes.slice(0, 2)] : localSignal.notes;
  const message = result ? result.recommended_message : "Canli operator mesajini gormek icin backend analyze tetiklenmeli.";
  const nextStep = result ? result.next_action : localSignal.nextStep;
  const netProfit = result ? result.net_profit : estimate.netProfit;
  const margin = result ? result.margin_percent : estimate.margin;
  const buyBox = result ? buyBoxLabel(result.buy_box_status) : buyBoxLabel(localSignal.status);

  return (
    <section className="panelCard glassCard">
      <div className="panelHeader">
        <div>
          <p className="sectionEyebrow">Operator buy-box</p>
          <h2>Flip analizi ve operator call</h2>
        </div>
      </div>

      <div className="operatorGrid">
        <div className="operatorSummary">
          <small>{buyBox}</small>
          <strong>{formatCurrency(netProfit)}</strong>
          <p>Expected net profit / Margin %{margin}</p>
        </div>
        <div className="operatorBody">
          <h3>Next action</h3>
          <p>{nextStep}</p>
          <ul>
            {notes.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="messagePanel">
        <small>Recommended opener</small>
        <p>{message}</p>
      </div>
    </section>
  );
}
