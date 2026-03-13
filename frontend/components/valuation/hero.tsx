type HeroProps = {
  preferredCity: string;
  activeSourceLabel: string;
  lastUpdatedLabel: string;
};

export function Hero({ preferredCity, activeSourceLabel, lastUpdatedLabel }: HeroProps) {
  return (
    <section className="heroSection">
      <div className="heroCopy glassCard">
        <p className="eyebrow">Dengeli premium theme / valuation-first cockpit</p>
        <h1>
          AUTONOW Select ile <span>degerleme</span>, operator call ve comparables ayni panelde.
        </h1>
        <p className="leadText">
          Mevcut valuation mantigi korunuyor. Form state, piyasa bandi, hizli satis seviyesi, alim tavani,
          operator buy-box, kaynak secimi, status kartlari ve scenario testleri backend'e hazir bir arayuze
          tasiniyor.
        </p>
      </div>

      <div className="heroMeta glassCard">
        <span className="heroMetaLabel">Current lane</span>
        <strong>{activeSourceLabel}</strong>
        <p>{preferredCity} odakli operator varsayimlariyla canli preview.</p>
        <div className="heroMetaRow">
          <span>Last refresh</span>
          <span>{lastUpdatedLabel}</span>
        </div>
      </div>
    </section>
  );
}
