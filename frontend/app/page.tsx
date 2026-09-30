import Link from "next/link";
import type { Metadata } from "next";
import { AuthNav } from "../components/auth/auth-nav";
import { BrandMark } from "../components/brand-mark";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const storeUrl =
  "https://chromewebstore.google.com/detail/phppekchehibeiphdmjifmceoencigee";

const features = [
  {
    number: "01",
    title: "Produktimport",
    text: "Amazon-Produktdaten per ASIN oder Erweiterung erfassen und als eBay-Entwurf vorbereiten.",
    icon: "↗",
  },
  {
    number: "02",
    title: "Saubere Listings",
    text: "Titel, Bilder und Produktdetails in einem klaren Prüfablauf bearbeiten.",
    icon: "▦",
  },
  {
    number: "03",
    title: "Marge im Blick",
    text: "Zielmarge eingeben und einen Verkaufspreis mit geschätzten Gebühren berechnen.",
    icon: "◫",
  },
  {
    number: "04",
    title: "Cloud Operations",
    text: "Bestand, Bestellungen und Server-Aufträge im Dashboard überwachen.",
    icon: "◎",
  },
];

const questions = [
  {
    q: "Brauche ich einen dauerhaft eingeschalteten PC?",
    a: "Der Server verarbeitet gestartete Aufträge und überwacht verbundene Abläufe unabhängig von deinem Computer. Die Erweiterung brauchst du nur für Aktionen direkt im Browser.",
  },
  {
    q: "Kann ich Produkte ohne Erweiterung importieren?",
    a: "Ja. Im Dashboard kannst du eine Amazon.de-URL oder ASIN eingeben und den Server-Auftrag direkt starten.",
  },
  {
    q: "Wird ein Angebot sofort veröffentlicht?",
    a: "Du kannst einen Entwurf zunächst prüfen. Die automatische Veröffentlichung ist eine eigene, auswählbare Option im Importformular.",
  },
  {
    q: "Benötige ich für die Registrierung eine Kreditkarte?",
    a: "Für die Kontoerstellung werden Name, E-Mail-Adresse und Passwort benötigt. Zahlungsdaten werden dabei nicht abgefragt.",
  },
];

