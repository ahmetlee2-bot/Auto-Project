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

const questions = [
  {
    q: "Brauche ich einen dauerhaft eingeschalteten PC?",
    a: "Der Server verarbeitet gestartete Aufträge und überwacht verbundene Abläufe unabhängig von deinem Computer. Die Erweiterung brauchst du nur für Aktionen direkt im Browser.",
    enQ: "Do I need to keep my computer on?",
    enA: "The server processes submitted jobs and monitors connected workflows independently of your computer. You only need the extension for actions in your browser.",
    trQ: "Bilgisayarımın sürekli açık kalması gerekir mi?",
    trA: "Sunucu, başlatılan görevleri ve bağlı iş akışlarını bilgisayarından bağımsız yürütür. Eklenti yalnızca tarayıcıdaki işlemler için gerekir.",
  },
  {
    q: "Kann ich Produkte ohne Erweiterung importieren?",
    a: "Ja. Im Dashboard kannst du eine Amazon.de-URL oder ASIN eingeben und den Server-Auftrag direkt starten.",
    enQ: "Can I import products without the extension?",
    enA: "Yes. Enter an Amazon.de URL or ASIN in the dashboard and start a server job directly.",
    trQ: "Eklenti olmadan ürün aktarabilir miyim?",
    trA: "Evet. Panelde Amazon.de URL'si veya ASIN girip sunucu görevini doğrudan başlatabilirsin.",
  },
  {
    q: "Wird ein Angebot sofort veröffentlicht?",
    a: "Du kannst einen Entwurf zunächst prüfen. Die automatische Veröffentlichung ist eine eigene, auswählbare Option im Importformular.",
    enQ: "Is a listing published immediately?",
    enA: "You can review a draft first. Automatic publishing is a separate, optional setting in the import form.",
    trQ: "İlan hemen yayınlanır mı?",
    trA: "Önce taslağı inceleyebilirsin. Otomatik yayınlama, içe aktarma formunda ayrıca seçilen bir ayardır.",
  },
  {
    q: "Benötige ich für die Registrierung eine Kreditkarte?",
    a: "Für die Kontoerstellung werden Name, E-Mail-Adresse und Passwort benötigt. Zahlungsdaten werden dabei nicht abgefragt.",
    enQ: "Do I need a credit card to sign up?",
    enA: "You only need a name, email address, and password to create an account. No payment details are requested.",
    trQ: "Kayıt için kredi kartı gerekir mi?",
    trA: "Hesap açmak için ad, e-posta adresi ve şifre yeterlidir. Ödeme bilgisi istenmez.",
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
                <LocaleMessage de="Amazon-Produkte auf eBay listen." en="List Amazon products on eBay." tr="Amazon ürünlerini eBay'de listele." />{" "}
                <span><LocaleMessage de="Mit einem klaren Workflow." en="With a clear workflow." tr="Düzenli bir iş akışıyla." /></span>
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
                <span className="previewCloud">● <LocaleMessage de="CLOUD AKTIV" en="CLOUD ACTIVE" tr="BULUT AKTİF" /></span>
              </div>
              <div className="previewBody">
                <aside className="previewSidebar">
                  <div className="previewBrand">
                    <span>A</span> AutoLister
                  </div>
                  <div className="previewSidebarItem selected">
                    ▦ <span><LocaleMessage de="Übersicht" en="Overview" tr="Genel bakış" /></span>
                  </div>
                  <div className="previewSidebarItem">
                    ↗ <span><LocaleMessage de="Amazon Import" en="Amazon import" tr="Amazon aktarımı" /></span>
                  </div>
                  <div className="previewSidebarItem">
                    ◎ <span><LocaleMessage de="eBay-Angebote" en="eBay listings" tr="eBay ilanları" /></span>
                  </div>
                  <div className="previewSidebarItem">
                    ◫ <span><LocaleMessage de="Marge &amp; Bestand" en="Margin &amp; inventory" tr="Marj ve stok" /></span>
                  </div>
                  <div className="previewSidebarFoot"><LocaleMessage de="SERVER VERBUNDEN" en="SERVER CONNECTED" tr="SUNUCU BAĞLI" /></div>
                </aside>
                <div className="previewMain">
                  <div className="previewCaption"><LocaleMessage de="BEISPIEL-DASHBOARD" en="DASHBOARD PREVIEW" tr="PANEL ÖNİZLEMESİ" /></div>
                  <div className="previewMainHeading">
                    <div>
                        <span><LocaleMessage de="Operations" en="Operations" tr="Operasyonlar" /></span>
                        <strong><LocaleMessage de="Guten Morgen 👋" en="Good morning 👋" tr="Günaydın 👋" /></strong>
                    </div>
                    <span className="previewOnline">● <LocaleMessage de="Alle Systeme bereit" en="All systems ready" tr="Tüm sistemler hazır" /></span>
                  </div>
                  <div className="previewKpis">
                    <div>
                      <small><LocaleMessage de="eBay-Angebote" en="eBay listings" tr="eBay ilanları" /></small>
                      <strong><LocaleMessage de="Aktiv" en="Active" tr="Aktif" /></strong>
                      <span><LocaleMessage de="Aktuelle Angebote" en="Current listings" tr="Mevcut ilanlar" /></span>
                    </div>
                    <div>
                      <small><LocaleMessage de="Produktpool" en="Product pool" tr="Ürün havuzu" /></small>
                      <strong><LocaleMessage de="Bereit" en="Ready" tr="Hazır" /></strong>
                      <span><LocaleMessage de="Entwürfe prüfen" en="Review drafts" tr="Taslakları incele" /></span>
                    </div>
                    <div>
                      <small><LocaleMessage de="Cloud-Synchronisierung" en="Cloud sync" tr="Bulut eşitleme" /></small>
                      <strong>24/7</strong>
                      <span><LocaleMessage de="Serverseitiger Ablauf" en="Server-side workflow" tr="Sunucu tabanlı iş akışı" /></span>
                    </div>
                  </div>
                  <div className="previewTable">
                    <div className="previewTableHead">
                      <strong><LocaleMessage de="Deine Produkte" en="Your products" tr="Ürünlerin" /></strong>
                      <span>STATUS</span>
                    </div>
                    <div className="previewProduct">
                      <span className="previewProductArt blue">◈</span>
                      <span>
                        <b><LocaleMessage de="Produktlisting" en="Product listing" tr="Ürün ilanı" /></b>
                        <small><LocaleMessage de="eBay Angebot" en="eBay listing" tr="eBay ilanı" /></small>
                      </span>
                      <em><LocaleMessage de="Aktiv" en="Active" tr="Aktif" /></em>
                    </div>
                    <div className="previewProduct">
                      <span className="previewProductArt amber">▣</span>
                      <span>
                        <b><LocaleMessage de="Neuer Entwurf" en="New draft" tr="Yeni taslak" /></b>
                        <small><LocaleMessage de="Bereit zur Prüfung" en="Ready for review" tr="İncelemeye hazır" /></small>
                      </span>
                      <em className="previewReady"><LocaleMessage de="Bereit" en="Ready" tr="Hazır" /></em>
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
              <span className="sectionKicker"><LocaleMessage de="GEMEINSAM BESSER WERDEN" en="LET'S MAKE IT BETTER TOGETHER" tr="BİRLİKTE GELİŞTİRELİM" /></span>
              <h2><LocaleMessage de="Deine Erfahrung hilft uns weiter." en="Your feedback helps us improve." tr="Görüşlerin gelişmemize yardımcı olur." /></h2>
              <p>
                <LocaleMessage de="Wir sammeln gerade Rückmeldungen von AutoLister-Nutzern. Wenn du den Produktimport oder das Dashboard ausprobiert hast, freuen wir uns über deine ehrliche Einschätzung." en="We're gathering feedback from AutoLister users. If you've tried the product import or dashboard, we'd value your honest thoughts." tr="AutoLister kullanıcılarından geri bildirim topluyoruz. Ürün aktarımını veya paneli denediysen görüşlerini duymak isteriz." />
              </p>
            </div>
            <div className="feedbackCard">
              <span className="feedbackIcon" aria-hidden="true">
                ✦
              </span>
              <div>
                  <strong><LocaleMessage de="Dein Feedback, unverfälscht." en="Your honest feedback." tr="Samimi geri bildirimin." /></strong>
                <p>
                  <LocaleMessage de="Teile mit uns, was gut funktioniert und was wir verbessern sollten. Öffentliche Kundenstimmen zeigen wir erst nach ausdrücklicher Freigabe." en="Tell us what works well and what we should improve. We only publish customer comments with explicit permission." tr="Nelerin iyi çalıştığını ve neleri geliştirmemiz gerektiğini paylaş. Müşteri yorumlarını yalnızca açık izinle yayınlarız." />
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
              <article>
                <span>1</span>
                <h3><LocaleMessage de="Produkt auswählen" en="Choose a product" tr="Ürün seç" /></h3>
                <p>
                  <LocaleMessage de="Amazon.de-URL oder ASIN eingeben und Produktdaten erfassen." en="Enter an Amazon.de URL or ASIN to capture product data." tr="Ürün verilerini almak için Amazon.de URL'si veya ASIN gir." />
                </p>
              </article>
              <article>
                <span>2</span>
                <h3><LocaleMessage de="Details prüfen" en="Review the details" tr="Ayrıntıları incele" /></h3>
                <p>
                  <LocaleMessage de="Titel, Bilder, Merkmale und Zielmarge vor der Veröffentlichung kontrollieren." en="Check the title, images, item specifics, and target margin before publishing." tr="Yayınlamadan önce başlığı, görselleri, ürün özelliklerini ve hedef marjı kontrol et." />
                </p>
              </article>
              <article>
                <span>3</span>
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
          <WhatsAppLeadForm fallbackNumber={process.env.WHATSAPP_LEAD_NUMBER ?? ""} />

          <section id="faq" className="sectionWrap marketingSection faqSection">
            <div className="sectionIntro">
                <span className="sectionKicker">FAQ</span>
                <h2><LocaleMessage de="Häufige Fragen." en="Frequently asked questions." tr="Sıkça sorulan sorular." /></h2>
                <p><LocaleMessage de="Das Wichtigste zum Einstieg und zum Betrieb auf dem Server." en="The essentials for getting started and running jobs on the server." tr="Başlangıç ve sunucuda görev yürütme hakkında bilmen gerekenler." /></p>
            </div>
            <div className="faqList">
              {questions.map(({ q, a }) => (
                <details key={q}>
                  <summary>
                    <LocaleMessage de={q} en={questions.find((item) => item.q === q)?.enQ ?? q} tr={questions.find((item) => item.q === q)?.trQ ?? q} />
                    <span aria-hidden="true">＋</span>
                  </summary>
                  <p><LocaleMessage de={a} en={questions.find((item) => item.a === a)?.enA ?? a} tr={questions.find((item) => item.a === a)?.trA ?? a} /></p>
                </details>
              ))}
            </div>
          </section>
        </main>

        <footer className="marketingFooter">
          <div className="sectionWrap">
            <div className="footerCta">
              <div>
                  <span className="sectionKicker"><LocaleMessage de="BEREIT LOSZULEGEN?" en="READY TO GET STARTED?" tr="BAŞLAMAYA HAZIR MISIN?" /></span>
                  <h2><LocaleMessage de="Mach aus Produktdaten einen klaren Ablauf." en="Turn product data into a clear workflow." tr="Ürün verilerini düzenli bir iş akışına dönüştür." /></h2>
                  <p><LocaleMessage de="Ein Dashboard für Import, Prüfung und eBay Operations." en="One dashboard for imports, reviews, and eBay operations." tr="Aktarım, kontrol ve eBay operasyonları için tek panel." /></p>
              </div>
              <Link className="primaryButton" href="/register">
                <LocaleMessage de="AutoLister starten" en="Start AutoLister" tr="AutoLister'ı başlat" /> <span aria-hidden="true">→</span>
              </Link>
            </div>
            <div className="footerBottom">
              <div>
                <BrandMark />
                <p><LocaleMessage de="Amazon-zu-eBay Operations in der Cloud." en="Amazon-to-eBay operations in the cloud." tr="Amazon'dan eBay'e bulut operasyonları." /></p>
              </div>
              <nav aria-label="Rechtliches und Kontakt">
                <Link href="/impressum"><LocaleMessage de="Impressum" en="Legal notice" tr="Yasal bilgiler" /></Link>
                <Link href="/datenschutz"><LocaleMessage de="Datenschutz" en="Privacy" tr="Gizlilik" /></Link>
                <a href="/terms"><LocaleMessage de="AGB" en="Terms" tr="Kullanım koşulları" /></a>
                <ContactSupport />
              </nav>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
