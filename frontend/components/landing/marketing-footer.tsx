import Link from "next/link";
import { BrandMark } from "../brand-mark";
import { LocaleMessage } from "../locale-message";

export function MarketingFooter() {
  return (
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
            <Link href="/datenschutz"><LocaleMessage de="Datenschutz (DSGVO)" en="Privacy (GDPR)" tr="Gizlilik (GDPR)" /></Link>
            <Link href="/terms"><LocaleMessage de="AGB" en="Terms" tr="Kullanım koşulları" /></Link>
            <Link href="#whatsapp-lead"><LocaleMessage de="Kontakt" en="Contact" tr="İletişim" /></Link>
            <span className="footerPrecisionBadge">Made with precision in Germany 🇩🇪</span>
          </nav>
        </div>
      </div>
    </footer>
  );
}
