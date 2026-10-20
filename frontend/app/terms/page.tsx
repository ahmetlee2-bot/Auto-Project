import type { Metadata } from "next";
import Link from "next/link";
import { HeaderPreferences } from "../../components/header-preferences";
import { BrandMark } from "../../components/brand-mark";
import { LocaleMessage } from "../../components/locale-message";
import { legalIdentity } from "../../lib/legal";

export const dynamic = "force-dynamic";
export function generateMetadata(): Metadata {
  return {
    title: "Nutzungsbedingungen (AGB)",
    robots: { index: !legalIdentity().isExample, follow: true },
  };
}

export default function TermsPage() {
  const legal = legalIdentity();
  return (
    <main className="legalPage">
      <div className="legalTools"><HeaderPreferences /></div>
      <BrandMark />
      <h1><LocaleMessage de="Nutzungsbedingungen (AGB)" en="Terms of Service" tr="Kullanım Koşulları (AGB)" /></h1>
      <p className="legalTranslationNote">
        <LocaleMessage
          de="Die deutsche Fassung ist maßgeblich. Übersetzungen dienen nur der Orientierung."
          en="The German version is authoritative. Translations are provided for convenience only."
          tr="Esas metin Almancadır. Çeviriler yalnızca bilgilendirme amaçlıdır."
        />
      </p>

      <section>
        <h2><LocaleMessage de="1. Geltungsbereich & Leistungsbeschreibung" en="1. Scope & Service Description" tr="1. Kapsam ve Hizmet Tanımı" /></h2>
        <p>
          <LocaleMessage
            de="AutoLister stellt eine webbasierte Software-as-a-Service (SaaS) Plattform sowie eine ergänzende Chrome-Erweiterung bereit, mit der Händler Produktdaten erfassen, eBay-Entwürfe vorbereiten, Produktbilder aufbereiten und verbundene Angebote serverseitig überwachen können."
            en="AutoLister provides a web-based Software-as-a-Service (SaaS) platform and a companion Chrome extension that enables sellers to capture product data, prepare eBay drafts, process product images, and monitor connected listings on the server."
            tr="AutoLister; satıcıların ürün verilerini yakalamasını, eBay taslakları hazırlamasını, ürün görsellerini işlemesini ve bağlı ilanları sunucu tarafında izlemesini sağlayan web tabanlı bir SaaS platformu ve Chrome eklentisi sunar."
          />
        </p>
      </section>

      <section>
        <h2><LocaleMessage de="2. Registrierung & Kontosicherheit" en="2. Registration & Account Security" tr="2. Kayıt ve Hesap Güvenliği" /></h2>
        <p>
          <LocaleMessage
            de="Die Nutzung des Dashboards erfordert ein registriertes Benutzerkonto. Nutzer sind verpflichtet, ihre Zugangsdaten sowie verbundene API-Tokens vertraulich zu behandeln und vor unbefugtem Zugriff Dritter zu schützen."
            en="Using the dashboard requires a registered user account. Users are responsible for keeping their login credentials and connected API tokens confidential and protected against unauthorized access."
            tr="Panel kullanımı kayıtlı bir kullanıcı hesabı gerektirir. Kullanıcılar, giriş bilgilerini ve bağlı API anahtarlarını gizli tutmakla ve yetkisiz erişime karşı korumakla yükümlüdür."
          />
        </p>
      </section>

      <section>
        <h2><LocaleMessage de="3. Verantwortlichkeit für Inhalte, Bildrechte & Plattformregeln" en="3. Responsibility for Content, Image Rights & Platform Policies" tr="3. İçerik, Görsel Hakları ve Platform Kuralları Sorumluluğu" /></h2>
        <p>
          <LocaleMessage
            de="AutoLister agiert ausschließlich als technisches Werkzeug. Nutzer sind allein dafür verantwortlich, dass alle importierten, bearbeiteten oder veröffentlichten Titel, Beschreibungen, Preise und Produktbilder den geltenden Gesetzen (insbesondere Marken-, Urheber- und Wettbewerbsrecht) sowie den Richtlinien von Amazon und eBay entsprechen. Vor jeder Veröffentlichung muss der Nutzer das Vorliegen der erforderlichen Bild- und Nutzungsrechte prüfen und bestätigen."
            en="AutoLister acts solely as a technical tool. Users are solely responsible for ensuring that all imported, edited, or published titles, descriptions, prices, and product images comply with applicable laws (including trademark, copyright, and competition law) as well as Amazon and eBay policies. Before publishing, users must verify and confirm that they hold the necessary image and usage rights."
            tr="AutoLister yalnızca teknik bir araç olarak hizmet verir. İçe aktarılan, düzenlenen veya yayınlanan tüm başlık, açıklama, fiyat ve ürün görsellerinin yürürlükteki yasalara (marka, telif ve rekabet hukuku dahil) ve Amazon ile eBay politikalarına uygunluğundan yalnızca kullanıcı sorumludur. Yayınlamadan önce kullanıcı gerekli görsel ve kullanım haklarına sahip olduğunu doğrulamalıdır."
          />
        </p>
      </section>

      <section>
        <h2><LocaleMessage de="4. Preis- & Bestandsüberwachung (Repricer)" en="4. Price & Inventory Monitoring (Repricer)" tr="4. Fiyat ve Stok İzleme (Repricer)" /></h2>
        <p>
          <LocaleMessage
            de="Die automatische Preis- und Bestandssynchronisierung hängt von der Erreichbarkeit externer Schnittstellen (Amazon-Datenquellen und eBay-API) ab. AutoLister übernimmt keine Garantie für eine unterbrechungsfreie Echtzeit-Aktualisierung und haftet nicht für Preisabweichungen, Überverkäufe oder Gebühren auf Drittplattformen."
            en="Automatic price and inventory synchronization depends on the availability of external interfaces (Amazon data sources and the eBay API). AutoLister does not guarantee uninterrupted real-time updates and is not liable for price discrepancies, overselling, or third-party platform fees."
            tr="Otomatik fiyat ve stok eşitleme, harici arayüzlerin (Amazon veri kaynakları ve eBay API) erişilebilirliğine bağlıdır. AutoLister kesintisiz gerçek zamanlı güncelleme garantisi vermez; fiyat farklılıkları, stok aşımı veya üçüncü taraf platform ücretlerinden sorumlu tutulamaz."
          />
        </p>
      </section>

      <section>
        <h2><LocaleMessage de="5. Tarife, Testphase & Kündigung" en="5. Plans, Trial & Cancellation" tr="5. Paketler, Deneme Süresi ve İptal" /></h2>
        <p>
          <LocaleMessage
            de="Die kostenlose Registrierung begründet kein kostenpflichtiges Abonnement. Kostenpflichtige Tarife kommen erst durch einen ausdrücklichen Buchungsvorgang zustande und können gemäß den jeweiligen Tarifbedingungen zum Ende des Abrechnungszeitraums gekündigt werden."
            en="Free registration does not start a paid subscription. Paid plans only take effect through an explicit checkout process and may be canceled at the end of the respective billing cycle."
            tr="Ücretsiz kayıt işlemi ücretli bir abonelik başlatmaz. Ücretli paketler yalnızca açık bir satın alma işlemiyle devreye girer ve ilgili fatura dönemi sonunda iptal edilebilir."
          />
        </p>
      </section>

      <section>
        <h2><LocaleMessage de="6. Kontakt & Schlussbestimmungen" en="6. Contact & Final Provisions" tr="6. İletişim ve Son Hükümler" /></h2>
        <p>
          <LocaleMessage
            de={`Es gilt das Recht der Bundesrepublik Deutschland. Bei Fragen zu diesen Nutzungsbedingungen erreichst du uns unter ${legal.email}.`}
            en={`These terms are governed by the laws of the Federal Republic of Germany. For questions regarding these terms, contact us at ${legal.email}.`}
            tr={`Bu koşullar Almanya Federal Cumhuriyeti yasalarına tabidir. Kullanım koşullarıyla ilgili sorularınız için ${legal.email} adresinden bize ulaşabilirsiniz.`}
          />
        </p>
      </section>

      <p><LocaleMessage de="Stand: Oktober 2026" en="Last updated: October 2026" tr="Son güncelleme: Ekim 2026" /></p>
      <p><Link href="/"><LocaleMessage de="← Zur Startseite" en="← Back to home" tr="← Ana sayfaya dön" /></Link></p>
    </main>
  );
}
