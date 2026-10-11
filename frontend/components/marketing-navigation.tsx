"use client";

import Link from "next/link";
import { ContactSupport } from "./contact-support";
import { HeaderPreferences } from "./header-preferences";
import { useLocale, localeText } from "../lib/locale";

export function MarketingNavigation() {
  const { locale } = useLocale();
  const labels = {
    features: localeText(locale, { de: "Funktionen", en: "Features", tr: "Özellikler" }),
    extension: localeText(locale, { de: "Chrome-Erweiterung", en: "Chrome extension", tr: "Chrome eklentisi" }),
    cloud: localeText(locale, { de: "Cloud-Vorteil", en: "Cloud benefits", tr: "Bulut avantajı" }),
    pricing: localeText(locale, { de: "Preise", en: "Pricing", tr: "Fiyatlar" }),
    faq: localeText(locale, { de: "FAQ", en: "FAQ", tr: "SSS" }),
    support: localeText(locale, { de: "Kontakt", en: "Contact", tr: "İletişim" }),
    menu: localeText(locale, { de: "Menü", en: "Menu", tr: "Menü" }),
    login: localeText(locale, { de: "Anmelden", en: "Log in", tr: "Giriş yap" }),
    start: localeText(locale, { de: "Jetzt starten", en: "Get started", tr: "Hemen başla" }),
  };
  return (
    <>
      <nav className="siteNav" aria-label={localeText(locale, { de: "Hauptnavigation", en: "Main navigation", tr: "Ana gezinme" })}>
        <a href="#funktionen">{labels.features}</a>
        <a href="#extension">{labels.extension}</a>
        <a href="#cloud">{labels.cloud}</a>
        <a href="#preise">{labels.pricing}</a>
        <a href="#faq">{labels.faq}</a>
        <ContactSupport label={labels.support} />
      </nav>
      <details className="mobileMenu">
        <summary aria-label={localeText(locale, { de: "Menü öffnen", en: "Open menu", tr: "Menüyü aç" })}>
          {labels.menu} <span aria-hidden="true">☰</span>
        </summary>
        <nav aria-label={localeText(locale, { de: "Mobile Navigation", en: "Mobile navigation", tr: "Mobil gezinme" })}>
          <div className="mobileHeaderPreferences"><HeaderPreferences /></div>
          <a href="#funktionen">{labels.features}</a>
          <a href="#extension">{labels.extension}</a>
          <a href="#cloud">{labels.cloud}</a>
          <a href="#preise">{labels.pricing}</a>
          <a href="#faq">{labels.faq}</a>
          <ContactSupport label={labels.support} />
          <Link href="/login">{labels.login}</Link>
          <Link href="/register">{labels.start}</Link>
        </nav>
      </details>
    </>
  );
}
