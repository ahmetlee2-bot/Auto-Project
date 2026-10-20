"use client";

import { Cloud, Link2, PackageCheck, ShieldCheck } from "lucide-react";
import { useLocale } from "../../lib/locale";

const badges = [
  { icon: Link2, title: { de: "Offizielle eBay-API", en: "Official eBay API", tr: "Resmî eBay API'si" }, text: { de: "Die verbundenen Abläufe nutzen eBay-Schnittstellen.", en: "Connected workflows use eBay interfaces.", tr: "Bağlı iş akışları eBay arayüzlerini kullanır." } },
  { icon: PackageCheck, title: { de: "Tracking im Dashboard", en: "Tracking in your dashboard", tr: "Panelde takip bilgileri" }, text: { de: "Verfügbare Sendungsdaten zentral im Blick.", en: "See available shipment details in one place.", tr: "Mevcut gönderi bilgilerini tek yerde gör." } },
  { icon: ShieldCheck, title: { de: "Preise transparent", en: "Transparent pricing", tr: "Şeffaf fiyatlar" }, text: { de: "Monats- und Jahrespreise klar ausgewiesen.", en: "Monthly and annual prices shown clearly.", tr: "Aylık ve yıllık fiyatlar açıkça gösterilir." } },
  { icon: Cloud, title: { de: "Verschlüsselte Verbindung", en: "Encrypted connection", tr: "Şifreli bağlantı" }, text: { de: "Die Website wird über HTTPS übertragen.", en: "The website is served over HTTPS.", tr: "Web sitesi HTTPS üzerinden sunulur." } },
];

export function TrustBadges({ compact = false }: { compact?: boolean }) {
  const { locale } = useLocale();
  const items = compact ? badges.slice(0, 2) : badges;
  return <div className={`trustBadges${compact ? " trustBadgesCompact" : " sectionWrap"}`} aria-label={locale === "de" ? "Informationen zu AutoLister" : locale === "en" ? "About AutoLister" : "AutoLister hakkında"}>
    {items.map(({ icon: Icon, title, text }) => <article className="trustBadge" key={title.de}>
      <span className="trustBadgeIcon"><Icon size={18} aria-hidden="true" /></span>
      <div><strong>{title[locale]}</strong><p>{text[locale]}</p></div>
    </article>)}
  </div>;
}
