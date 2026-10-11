"use client";

import Link from "next/link";
import { ArrowRight, Check, Clock3, Image, Search, Sparkles, Type, WalletCards } from "lucide-react";
import { useState } from "react";
import { useLocale } from "../../lib/locale";

const minutesPerProduct = { research: 150, listing: 45, images: 60, monitoring: 30 };
const manualTotal = Object.values(minutesPerProduct).reduce((sum, value) => sum + value, 0);

export function ComparisonSection() {
  const [target, setTarget] = useState(6);
  const { locale } = useLocale();
  const t = {
    kicker: locale === "de" ? "ZEIT ZURÜCKGEWINNEN" : locale === "en" ? "RECLAIM YOUR TIME" : "ZAMANINI GERİ KAZAN",
    title: locale === "de" ? "Weniger klicken. Mehr wachsen." : locale === "en" ? "Less busywork. More growth." : "Daha az angarya. Daha fazla büyüme.",
    intro: locale === "de" ? "Wähle dein tägliches Ziel und vergleiche den Aufwand pro Tag." : locale === "en" ? "Choose your daily product target and compare the time it takes." : "Günlük ürün hedefini seç ve gereken zamanı karşılaştır.",
    target: locale === "de" ? "Tägliches Produktziel" : locale === "en" ? "Daily product target" : "Günlük ürün hedefi",
    products: locale === "de" ? "Produkte pro Tag" : locale === "en" ? "products per day" : "ürün / gün",
    manual: locale === "de" ? "Manuell erledigt" : locale === "en" ? "Done manually" : "Manuel işlem",
    auto: locale === "de" ? "Mit AutoLister" : locale === "en" ? "With AutoLister" : "AutoLister ile",
    research: locale === "de" ? "Produktrecherche" : locale === "en" ? "Product research" : "Ürün araştırması",
    writing: locale === "de" ? "Titel, SEO & Beschreibung" : locale === "en" ? "Title, SEO & description" : "Başlık, SEO ve açıklama",
    images: locale === "de" ? "Bilder bearbeiten & hochladen" : locale === "en" ? "Edit & upload images" : "Görselleri düzenle ve yükle",
    monitoring: locale === "de" ? "Preis- & Bestandskontrolle" : locale === "en" ? "Price & stock checks" : "Fiyat ve stok kontrolü",
    ai: locale === "de" ? "SEO & Listing mit einem Klick" : locale === "en" ? "One-click SEO & listing" : "Tek tıkla SEO ve ilan",
    sync: locale === "de" ? "Automatische Preis- & Bestandssynchronisierung" : locale === "en" ? "Automatic price & stock sync" : "Otomatik fiyat ve stok eşitleme",
    tracking: locale === "de" ? "Trackingnummern automatisch übernehmen" : locale === "en" ? "Automatic tracking number updates" : "Kargo takip numarasını otomatik aktar",
    hours: locale === "de" ? "Std." : locale === "en" ? "hr" : "sa",
    minutes: locale === "de" ? "Min." : locale === "en" ? "min" : "dk",
    perDay: locale === "de" ? "pro Tag" : locale === "en" ? "per day" : "günde",
    unsustainable: locale === "de" ? "Nicht nachhaltig" : locale === "en" ? "Unsustainable" : "Sürdürülemez",
    impossible: locale === "de" ? "Über einen vollen Arbeitstag" : locale === "en" ? "More than a full workday" : "Tam bir iş gününden fazla",
    saved: locale === "de" ? "Netto-Zeitersparnis pro Monat" : locale === "en" ? "Net time saved each month" : "Aylık net zaman tasarrufu",
    savedBody: locale === "de" ? "Diese Zeit kannst du in Wachstum und neue Shops investieren." : locale === "en" ? "Put that time into growing your business and opening new stores." : "Bu zamanı işini büyütmeye ve yeni mağazalar açmaya ayır.",
    cta: locale === "de" ? "Mit Automatisierung starten" : locale === "en" ? "Start automating" : "Otomasyona başla",
  };
  const dailyManualMinutes = target * manualTotal;
  const dailyAutomationMinutes = target;
  const monthlySavedHours = Math.round((dailyManualMinutes - dailyAutomationMinutes) * 22 / 60);
  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} ${t.minutes}`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours} ${t.hours} ${remainder} ${t.minutes}` : `${hours} ${t.hours}`;
  };

  return (
    <section className="sectionWrap conversionSection comparisonSection" aria-labelledby="comparison-title">
      <div className="sectionIntro conversionIntro">
        <span className="sectionKicker">{t.kicker}</span>
        <h2 id="comparison-title">{t.title}</h2>
        <p>{t.intro}</p>
      </div>
      <div className="comparisonControl">
        <label htmlFor="daily-product-target">{t.target}</label>
        <div className="comparisonSliderRow">
          <input id="daily-product-target" type="range" min="1" max="30" step="1" value={target} onChange={(event) => setTarget(Number(event.target.value))} />
          <output htmlFor="daily-product-target">{target} <span>{t.products}</span></output>
        </div>
        <div className="comparisonRangeLabels"><span>1</span><span>30</span></div>
      </div>
      <div className="comparisonGrid">
        <article className="comparisonCard manualComparison">
          <div className="comparisonCardTitle"><span className="comparisonIcon"><Clock3 size={19} /></span><div><p className="sectionEyebrow">{t.manual}</p><h3>{locale === "de" ? "Der manuelle Weg" : locale === "en" ? "The manual way" : "Manuel yöntem"}</h3></div></div>
          <ul className="comparisonTasks">
            <li><span><Search size={17} />{t.research}</span><b>2.5 {t.hours}</b></li>
            <li><span><Type size={17} />{t.writing}</span><b>45 {t.minutes}</b></li>
            <li><span><Image size={17} />{t.images}</span><b>1 {t.hours}</b></li>
            <li><span><WalletCards size={17} />{t.monitoring}</span><b>30 {t.minutes}</b></li>
          </ul>
          <div className="comparisonTotal"><span>{locale === "de" ? "Zeitaufwand" : locale === "en" ? "Time required" : "Gereken süre"}</span><strong>{formatDuration(dailyManualMinutes)} <small>{t.perDay}</small></strong></div>
          <p className="comparisonWarning"><span aria-hidden="true">!</span>{dailyManualMinutes >= 480 ? `${t.unsustainable} · ${t.impossible}` : locale === "de" ? "Jeder Arbeitsschritt kostet wertvolle Zeit." : locale === "en" ? "Every task takes valuable time." : "Her işlem değerli zamanını alır."}</p>
        </article>
        <article className="comparisonCard automatedComparison">
          <div className="comparisonCardTitle"><span className="comparisonIcon"><Sparkles size={19} /></span><div><p className="sectionEyebrow">{t.auto}</p><h3>AutoLister</h3></div></div>
          <ul className="comparisonTasks">
            <li><span><Sparkles size={17} />{t.ai}</span><b>~1 {t.minutes}</b></li>
            <li><span><Check size={17} />{t.sync}</span><b>0 {t.minutes}</b></li>
            <li><span><Check size={17} />{t.tracking}</span><b>0 {t.minutes}</b></li>
          </ul>
          <div className="comparisonTotal"><span>{locale === "de" ? "Deine Zeit" : locale === "en" ? "Your time" : "Senin zamanın"}</span><strong>{formatDuration(dailyAutomationMinutes)} <small>{t.perDay}</small></strong></div>
          <p className="comparisonSuccess"><Check size={16} />{locale === "de" ? "Der Server arbeitet weiter, auch wenn du offline bist." : locale === "en" ? "The server keeps working while you are offline." : "Çevrimdışıyken de sunucu çalışmaya devam eder."}</p>
        </article>
      </div>
      <div className="timeSavedBar">
        <div><span className="timeSavedIcon"><Clock3 size={20} /></span><div><strong>{t.saved}: ~{monthlySavedHours} {t.hours}</strong><p>{t.savedBody}</p></div></div>
        <Link className="primaryButton" href="/register">{t.cta}<ArrowRight size={17} aria-hidden="true" /></Link>
      </div>
    </section>
  );
}
