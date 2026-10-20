import {
  Activity,
  ArrowUpRight,
  Check,
  Clock3,
  Globe2,
  LockKeyhole,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingUp,
} from "lucide-react";
import { LocaleMessage } from "../locale-message";

const events = [
  {
    icon: Store,
    iconClass: "is-blue",
    title: {
      de: "De'Longhi Dedica EC685 Espressomaschine",
      en: "De'Longhi Dedica EC685 Espresso Machine",
      tr: "De'Longhi Dedica EC685 Espresso Makinesi",
    },
    detail: {
      de: "Amazon: 139,00 € ➔ eBay DE: 189,90 € • Nettogewinn: +28,40 €",
      en: "Amazon: €139.00 ➔ eBay DE: €189.90 • Net profit: +€28.40",
      tr: "Amazon: 139,00 € ➔ eBay DE: 189,90 € • Net Kâr: +28,40 €",
    },
    status: { de: "Live (EBAY_DE)", en: "Live (EBAY_DE)", tr: "Yayında (EBAY_DE)" },
    statusClass: "is-green",
  },
  {
    icon: PackageCheck,
    iconClass: "is-purple",
    title: {
      de: "Bestellung #24-09812 automatisch versendet",
      en: "Order #24-09812 automatically fulfilled",
      tr: "Sipariş #24-09812 Otomatik Kargolandı",
    },
    detail: {
      de: "Aquiline-Tracking an eBay übertragen: AQ94820194US (USPS-konform)",
      en: "Aquiline tracking sent to eBay: AQ94820194US (USPS compatible)",
      tr: "Aquiline Takip Kodu eBay'e İşlendi: AQ94820194US (USPS Uyumlu)",
    },
    status: { de: "Tracking bestätigt ✓", en: "Tracking confirmed ✓", tr: "Takip Onaylandı ✓" },
    statusClass: "is-blue",
  },
  {
    icon: Sparkles,
    iconClass: "is-amber",
    title: {
      de: "Produktpool: OBD2 & 3D-Autozubehör-Set",
      en: "Ready product pool: OBD2 & 3D automotive accessories",
      tr: "Hazır Ürün Havuzu: Otomotiv OBD2 & 3D Aksesuar Seti",
    },
    detail: {
      de: "VERO-Prüfung: sicher ✓ • KI-SEO-Titel (79/80) • wird auf 3 Stores verteilt",
      en: "VERO check: clear ✓ • AI SEO title (79/80) • distributing to 3 stores",
      tr: "VERO Kontrolü: Güvenli ✓ • YZ SEO Başlık (79/80) • 3 Mağazaya Dağıtılıyor",
    },
    status: { de: "Geplant (14:00)", en: "Scheduled (14:00)", tr: "Zamanlandı (14:00)" },
    statusClass: "is-amber",
  },
];

