import type { AppSettings, PortfolioDeal, SavedDeal, SearchProfile } from "../../lib/api";

type OperatorDeskProps = {
  watchlist: SavedDeal[];
  portfolio: PortfolioDeal[];
  searchProfiles: SearchProfile[];
  appSettings: AppSettings;
};

export function OperatorDesk({ watchlist, portfolio, searchProfiles, appSettings }: OperatorDeskProps) {
  const activePortfolio = portfolio.filter((deal) => deal.status !== "sold");
  const recentWatchlist = watchlist.slice(0, 3);
  const recentPortfolio = activePortfolio.slice(0, 3);
  const activeProfiles = searchProfiles.filter((profile) => profile.active).slice(0, 3);

  return (
    <details className="opsDrawer glassCard">
      <summary>
        <div>
          <small>Serverstatus</small>
          <strong>Gespeicherte Angebote und aktuelle Daten</strong>
        </div>
        <span>{watchlist.length} vorgemerkt / {activePortfolio.length} aktiv</span>
      </summary>

      <div className="opsDrawerGrid">
        <section>
          <h3>Merkliste</h3>
          {recentWatchlist.length === 0 ? <p>Noch keine Angebote vorgemerkt.</p> : null}
          {recentWatchlist.map((deal) => (
            <article className="opsItem" key={`watch-${deal.id}`}>
              <strong>{deal.title}</strong>
              <p>Angebot {deal.offer_price} EUR / Netto {deal.net_profit} EUR</p>
            </article>
          ))}
        </section>

        <section>
          <h3>Aktives Portfolio</h3>
          {recentPortfolio.length === 0 ? <p>Noch keine aktiven Angebote.</p> : null}
          {recentPortfolio.map((deal) => (
            <article className="opsItem" key={`portfolio-${deal.id}`}>
              <strong>{deal.title}</strong>
              <p>{deal.status} / Netto {deal.net_profit} EUR</p>
            </article>
          ))}
        </section>

        <section>
          <h3>Einstellungen und Suchprofile</h3>
          <article className="opsItem">
            <strong>Bevorzugte Stadt</strong>
            <p>{appSettings.preferred_city}</p>
          </article>
          <article className="opsItem">
            <strong>Mindestgewinn</strong>
            <p>{appSettings.min_net_profit} EUR</p>
          </article>
          {activeProfiles.map((profile) => (
            <article className="opsItem" key={`profile-${profile.id}`}>
              <strong>{profile.label}</strong>
              <p>{profile.source} / {profile.city}</p>
            </article>
          ))}
        </section>
      </div>
    </details>
  );
}
