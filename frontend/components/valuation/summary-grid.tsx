import type { SummaryCardData } from "../../lib/valuation";

type SummaryGridProps = {
  cards: SummaryCardData[];
};

export function SummaryGrid({ cards }: SummaryGridProps) {
  return (
    <section className="summaryGrid">
      {cards.map((card) => (
        <article className="summaryCard glassCard" key={card.label}>
          <small>{card.label}</small>
          <strong>{card.value}</strong>
          <p>{card.detail}</p>
        </article>
      ))}
    </section>
  );
}
