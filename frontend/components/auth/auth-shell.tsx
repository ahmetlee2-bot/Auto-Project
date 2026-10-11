"use client";

import Link from "next/link";
import { BrandMark } from "../brand-mark";
import { useLocale } from "../../lib/locale";
import { translate } from "../../lib/messages";
import { HeaderPreferences } from "../header-preferences";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string | React.ReactNode;
  children: React.ReactNode;
}) {
  const { locale } = useLocale();
  return (
    <main className="authSplitShell">
      <aside className="authValuePanel">
        <BrandMark light />
        <div className="authValueContent">
          <span className="authValueKicker">{translate(locale, "DEIN E-COMMERCE-COCKPIT")}</span>
          <h2>
            {translate(locale, "Mehr verkaufen.")}
            <br />
            {translate(locale, "Weniger manuell arbeiten.")}
          </h2>
          <p>
            {translate(locale, "Verbinde Amazon-Recherche, eBay-Listings und deine laufenden Abläufe in einem klaren Dashboard.")}
          </p>
          <ul>
            <li>
              <span>✓</span> {translate(locale, "Import per ASIN oder Chrome-Erweiterung")}
            </li>
            <li>
              <span>✓</span> {translate(locale, "Listing-Verarbeitung auf dem Server")}
            </li>
            <li>
              <span>✓</span> {translate(locale, "Bestand, Marge und Bestellungen im Blick")}
            </li>
          </ul>
        </div>
        <div className="authValueFoot">AutoLister · {locale === "de" ? "Cloud-Abläufe für eBay" : locale === "en" ? "Cloud operations for eBay" : "eBay için bulut iş akışları"}</div>
      </aside>
      <section className="authFormPanel">
        <div className="authFormWrap">
          <div className="authPreferences"><HeaderPreferences /></div>
          <div className="authMobileBrand">
            <BrandMark />
          </div>
          <p className="authPanelEyebrow">{translate(locale, eyebrow)}</p>
          <h1>{translate(locale, title)}</h1>
          <p className="authPanelDescription">{typeof description === "string" ? translate(locale, description) : description}</p>
          {children}
          <p className="authSecurityNote">
            <span aria-hidden="true">◈</span> {translate(locale, "Geschützter Zugang über HTTPS")}
          </p>
        </div>
        <p className="authBottomLinks">
          <Link href="/datenschutz">{translate(locale, "Datenschutzerklärung")}</Link>
          <Link href="/impressum">{translate(locale, "Impressum")}</Link>
          <Link href="/terms">{translate(locale, "Nutzungsbedingungen")}</Link>
          <Link href="/">{translate(locale, "Zur Startseite")}</Link>
        </p>
      </section>
    </main>
  );
}
