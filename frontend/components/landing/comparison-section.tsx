"use client";

import Link from "next/link";
import { ArrowRight, Check, Clock3, Image, Search, Sparkles, Type, WalletCards } from "lucide-react";
import { useState } from "react";
import { useLocale } from "../../lib/locale";

const minutesPerProduct = { research: 10, listing: 8, images: 7, monitoring: 5 };
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
    research: locale === "de" ? "Produktdaten & Varianten prüfen" : locale === "en" ? "Check product data & variants" : "Ürün verisi ve varyant kontrolü",
    writing: locale === "de" ? "Titel, SEO & Beschreibung" : locale === "en" ? "Title, SEO & description" : "Başlık, SEO ve açıklama",
    images: locale === "de" ? "Bilder bearbeiten & hochladen" : locale === "en" ? "Edit & upload images" : "Görselleri düzenle ve yükle",
    monitoring: locale === "de" ? "Preis- & Bestandskontrolle" : locale === "en" ? "Price & stock checks" : "Fiyat ve stok kontrolü",
    ai: locale === "de" ? "SEO, Cover & Listing mit einem Klick" : locale === "en" ? "One-click SEO, cover & listing" : "Tek tıkla SEO, kapak ve ilan",
    sync: locale === "de" ? "Automatische Preis- & Bestandssynchronisierung" : locale === "en" ? "Automatic price & stock sync" : "Otomatik fiyat ve stok eşitleme",
    tracking: locale === "de" ? "Laufende Überwachung in der Cloud" : locale === "en" ? "Continuous cloud monitoring" : "Bulutta kesintisiz izleme",
    hours: locale === "de" ? "Std." : locale === "en" ? "hr" : "sa",
    minutes: locale === "de" ? "Min." : locale === "en" ? "min" : "dk",
    perDay: locale === "de" ? "pro Tag" : locale === "en" ? "per day" : "günde",
    unsustainable: locale === "de" ? "Kaum skalierbar" : locale === "en" ? "Hard to scale" : "Ölçeklenmesi zor",
    impossible: locale === "de" ? "Über einen halben Arbeitstag nur für Routine" : locale === "en" ? "Over half a workday on routine tasks" : "Rutin işler için yarım iş gününden fazla",
    saved: locale === "de" ? "Netto-Zeitersparnis pro Monat" : locale === "en" ? "Net time saved each month" : "Aylık net zaman tasarrufu",
    savedBody: locale === "de" ? "Bei 22 Arbeitstagen pro Monat — Zeit, die direkt in Produktsuche und Umsatz fließt." : locale === "en" ? "Across 22 workdays per month — time you can invest directly into sourcing and growth." : "Ayda 22 iş günü üzerinden — doğrudan ürün bulmaya ve büyümeye ayırabileceğin süre.",
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
          <div className="comparisonCardTitle"><span className="comparisonIcon"><Clock3 size={19} /></span><div><p className="sectionEyebrow">{t.manual}</p><h3>{locale === "de" ? "Der manuelle Weg (~30 Min. / Produkt)" : locale === "en" ? "The manual way (~30 min / product)" : "Manuel yöntem (~30 dk / ürün)"}</h3></div></div>
          <ul className="comparisonTasks">
            <li><span><Search size={17} />{t.research}</span><b>{minutesPerProduct.research} {t.minutes}</b></li>
            <li><span><Type size={17} />{t.writing}</span><b>{minutesPerProduct.listing} {t.minutes}</b></li>
            <li><span><Image size={17} />{t.images}</span><b>{minutesPerProduct.images} {t.minutes}</b></li>
            <li><span><WalletCards size={17} />{t.monitoring}</span><b>{minutesPerProduct.monitoring} {t.minutes}</b></li>
          </ul>
          <div className="comparisonTotal"><span>{locale === "de" ? "Zeitaufwand" : locale === "en" ? "Time required" : "Gereken süre"}</span><strong>{formatDuration(dailyManualMinutes)} <small>{t.perDay}</small></strong></div>
          <p className="comparisonWarning"><span aria-hidden="true">!</span>{dailyManualMinutes >= 240 ? `${t.unsustainable} · ${t.impossible}` : locale === "de" ? "Jeder manuelle Schritt bremst dein tägliches Listing-Volumen." : locale === "en" ? "Every manual step slows down your daily listing volume." : "Her manuel adım günlük listeleme hacmini yavaşlatır."}</p>
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
