import type { ComparableListing } from "../../lib/valuation";
import { formatCurrency } from "../../lib/valuation";

type ComparablesPanelProps = {
  comparables: ComparableListing[];
};

export function ComparablesPanel({ comparables }: ComparablesPanelProps) {
  return (
    <section className="panelCard glassCard">
      <div className="panelHeader">
        <div>
          <p className="sectionEyebrow">Comparables</p>
          <h2>Karsilastirmali ilanlar</h2>
        </div>
      </div>

      <div className="comparablesList">
        {comparables.map((item) => (
          <article className="comparableCard" key={item.id}>
            <div>
              <div className="comparableTopline">
                <small>{item.tag}</small>
                <span>{item.source}</span>
              </div>
              <strong>{item.title}</strong>
              <p>
                {item.year} / {item.km.toLocaleString("de-DE")} km
              </p>
            </div>
            <div className="comparableValues">
              <strong>{formatCurrency(item.price)}</strong>
              <small>
                {item.deltaToFair >= 0 ? "+" : ""}
                {formatCurrency(item.deltaToFair)} vs fair
              </small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
