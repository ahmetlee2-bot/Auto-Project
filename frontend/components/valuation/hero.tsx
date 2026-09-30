type HeroProps = {
  preferredCity: string;
  activeSourceLabel: string;
  lastUpdatedLabel: string;
};

export function Hero({
  preferredCity,
  activeSourceLabel,
  lastUpdatedLabel,
}: HeroProps) {
  return (
    <section className="heroSection">
      <div className="heroCopy glassCard">
        <p className="eyebrow">Marktwert und Angebote im Überblick</p>
        <h1>
          Fahrzeugbewertung, Kaufrahmen und Marktvergleiche in einer Übersicht.
        </h1>
        <p className="leadText">
          Vergleiche Fahrzeugdaten und Marktpreise, prüfe geschätzte Kosten und
          behalte mögliche Kaufpreise in einer klaren Übersicht im Blick.
        </p>
      </div>

      <div className="heroMeta glassCard">
        <span className="heroMetaLabel">Datenquelle</span>
        <strong>{activeSourceLabel}</strong>
        <p>Marktübersicht für {preferredCity}.</p>
        <div className="heroMetaRow">
          <span>Zuletzt aktualisiert</span>
          <span>{lastUpdatedLabel}</span>
        </div>
      </div>
    </section>
  );
}
