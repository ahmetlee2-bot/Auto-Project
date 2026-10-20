import Link from "next/link";
import type { Metadata } from "next";
import { AuthNav } from "../components/auth/auth-nav";
import { BrandMark } from "../components/brand-mark";
import { ContactSupport } from "../components/contact-support";
import { HeaderPreferences } from "../components/header-preferences";
import { MarketingNavigation } from "../components/marketing-navigation";
import { LocaleMessage } from "../components/locale-message";
import { ComparisonSection } from "../components/landing/comparison-section";
import { PricingSection } from "../components/landing/pricing-section";
import { WhatsAppLeadForm } from "../components/landing/whatsapp-lead-form";
import { TrustBadges } from "../components/landing/trust-badges";
import { FAQSection } from "../components/landing/faq-section";
import { MarketingFooter } from "../components/landing/marketing-footer";
import { HeroDashboardPreview } from "../components/landing/hero-dashboard-preview";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const storeUrl =
  "https://chromewebstore.google.com/detail/phppekchehibeiphdmjifmceoencigee";

const features = [
  {
    number: "01",
    title: "Produktimport",
    enTitle: "Product import",
    trTitle: "Ürün içe aktarma",
    text: "Amazon-Produktdaten per ASIN oder Erweiterung erfassen und als eBay-Entwurf vorbereiten.",
    enText: "Capture Amazon product data by ASIN or extension and prepare it as an eBay draft.",
    trText: "Amazon ürün verilerini ASIN veya eklentiyle alıp eBay taslağı olarak hazırla.",
    icon: "↗",
  },
  {
    number: "02",
    title: "Saubere eBay-Angebote",
    enTitle: "Polished eBay listings",
    trTitle: "Düzenli eBay ilanları",
    text: "Titel, Bilder und Produktdetails in einem klaren Prüfablauf bearbeiten.",
    enText: "Review titles, images, and product details in a clear workflow.",
    trText: "Başlıkları, görselleri ve ürün ayrıntılarını düzenli bir kontrol akışında incele.",
    icon: "▦",
  },
  {
    number: "03",
    title: "Marge im Blick",
    enTitle: "Keep margins in view",
    trTitle: "Kâr marjını takip et",
    text: "Zielmarge eingeben und einen Verkaufspreis mit geschätzten Gebühren berechnen.",
    enText: "Set a target margin and calculate a sale price with estimated fees.",
    trText: "Hedef marjını gir ve tahmini ücretlerle satış fiyatını hesapla.",
    icon: "◫",
  },
  {
    number: "04",
    title: "Cloud-Abläufe",
    enTitle: "Cloud operations",
    trTitle: "Bulut iş akışları",
    text: "Bestand, Bestellungen und Server-Aufträge im Dashboard überwachen.",
    enText: "Monitor inventory, orders, and server jobs from your dashboard.",
    trText: "Stokları, siparişleri ve sunucu görevlerini panelinden izle.",
    icon: "◎",
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
          "Amazon-Produktdaten für eBay-Angebote vorbereiten und Abläufe auf dem Server überwachen.",
      },
      {
        "@type": "Organization",
        name: "AutoLister",
        url: "https://autolister-app.de/",
        logo: "https://autolister-app.de/icon-512.png",
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
            <MarketingNavigation />
            <div className="headerActions">
              <HeaderPreferences />
              <AuthNav />
            </div>
          </div>
        </header>

        <main>
          <section className="marketingHero sectionWrap">
            <div className="heroText">
              <div className="heroBadge">
                <span aria-hidden="true">✦</span> <LocaleMessage de="CHROME-ERWEITERUNG + CLOUD ENGINE" en="CHROME EXTENSION + CLOUD ENGINE" tr="CHROME EKLENTİSİ + BULUT MOTORU" />
              </div>
              <h1>
                <LocaleMessage de="Amazon-Produkte auf eBay listen." en="List Amazon products on eBay." tr="eBay'de Amazon ürünlerini" />{" "}
                <span><LocaleMessage de="Mit einem klaren Workflow." en="With a clear workflow." tr="düzenli bir iş akışıyla listele." /></span>
              </h1>
              <p>
                <LocaleMessage de="Weniger manuelles Kopieren: AutoLister bereitet Titel, Bilder und Beschreibungen für eBay vor. Der Cloud-Server verarbeitet gestartete Aufträge und überwacht verbundene Abläufe auch dann, wenn dein PC ausgeschaltet ist." en="Less manual copying: AutoLister prepares titles, images, and descriptions for eBay. The cloud server processes submitted jobs and monitors connected workflows even when your computer is off." tr="Daha az elle kopyalama: AutoLister başlıkları, görselleri ve açıklamaları eBay için hazırlar. Bulut sunucusu, bilgisayarın kapalıyken bile başlatılan görevleri işler ve bağlı süreçleri izler." />
              </p>
              <div className="heroActions">
                <Link className="primaryButton" href="/register">
                  <LocaleMessage de="Kostenlos starten" en="Get started free" tr="Ücretsiz başla" /> <span aria-hidden="true">→</span>
                </Link>
                <a className="secondaryButton" href="#extension">
                  <LocaleMessage de="Chrome-Erweiterung entdecken" en="Explore the Chrome extension" tr="Chrome eklentisini keşfet" />{" "}
                  <span aria-hidden="true">↗</span>
                </a>
              </div>
              <div className="heroAssurance">
                <span>✓ <LocaleMessage de="eBay API-Anbindung" en="eBay API integration" tr="eBay API bağlantısı" /></span>
                <span>✓ <LocaleMessage de="Server-Aufträge ohne offenen Browser" en="Server jobs without an open browser" tr="Tarayıcı açık olmadan sunucu görevleri" /></span>
                <span>✓ <LocaleMessage de="Registrierung ohne Kreditkarte" en="Sign up without a credit card" tr="Kredi kartsız kayıt" /></span>
              </div>
              <TrustBadges compact />
            </div>
            <HeroDashboardPreview />
          </section>

          <section className="trustBar" aria-label="Technologie">
            <div className="sectionWrap trustBarInner">
              <span><LocaleMessage de="ENTWICKELT FÜR VERLÄSSLICHE ABLÄUFE" en="BUILT FOR RELIABLE OPERATIONS" tr="GÜVENİLİR İŞ AKIŞLARI İÇİN GELİŞTİRİLDİ" /></span>
              <b><LocaleMessage de="High-Performance Cloud-Infrastruktur (Hetzner)" en="High-performance cloud infrastructure (Hetzner)" tr="Yüksek performanslı bulut altyapısı (Hetzner)" /></b>
              <b><LocaleMessage de="eBay API" en="eBay API" tr="eBay API" /></b>
              <b><LocaleMessage de="Chrome-Erweiterung" en="Chrome extension" tr="Chrome eklentisi" /></b>
              <b>HTTPS</b>
            </div>
          </section>

          <section id="funktionen" className="sectionWrap marketingSection">
            <div className="sectionIntro">
                <span className="sectionKicker"><LocaleMessage de="FUNKTIONEN" en="FEATURES" tr="ÖZELLİKLER" /></span>
              <h2>
                <LocaleMessage de="Alle wichtigen Schritte." en="Every essential step." tr="İhtiyacın olan tüm adımlar." />
                <br />
                <span><LocaleMessage de="Ein aufgeräumter Arbeitsplatz." en="One organized workspace." tr="Düzenli bir çalışma alanı." /></span>
              </h2>
              <p>
                <LocaleMessage de="Vom Produktimport bis zur laufenden Übersicht: AutoLister führt die Informationen zusammen, die du für deine eBay-Abläufe brauchst." en="From product import to ongoing operations, AutoLister brings together the information you need to manage your eBay workflow." tr="Ürün aktarımından günlük takibe kadar AutoLister, eBay iş akışın için gereken bilgileri bir araya getirir." />
              </p>
            </div>
            <div className="featureGrid">
              {features.map((feature) => (
                <article className="featureCard" key={feature.number}>
                  <span className="featureIcon" aria-hidden="true">
                    {feature.icon}
                  </span>
                  <span className="featureNumber">{feature.number}</span>
                  <h3><LocaleMessage de={feature.title} en={feature.enTitle} tr={feature.trTitle} /></h3>
                  <p><LocaleMessage de={feature.text} en={feature.enText} tr={feature.trText} /></p>
                </article>
              ))}
            </div>
          </section>

          <section className="sectionWrap marketingSection feedbackSection">
            <div className="sectionIntro">
              <span className="sectionKicker"><LocaleMessage de="WARUM HÄNDLER WECHSELN" en="WHY SELLERS SWITCH" tr="SATICILAR NEDEN TERCİH EDİYOR" /></span>
              <h2><LocaleMessage de="Gebaut für den täglichen eBay.de-Handel." en="Built for daily eBay.de operations." tr="Günlük eBay.de operasyonları için tasarlandı." /></h2>
              <p>
                <LocaleMessage de="Statt überladener Tabellen erhältst du einen präzisen Workflow vom Amazon-Kandidaten bis zum überwachten Live-Angebot." en="Instead of cluttered spreadsheets, you get a precise workflow from Amazon product candidate to monitored live listing." tr="Karmaşık tablolar yerine Amazon ürün adayından izlenen canlı ilana kadar net bir iş akışı elde edersin." />
              </p>
            </div>
            <div className="stepGrid" style={{ marginBottom: "1.5rem" }}>
              <article className="stepCard">
                <span className="stepNumber">✦</span>
                <h3><LocaleMessage de="KI-Titel & 1500×1500 Cover-Studio" en="AI Title & 1500×1500 Cover Studio" tr="YZ Başlık ve 1500×1500 Kapak Stüdyosu" /></h3>
                <p>
                  <LocaleMessage de="Optimiere Produkttitel exakt auf das 80-Zeichen-Limit von eBay und versehe das Hauptbild optional automatisch mit einem sauberen Verkaufsrahmen." en="Optimize product titles to eBay's exact 80-character limit and optionally frame your main cover image automatically." tr="Ürün başlıklarını eBay'in 80 karakter sınırına göre optimize et ve ana kapak görseline isteğe bağlı çerçeve uygula." />
                </p>
              </article>
              <article className="stepCard">
                <span className="stepNumber">€</span>
                <h3><LocaleMessage de="Reale Gebühren- & Margenformel" en="Real Fee & Margin Formula" tr="Gerçek Komisyon ve Marj Formülü" /></h3>
                <p>
                  <LocaleMessage de="Jeder Entwurf kalkuliert Amazon-Einkauf, Versandkosten, 13 % eBay-Gebühr und 2 % Zahlungsabwicklung vorab in deinen Zielpreis ein." en="Every draft factors Amazon cost, shipping, 13% eBay fee, and 2% payment processing into your target price upfront." tr="Her taslak; Amazon alış fiyatını, kargoyu, %13 eBay komisyonunu ve %2 ödeme kesintisini hedef fiyatına önceden dahil eder." />
                </p>
              </article>
              <article className="stepCard">
                <span className="stepNumber">◎</span>
                <h3><LocaleMessage de="Direkte Richtlinien-Synchronisation" en="Direct Policy Synchronization" tr="Doğrudan Politika Eşitlemesi" /></h3>
                <p>
                  <LocaleMessage de="Versand-, Zahlungs- und Rückgaberichtlinien sowie dein Lagerstandort werden direkt aus deinem verbundenen eBay-Konto geladen." en="Shipping, payment, and return policies plus your merchant location load directly from your connected eBay account." tr="Kargo, ödeme ve iade politikaları ile depo konumun doğrudan bağlı eBay hesabından çekilir." />
                </p>
              </article>
            </div>
            <div className="feedbackCard">
              <span className="feedbackIcon" aria-hidden="true">
                ✦
              </span>
              <div>
                <strong><LocaleMessage de="Direkter Draht zum Produkt-Team" en="Direct line to the product team" tr="Ürün ekibiyle doğrudan iletişim" /></strong>
                <p>
                  <LocaleMessage de="Fehlt dir eine Funktion im Sourcing-Pool oder Repricer? Schreib uns direkt — wir entwickeln AutoLister eng mit aktiven eBay.de-Händlern weiter." en="Missing a feature in the sourcing pool or repricer? Write to us directly — we build AutoLister closely with active eBay.de sellers." tr="Ürün havuzunda veya fiyatlandırma motorunda beklediğin bir özellik mi var? Bize doğrudan yaz; AutoLister'ı aktif satıcılarla birlikte geliştiriyoruz." />
                </p>
              </div>
              <ContactSupport
                label="Feedback senden"
                className="primaryButton"
              />
            </div>
          </section>

          <section id="cloud" className="cloudSection">
            <div className="sectionWrap cloudGrid">
              <div>
              <span className="sectionKicker"><LocaleMessage de="DER CLOUD-VORTEIL" en="THE CLOUD ADVANTAGE" tr="BULUTUN AVANTAJI" /></span>
                <h2>
                  <LocaleMessage de="Dein Workflow läuft weiter, wenn du den Laptop zuklappst." en="Your workflow keeps running after you close your laptop." tr="Dizüstü bilgisayarını kapatsan da iş akışın devam eder." />
                </h2>
                <p>
                  <LocaleMessage de="Die Erweiterung hilft beim Erfassen im Browser. Gestartete Server-Aufträge und die eingerichtete Überwachung laufen auf dem Server weiter." en="The extension helps capture products in your browser. Submitted server jobs and monitoring continue running on the server." tr="Eklenti, ürünleri tarayıcıda yakalamana yardımcı olur. Başlatılan sunucu görevleri ve izleme sunucuda çalışmaya devam eder." />
                </p>
                <Link className="textLink" href="/register">
                  <LocaleMessage de="Cloud-Workflow starten" en="Start your cloud workflow" tr="Bulut iş akışını başlat" /> <span aria-hidden="true">→</span>
                </Link>
              </div>
              <div className="cloudFlow">
                <div>
                  <span className="flowIcon">⌘</span>
                  <strong><LocaleMessage de="Im Browser erfassen" en="Capture in the browser" tr="Tarayıcıda yakala" /></strong>
                  <small><LocaleMessage de="Produktdaten auswählen" en="Choose product data" tr="Ürün verilerini seç" /></small>
                </div>
                <span className="flowArrow">↓</span>
                <div className="flowActive">
                  <span className="flowIcon">◎</span>
                  <strong><LocaleMessage de="Auf dem Server verarbeiten" en="Process on the server" tr="Sunucuda işle" /></strong>
                  <small><LocaleMessage de="Aufträge, Entwürfe und Status" en="Jobs, drafts, and status" tr="Görevler, taslaklar ve durum" /></small>
                </div>
                <span className="flowArrow">↓</span>
                <div>
                  <span className="flowIcon">↗</span>
                  <strong><LocaleMessage de="Im Dashboard prüfen" en="Review in the dashboard" tr="Panelde incele" /></strong>
                  <small><LocaleMessage de="eBay-Angebote im Blick behalten" en="Keep track of eBay listings" tr="eBay ilanlarını takip et" /></small>
                </div>
              </div>
            </div>
          </section>

          <section
            id="extension"
            className="sectionWrap marketingSection howSection"
          >
            <div className="sectionIntro">
              <span className="sectionKicker"><LocaleMessage de="SO FUNKTIONIERT ES" en="HOW IT WORKS" tr="NASIL ÇALIŞIR" /></span>
              <h2><LocaleMessage de="Drei Schritte zum nächsten Listing." en="Three steps to your next listing." tr="Yeni ilanına üç adımda ulaş." /></h2>
              <p>
                <LocaleMessage de="Nutze die Chrome-Erweiterung oder starte den Import direkt im Dashboard per ASIN." en="Use the Chrome extension or start an ASIN import directly from your dashboard." tr="Chrome eklentisini kullan veya ASIN ile aktarımı doğrudan panelinden başlat." />
              </p>
            </div>
            <div className="stepGrid">
              <article className="stepCard">
                <span className="stepNumber">1</span>
                <h3><LocaleMessage de="Produkt auswählen" en="Choose a product" tr="Ürün seç" /></h3>
                <p>
                  <LocaleMessage de="Amazon.de-URL oder ASIN eingeben und Produktdaten erfassen." en="Enter an Amazon.de URL or ASIN to capture product data." tr="Ürün verilerini almak için Amazon.de URL'si veya ASIN gir." />
                </p>
              </article>
              <article className="stepCard">
                <span className="stepNumber">2</span>
                <h3><LocaleMessage de="Details prüfen" en="Review the details" tr="Ayrıntıları incele" /></h3>
                <p>
                  <LocaleMessage de="Titel, Bilder, Merkmale und Zielmarge vor der Veröffentlichung kontrollieren." en="Check the title, images, item specifics, and target margin before publishing." tr="Yayınlamadan önce başlığı, görselleri, ürün özelliklerini ve hedef marjı kontrol et." />
                </p>
              </article>
              <article className="stepCard">
                <span className="stepNumber">3</span>
                <h3><LocaleMessage de="Auf eBay bringen" en="Publish on eBay" tr="eBay'de yayınla" /></h3>
                <p>
                  <LocaleMessage de="Entwurf veröffentlichen und den Status im Dashboard verfolgen." en="Publish your draft and track its status in the dashboard." tr="Taslağını yayınla ve durumunu panelden takip et." />
                </p>
              </article>
            </div>
            <a
              className="secondaryButton extensionLink"
              href={storeUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <LocaleMessage de="Chrome-Erweiterung im Store ansehen" en="View the Chrome extension in the store" tr="Chrome eklentisini mağazada görüntüle" />{" "}
              <span aria-hidden="true">↗</span>
            </a>
          </section>

          <ComparisonSection />
          <PricingSection />
          <TrustBadges />
          <WhatsAppLeadForm fallbackNumber={process.env.WHATSAPP_LEAD_NUMBER ?? ""} />

          <FAQSection />
        </main>

        <MarketingFooter />
      </div>
    </>
  );
}
