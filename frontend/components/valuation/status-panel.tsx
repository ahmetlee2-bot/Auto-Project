import type { StatusCardData } from "../../lib/valuation";

type StatusPanelProps = {
  cards: StatusCardData[];
};

export function StatusPanel({ cards }: StatusPanelProps) {
  return (
    <section className="panelCard glassCard">
      <div className="panelHeader">
        <div>
          <p className="sectionEyebrow">Status cards</p>
          <h2>Durum ozeti</h2>
        </div>
      </div>

      <div className="statusGrid">
        {cards.map((card) => (
          <article className={`statusCard tone-${card.tone}`} key={card.label}>
            <small>{card.label}</small>
            <strong>{card.value}</strong>
            <p>{card.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
