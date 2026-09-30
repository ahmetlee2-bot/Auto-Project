import Link from "next/link";
import { BrandMark } from "../brand-mark";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="authSplitShell">
      <aside className="authValuePanel">
        <BrandMark light />
        <div className="authValueContent">
          <span className="authValueKicker">DEIN E-COMMERCE-COCKPIT</span>
          <h2>
            Mehr verkaufen.
            <br />
            Weniger manuell arbeiten.
          </h2>
          <p>
            Verbinde Amazon-Recherche, eBay-Listings und deine laufenden Abläufe
            in einem klaren Dashboard.
          </p>
          <ul>
            <li>
              <span>✓</span> Import per ASIN oder Chrome-Erweiterung
            </li>
            <li>
              <span>✓</span> Listing-Verarbeitung auf dem Server
            </li>
            <li>
              <span>✓</span> Bestand, Marge und Bestellungen im Blick
            </li>
          </ul>
        </div>
        <div className="authValueFoot">AutoLister · Cloud-Abläufe für eBay</div>
      </aside>
      <section className="authFormPanel">
        <div className="authFormWrap">
          <div className="authMobileBrand">
            <BrandMark />
          </div>
          <p className="authPanelEyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="authPanelDescription">{description}</p>
          {children}
          <p className="authSecurityNote">
            <span aria-hidden="true">◈</span> Geschützter Zugang über HTTPS
          </p>
        </div>
        <p className="authBottomLinks">
          <Link href="/datenschutz">Datenschutz</Link>
          <Link href="/impressum">Impressum</Link>
          <Link href="/terms.html">Nutzungsbedingungen</Link>
          <Link href="/">Zur Startseite</Link>
        </p>
      </section>
    </main>
  );
}
