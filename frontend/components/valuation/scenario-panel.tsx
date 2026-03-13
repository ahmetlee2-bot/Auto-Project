import type { ScenarioCase } from "../../lib/valuation";
import { formatCurrency } from "../../lib/valuation";

type ScenarioPanelProps = {
  scenarios: ScenarioCase[];
};

export function ScenarioPanel({ scenarios }: ScenarioPanelProps) {
  return (
    <section className="panelCard glassCard">
      <div className="panelHeader">
        <div>
          <p className="sectionEyebrow">Scenario tests</p>
          <h2>Sanity ve scenario testleri</h2>
        </div>
      </div>

      <div className="scenarioGrid">
        {scenarios.map((scenario) => (
          <article className={`scenarioCard tone-${scenario.tone}`} key={scenario.title}>
            <small>{scenario.title}</small>
            <strong>{scenario.verdict}</strong>
            <p>
              Resale {formatCurrency(scenario.resale)} / Cost {formatCurrency(scenario.totalCost)}
            </p>
            <div className="scenarioMeta">
              <span>{formatCurrency(scenario.netProfit)}</span>
              <span>%{scenario.margin}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
