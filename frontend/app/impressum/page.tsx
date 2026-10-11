import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "../../components/brand-mark";
import { legalIdentity } from "../../lib/legal";
import { HeaderPreferences } from "../../components/header-preferences";
import { LocaleMessage } from "../../components/locale-message";

export const dynamic = "force-dynamic";
export function generateMetadata(): Metadata {
  return {
    title: "Impressum",
    robots: { index: !legalIdentity().isExample, follow: true },
  };
}

export default function ImpressumPage() {
  const legal = legalIdentity();
  return (
    <main className="legalPage">
      <div className="legalTools"><HeaderPreferences /></div>
      <BrandMark />
      <h1><LocaleMessage de="Impressum" en="Legal notice" tr="Yasal bilgiler" /></h1>
      {legal.isExample ? (
        <div className="legalNotice">
          <LocaleMessage de="Musterangaben: Diese Seite enthält Platzhalter. Vor dem produktiven Einsatz müssen die Angaben durch die tatsächlichen Betreiberinformationen ersetzt werden." en="Template notice: This page contains placeholders. Replace them with the operator's actual details before production use." tr="Örnek bilgiler: Bu sayfada yer tutucular bulunur. Üretim kullanımından önce bunları işletmecinin gerçek bilgileriyle değiştirin." />
        </div>
      ) : null}
      <p className="legalTranslationNote"><LocaleMessage de="Die deutsche Fassung ist maßgeblich. Übersetzungen dienen nur der Orientierung." en="The German version is authoritative. Translations are provided for convenience only." tr="Esas metin Almancadır. Çeviriler yalnızca bilgilendirme amaçlıdır." /></p>
      <section>
        <h2><LocaleMessage de="Angaben gemäß § 5 DDG" en="Information pursuant to Section 5 DDG" tr="DDG § 5 uyarınca bilgiler" /></h2>
        <p>
          {legal.company}
          <br />
          {legal.address}
        </p>
      </section>
      <section>
        <h2><LocaleMessage de="Kontakt" en="Contact" tr="İletişim" /></h2>
        <p>
          <LocaleMessage de="E-Mail:" en="Email:" tr="E-posta:" />{" "}
          {legal.isExample ? (
            legal.email
          ) : (
            <a href={`mailto:${legal.email}`}>{legal.email}</a>
          )}
        </p>
      </section>
      <section>
        <h2><LocaleMessage de="Umsatzsteuer" en="VAT" tr="KDV" /></h2>
        <p>
          <LocaleMessage de="Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz:" en="VAT identification number pursuant to Section 27a of the German VAT Act:" tr="Alman KDV Kanunu § 27a uyarınca KDV kimlik numarası:" />{" "}
          {legal.vatId}
        </p>
      </section>
      <section>
        <h2><LocaleMessage de="Verantwortlich für den Inhalt" en="Responsible for content" tr="İçerikten sorumlu kişi" /></h2>
        <p>
          {legal.company}
          <br />
          {legal.address}
        </p>
      </section>
      <p><Link href="/"><LocaleMessage de="← Zur Startseite" en="← Back to home" tr="← Ana sayfaya dön" /></Link></p>
    </main>
  );
}
