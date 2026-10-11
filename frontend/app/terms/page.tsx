import type { Metadata } from "next";
import { HeaderPreferences } from "../../components/header-preferences";
import { BrandMark } from "../../components/brand-mark";
import { LocaleMessage } from "../../components/locale-message";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <main className="legalPage">
      <div className="legalTools"><HeaderPreferences /></div>
      <BrandMark />
      <h1><LocaleMessage de="Nutzungsbedingungen" en="Terms of service" tr="Kullanım koşulları" /></h1>
      <p><LocaleMessage de="AutoLister unterstützt beim Import von Produktdaten und der Vorbereitung von eBay-Angeboten. Nutzer sind für die Einhaltung der Regeln von Amazon und eBay verantwortlich." en="AutoLister helps import product data and prepare eBay listings. Users are responsible for complying with Amazon and eBay policies." tr="AutoLister, ürün verilerini içe aktarmaya ve eBay ilanlarını hazırlamaya yardımcı olur. Amazon ve eBay kurallarına uyumdan kullanıcılar sorumludur." /></p>
      <p><LocaleMessage de="Stand: 13. September 2026" en="Last updated: September 13, 2026" tr="Son güncelleme: 13 Eylül 2026" /></p>
      <p><a href="/"><LocaleMessage de="← Zur Startseite" en="← Back to home" tr="← Ana sayfaya dön" /></a></p>
    </main>
  );
}
