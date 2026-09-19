import Link from "next/link";
import { AuthNav } from "../components/auth/auth-nav";

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
        description: "Automatisiert Amazon-zu-eBay-Listings und synchronisiert Bestand, Preise und Bestellungen.",
        offers: { "@type": "Offer", price: "0", priceCurrency: "EUR", availability: "https://schema.org/InStock" },
      },
      {
        "@type": "Organization",
        name: "AutoLister",
        url: "https://autolister-app.de/",
        email: "contact.autolister@gmail.com",
      },
      { "@type": "WebSite", name: "AutoLister", url: "https://autolister-app.de/", inLanguage: "de-DE" },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <main className="landingShell">
      <nav className="landingNav">
        <Link className="landingBrand" href="/">AutoLister</Link>
        <AuthNav />
      </nav>
      <section className="landingHero">
        <div className="landingCopy">
          <p className="sectionEyebrow">AMAZON → EBAY AUTOMATION</p>
          <h1>Produkte schneller listen. Bestand sicher synchronisieren.</h1>
          <p className="landingLead">AutoLister verbindet Produktrecherche, eBay Listings, Preissteuerung und Bestellungen in einem übersichtlichen SaaS-Dashboard.</p>
          <div className="landingActions"><Link className="primaryButton" href="/register">Kostenlos starten</Link><Link className="quietButton" href="/login">Einloggen</Link></div>
        </div>
        <div className="landingPreview" aria-label="AutoLister Dashboard Vorschau">
          <div className="previewTop"><span>AutoLister Dashboard</span><i>Live</i></div>
          <div className="previewMetrics"><article><small>Wartende Produkte</small><strong>24</strong></article><article><small>Gelistet auf eBay</small><strong>186</strong></article><article><small>Synchronisiert</small><strong>98%</strong></article></div>
          <div className="previewRows"><div><span className="previewImage" /><p><strong>Produktpool</strong><small>Bereit zur Veröffentlichung</small></p><b>READY</b></div><div><span className="previewImage" /><p><strong>Auf eBay aktiv</strong><small>Bestand und Preise synchron</small></p><b>ACTIVE</b></div></div>
        </div>
      </section>
      <section className="landingFeatures"><article><span>01</span><h2>Produktpool</h2><p>Entwürfe prüfen, vorbereiten und direkt bei eBay veröffentlichen.</p></article><article><span>02</span><h2>Live-Synchronisierung</h2><p>Listings, Amazon-Zuordnungen und Status zentral im Blick behalten.</p></article><article><span>03</span><h2>Bestellungen</h2><p>Neue eBay-Bestellungen sicher in einem Workflow bearbeiten.</p></article></section>
      </main>
    </>
  );
}