export default function Page() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "AutoLister",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web, Chrome",
        url: "https://autolister-app.de/",
        description:
          "Amazon-Produktdaten für eBay-Listings vorbereiten und Abläufe auf dem Server überwachen.",
      },
      {
        "@type": "Organization",
        name: "AutoLister",
        url: "https://autolister-app.de/",
        email: "contact.autolister@gmail.com",
      },
      {
        "@type": "WebSite",
        name: "AutoLister",
        url: "https://autolister-app.de/",
        inLanguage: "de-DE",
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <div className="marketingPage">
        <header className="siteHeader">
          <div className="siteHeaderInner">
            <BrandMark />
            <nav className="siteNav" aria-label="Hauptnavigation">
              <a href="#funktionen">Funktionen</a>
              <a href="#extension">Chrome-Erweiterung</a>
              <a href="#cloud">Cloud-Vorteil</a>
              <a href="#preise">Preise</a>
              <a href="#faq">FAQ</a>
            </nav>
            <AuthNav />
            <details className="mobileMenu">
              <summary aria-label="Menü öffnen">
                Menü <span aria-hidden="true">☰</span>
              </summary>
              <nav aria-label="Mobile Navigation">
                <a href="#funktionen">Funktionen</a>
                <a href="#extension">Erweiterung</a>
                <a href="#cloud">Cloud-Vorteil</a>
                <a href="#preise">Preise</a>
                <a href="#faq">FAQ</a>
                <Link href="/login">Anmelden</Link>
                <Link href="/register">Jetzt starten</Link>
              </nav>
            </details>
          </div>
        </header>

        <main>
          <section className="marketingHero sectionWrap">
            <div className="heroText">
              <div className="heroBadge">
                <span aria-hidden="true">✦</span> CHROME-ERWEITERUNG + CLOUD
                ENGINE
              </div>
              <h1>
                Amazon-Produkte auf eBay listen.{" "}
                <span>Mit einem klaren Workflow.</span>
              </h1>
              <p>
                Weniger manuelles Kopieren: AutoLister bereitet Titel, Bilder
                und Beschreibungen für eBay vor. Der Cloud-Server verarbeitet
                gestartete Aufträge und überwacht verbundene Abläufe auch dann,
                wenn dein PC ausgeschaltet ist.
              </p>
              <div className="heroActions">
                <Link className="primaryButton" href="/register">
                  Kostenlos starten <span aria-hidden="true">→</span>
                </Link>
                <a className="secondaryButton" href="#extension">
                  Chrome-Erweiterung entdecken{" "}
                  <span aria-hidden="true">↗</span>
                </a>
              </div>
              <div className="heroAssurance">
                <span>✓ eBay API-Anbindung</span>
                <span>✓ Server-Aufträge ohne offenen Browser</span>
                <span>✓ Registrierung ohne Kreditkarte</span>
              </div>
            </div>
            <div
              className="heroVisual"
              aria-label="Beispielansicht des AutoLister-Dashboards"
            >
              <div className="previewTopbar">
                <div className="previewTraffic">
                  <i />
                  <i />
                  <i />
                </div>
                <span>autolister-app.de/dashboard</span>
                <span className="previewCloud">● CLOUD AKTIV</span>
              </div>
              <div className="previewBody">
                <aside className="previewSidebar">
                  <div className="previewBrand">
                    <span>A</span> AutoLister
                  </div>
                  <div className="previewSidebarItem selected">
                    ▦ <span>Übersicht</span>
                  </div>
                  <div className="previewSidebarItem">
                    ↗ <span>Amazon Import</span>
                  </div>
                  <div className="previewSidebarItem">
                    ◎ <span>eBay Listings</span>
                  </div>
                  <div className="previewSidebarItem">
                    ◫ <span>Marge &amp; Bestand</span>
                  </div>
                  <div className="previewSidebarFoot">SERVER VERBUNDEN</div>
                </aside>
                <div className="previewMain">
                  <div className="previewCaption">BEISPIEL-DASHBOARD</div>
                  <div className="previewMainHeading">
                    <div>
                      <span>Operations</span>
                      <strong>Guten Morgen 👋</strong>
                    </div>
                    <span className="previewOnline">● Alle Systeme bereit</span>
                  </div>
                  <div className="previewKpis">
                    <div>
                      <small>eBay Listings</small>
                      <strong>Aktiv</strong>
                      <span>Aktuelle Angebote</span>
                    </div>
                    <div>
                      <small>Produktpool</small>
                      <strong>Bereit</strong>
                      <span>Entwürfe prüfen</span>
                    </div>
                    <div>
                      <small>Cloud Sync</small>
                      <strong>24/7</strong>
                      <span>Serverseitiger Ablauf</span>
                    </div>
                  </div>
                  <div className="previewTable">
                    <div className="previewTableHead">
                      <strong>Deine Produkte</strong>
                      <span>STATUS</span>
                    </div>
                    <div className="previewProduct">
                      <span className="previewProductArt blue">◈</span>
                      <span>
                        <b>Produktlisting</b>
                        <small>eBay Angebot</small>
                      </span>
                      <em>Aktiv</em>
                    </div>
                    <div className="previewProduct">
                      <span className="previewProductArt amber">▣</span>
                      <span>
                        <b>Neuer Entwurf</b>
                        <small>Bereit zur Prüfung</small>
                      </span>
                      <em className="previewReady">Bereit</em>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="trustBar" aria-label="Technologie">
            <div className="sectionWrap trustBarInner">
              <span>ENTWICKELT FÜR VERLÄSSLICHE ABLÄUFE</span>
              <b>Hetzner Cloud Altyapısı</b>
              <b>eBay API</b>
              <b>Chrome-Erweiterung</b>
              <b>HTTPS</b>
            </div>
          </section>

          <section id="funktionen" className="sectionWrap marketingSection">
            <div className="sectionIntro">
              <span className="sectionKicker">FUNKTIONEN</span>
              <h2>
                Alle wichtigen Schritte.
                <br />
                <span>Ein aufgeräumter Arbeitsplatz.</span>
              </h2>
              <p>
                Vom Produktimport bis zur laufenden Übersicht: AutoLister führt
                die Informationen zusammen, die du für deine eBay-Abläufe
                brauchst.
              </p>
            </div>
            <div className="featureGrid">
              {features.map((feature) => (
                <article className="featureCard" key={feature.number}>
                  <span className="featureIcon" aria-hidden="true">
                    {feature.icon}
                  </span>
                  <span className="featureNumber">{feature.number}</span>
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="cloud" className="cloudSection">
            <div className="sectionWrap cloudGrid">
              <div>
                <span className="sectionKicker">DER CLOUD-VORTEIL</span>
                <h2>
                  Dein Workflow läuft weiter, wenn du den Laptop zuklappst.
                </h2>
                <p>
                  Die Erweiterung hilft beim Erfassen im Browser. Gestartete
                  Server-Aufträge und die eingerichtete Überwachung laufen auf
                  dem Server weiter.
                </p>
                <Link className="textLink" href="/register">
                  Cloud-Workflow starten <span aria-hidden="true">→</span>
                </Link>
              </div>
              <div className="cloudFlow">
                <div>
                  <span className="flowIcon">⌘</span>
                  <strong>Im Browser erfassen</strong>
                  <small>Produktdaten auswählen</small>
                </div>
                <span className="flowArrow">↓</span>
                <div className="flowActive">
                  <span className="flowIcon">◎</span>
                  <strong>Auf dem Server verarbeiten</strong>
                  <small>Aufträge, Entwürfe und Status</small>
                </div>
                <span className="flowArrow">↓</span>
                <div>
                  <span className="flowIcon">↗</span>
                  <strong>Im Dashboard prüfen</strong>
                  <small>eBay-Angebote im Blick behalten</small>
                </div>
              </div>
            </div>
          </section>

          <section
            id="extension"
            className="sectionWrap marketingSection howSection"
          >
            <div className="sectionIntro">
              <span className="sectionKicker">SO FUNKTIONIERT ES</span>
              <h2>Drei Schritte zum nächsten Listing.</h2>
              <p>
                Nutze die Chrome-Erweiterung oder starte den Import direkt im
                Dashboard per ASIN.
              </p>
            </div>
            <div className="stepGrid">
              <article>
                <span>1</span>
                <h3>Produkt auswählen</h3>
                <p>
                  Amazon.de-URL oder ASIN eingeben und Produktdaten erfassen.
                </p>
              </article>
              <article>
                <span>2</span>
                <h3>Details prüfen</h3>
                <p>
                  Titel, Bilder, Merkmale und Zielmarge vor der Veröffentlichung
                  kontrollieren.
                </p>
              </article>
              <article>
                <span>3</span>
                <h3>Auf eBay bringen</h3>
                <p>
                  Entwurf veröffentlichen und den Status im Dashboard verfolgen.
                </p>
              </article>
            </div>
            <a
              className="secondaryButton extensionLink"
              href={storeUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Chrome-Erweiterung im Store ansehen{" "}
              <span aria-hidden="true">↗</span>
            </a>
          </section>

          <section id="preise" className="pricingSection">
            <div className="sectionWrap pricingGrid">
              <div>
                <span className="sectionKicker">PREISE</span>
                <h2>
                  Einfach starten.
                  <br />
                  Mit deinem Workflow wachsen.
                </h2>
                <p>
                  Erstelle dein Konto und erkunde den Produktimport sowie das
                  Operations-Dashboard. Für die Registrierung werden keine
                  Zahlungsdaten benötigt.
                </p>
              </div>
              <div className="pricingCard">
                <span className="pricingTag">EINSTIEG</span>
                <h3>Konto erstellen</h3>
                <p>
                  Ein Zugang für Produktentwürfe, eBay Übersicht und
                  Server-Aufträge.
                </p>
                <div className="pricingDivider" />
                <ul>
                  <li>✓ Registrierung ohne Kreditkarte</li>
                  <li>✓ Dashboard und Produktpool</li>
                  <li>✓ Import per URL oder ASIN</li>
                </ul>
                <Link className="primaryButton" href="/register">
                  Jetzt starten <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </section>

          <section id="faq" className="sectionWrap marketingSection faqSection">
            <div className="sectionIntro">
              <span className="sectionKicker">FAQ</span>
              <h2>Häufige Fragen.</h2>
              <p>Das Wichtigste zum Einstieg und zum Betrieb auf dem Server.</p>
            </div>
            <div className="faqList">
              {questions.map(({ q, a }) => (
                <details key={q}>
                  <summary>
                    {q}
                    <span aria-hidden="true">＋</span>
                  </summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </section>
        </main>

        <footer className="marketingFooter">
          <div className="sectionWrap">
            <div className="footerCta">
              <div>
                <span className="sectionKicker">BEREIT LOSZULEGEN?</span>
                <h2>Mach aus Produktdaten einen klaren Ablauf.</h2>
                <p>Ein Dashboard für Import, Prüfung und eBay Operations.</p>
              </div>
              <Link className="primaryButton" href="/register">
                AutoLister starten <span aria-hidden="true">→</span>
              </Link>
            </div>
            <div className="footerBottom">
              <div>
                <BrandMark />
                <p>Amazon-zu-eBay Operations in der Cloud.</p>
              </div>
              <nav aria-label="Rechtliches und Kontakt">
                <Link href="/impressum">Impressum</Link>
                <Link href="/datenschutz">Datenschutz</Link>
                <a href="/terms.html">AGB</a>
                <a href="mailto:contact.autolister@gmail.com">Kontakt</a>
              </nav>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