export function HeroDashboardPreview() {
  return (
    <div className="heroDashboardStage">
      <div className="heroDashboardGlow" aria-hidden="true" />
      <section className="heroDashboardMockup" aria-label="AutoLister dashboard preview">
        <div className="heroMockupBrowserBar">
          <div className="heroMockupTraffic" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="heroMockupUrl">
            <LockKeyhole size={12} strokeWidth={2.2} aria-hidden="true" />
            <span>autolister-app.de/dashboard</span>
          </div>
          <div className="heroMockupCloudStatus">
            <i aria-hidden="true" />
            <LocaleMessage de="CLOUD ENGINE AKTIV (24/7)" en="CLOUD ENGINE ACTIVE (24/7)" tr="BULUT MOTORU AKTİF (7/24)" />
          </div>
        </div>

        <div className="heroMockupContent">
          <div className="heroMockupTopline">
            <div className="heroMockupBrand">
              <span className="heroMockupBrandMark">A</span>
              <strong>AutoLister</strong>
              <span className="heroMockupPreviewLabel">
                <LocaleMessage de="DASHBOARD-VORSCHAU" en="DASHBOARD PREVIEW" tr="PANEL ÖNİZLEMESİ" />
              </span>
            </div>
            <div className="heroMockupStorePill">
              <Globe2 size={15} aria-hidden="true" />
              <span className="heroMockupStoreCopy">
                <LocaleMessage de="Aktive Stores:" en="Active stores:" tr="Aktif Mağazalar:" />
                <b><LocaleMessage de="12 verbundene Konten" en="12 connected accounts" tr="12 Bağlı Hesap" /></b>
                <small>(US • DE • UK)</small>
              </span>
              <i aria-label="Online" />
            </div>
          </div>

          <div className="heroMockupProtection">
            <ShieldCheck size={14} aria-hidden="true" />
            <span><LocaleMessage de="Anti-Suspend & Aquiline Schutz: aktiv" en="Anti-suspend & Aquiline protection: active" tr="Anti-Suspend & Aquiline Koruması: Aktif" /></span>
          </div>

          <div className="heroMockupMetrics">
            <article className="heroMockupMetric heroMockupMetricRevenue">
              <div className="heroMockupMetricIcon"><TrendingUp size={16} aria-hidden="true" /></div>
              <span className="heroMockupMetricLabel"><LocaleMessage de="Umsatz der letzten 30 Tage" en="Sales volume · 30 days" tr="30 Günlük Satış Hacmi" /></span>
              <strong>€28.450,00</strong>
              <span className="heroMockupMetricFoot">
                <b>+€6.820 <LocaleMessage de="Nettogewinn (24 % Marge)" en="net profit (24% margin)" tr="Net Kâr (%24 Marj)" /></b>
                <svg viewBox="0 0 70 24" role="img" aria-label="Upward trend">
                  <path d="M1 20.5h68" />
                  <path className="heroMockupSparkLine" d="M2 18 13 15 22 17 31 9 40 12 51 5 59 8 68 2" />
                </svg>
              </span>
            </article>
            <article className="heroMockupMetric">
              <div className="heroMockupMetricIcon is-blue"><Activity size={16} aria-hidden="true" /></div>
              <span className="heroMockupMetricLabel"><LocaleMessage de="Automatischer Bestand" en="Automated inventory" tr="Otomatik Envanter" /></span>
              <strong><LocaleMessage de="1.420 aktive Angebote" en="1,420 active listings" tr="1.420 Aktif İlan" /></strong>
              <span className="heroMockupMetricNote is-blue"><Clock3 size={12} aria-hidden="true" /><LocaleMessage de="Warteschlange: 85 Produkte (alle 4 Std.)" en="Queued: 85 products (every 4 hours)" tr="Kuyrukta: 85 Ürün (Her 4 saatte 1)" /></span>
            </article>
            <article className="heroMockupMetric">
              <div className="heroMockupMetricIcon is-indigo"><ShieldCheck size={16} aria-hidden="true" /></div>
              <span className="heroMockupMetricLabel"><LocaleMessage de="Bestands- & Preisschutz" en="Stock & price protection" tr="Stok & Fiyat Koruma" /></span>
              <strong><LocaleMessage de="99,8 % synchron" en="99.8% synchronized" tr="%99.8 Senkronize" /></strong>
              <span className="heroMockupMetricNote is-indigo">Amazon • 3D <LocaleMessage de="Druck" en="printing" tr="Baskı" /> • POD <LocaleMessage de="Pool" en="pool" tr="Havuzu" /></span>
            </article>
          </div>

          <div className="heroMockupFeed">
            <div className="heroMockupFeedHeading">
              <div>
                <span className="heroMockupLiveDot" aria-hidden="true" />
                <strong><LocaleMessage de="Live-Automatisierung & Bestellungen" en="Live automation & order feed" tr="Canlı Otomasyon & Sipariş Akışı" /></strong>
              </div>
              <span><LocaleMessage de="LIVE" en="LIVE" tr="CANLI" /></span>
            </div>
            <div className="heroMockupEventList">
              {events.map((event) => {
                const Icon = event.icon;
                return (
                  <div className="heroMockupEvent" key={event.status.tr}>
                    <span className={`heroMockupEventIcon ${event.iconClass}`}><Icon size={16} strokeWidth={2.1} aria-hidden="true" /></span>
                    <span className="heroMockupEventCopy">
                      <strong><LocaleMessage {...event.title} /></strong>
                      <small><LocaleMessage {...event.detail} /></small>
                    </span>
                    <span className={`heroMockupEventStatus ${event.statusClass}`}>
                      {event.status.tr === "Takip Onaylandı ✓" && <Check size={11} aria-hidden="true" />}
                      <LocaleMessage {...event.status} />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="heroMockupFooter">
            <span className="heroMockupServerStatus"><i aria-hidden="true" /><LocaleMessage de="Hetzner Cloud Engine verbunden (14 ms)" en="Hetzner cloud engine connected (14 ms)" tr="Hetzner Cloud Engine Bağlı (14ms)" /></span>
            <span className="heroMockupLastUpdate"><ArrowUpRight size={12} aria-hidden="true" /><LocaleMessage de="Preis- & Bestandsprüfung: vor 2 Min. aktualisiert" en="Price & stock check: updated 2 min ago" tr="Otomatik Fiyat/Stok Kontrolü: 2 dk önce güncellendi" /></span>
          </div>
        </div>
      </section>
    </div>
  );
}
