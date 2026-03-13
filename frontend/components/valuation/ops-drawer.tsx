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
          <small>Backend readiness</small>
          <strong>Operator collections ve runtime snapshot</strong>
        </div>
        <span>{watchlist.length} watch / {activePortfolio.length} active</span>
      </summary>

      <div className="opsDrawerGrid">
        <section>
          <h3>Watchlist snapshot</h3>
          {recentWatchlist.length === 0 ? <p>No watchlist deal yet.</p> : null}
          {recentWatchlist.map((deal) => (
            <article className="opsItem" key={`watch-${deal.id}`}>
              <strong>{deal.title}</strong>
              <p>Offer {deal.offer_price} EUR / Net {deal.net_profit} EUR</p>
            </article>
          ))}
        </section>

        <section>
          <h3>Aktif portfolio</h3>
          {recentPortfolio.length === 0 ? <p>No active portfolio deal yet.</p> : null}
          {recentPortfolio.map((deal) => (
            <article className="opsItem" key={`portfolio-${deal.id}`}>
              <strong>{deal.title}</strong>
              <p>{deal.status} / Net {deal.net_profit} EUR</p>
            </article>
          ))}
        </section>

        <section>
          <h3>Settings ve search profiles</h3>
          <article className="opsItem">
            <strong>Preferred city</strong>
            <p>{appSettings.preferred_city}</p>
          </article>
          <article className="opsItem">
            <strong>Min profit target</strong>
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
