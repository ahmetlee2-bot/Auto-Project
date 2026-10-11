"use client";

import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { useState } from "react";
import { useLocale } from "../../lib/locale";

export function PricingSection() {
  const [annual, setAnnual] = useState(false);
  const { locale } = useLocale();
  const t = {
    kicker: locale === "de" ? "KLARE PAKETE, KLARE PERSPEKTIVE" : locale === "en" ? "CLEAR PLANS, ROOM TO GROW" : "NET PAKETLER, BÜYÜME ALANI",
    title: locale === "de" ? "Wähle den passenden Automatisierungsgrad." : locale === "en" ? "Choose the right level of automation." : "İhtiyacına uygun otomasyon seviyesini seç.",
    monthly: locale === "de" ? "Monatlich" : locale === "en" ? "Monthly" : "Aylık",
    annually: locale === "de" ? "Jährlich" : locale === "en" ? "Annual" : "Yıllık",
    discount: locale === "de" ? "25 % sparen" : locale === "en" ? "Save 25%" : "%25 indirim",
    popular: locale === "de" ? "AM BELIEBTESTEN" : locale === "en" ? "MOST POPULAR" : "EN POPÜLER",
    month: locale === "de" ? "/ Monat" : locale === "en" ? "/ month" : "/ ay",
    year: locale === "de" ? "jährlich abgerechnet" : locale === "en" ? "billed annually" : "yıllık faturalandırılır",
    start: locale === "de" ? "Paket wählen" : locale === "en" ? "Choose plan" : "Planı seç",
  };
  const currencyLocale = locale === "de" ? "de-DE" : locale === "tr" ? "tr-TR" : "en-IE";
  const plans = [
    { id: "starter", name: "Starter", price: 49, description: locale === "de" ? "Für den strukturierten Einstieg." : locale === "en" ? "For a focused start." : "Düzenli bir başlangıç için.", features: [locale === "de" ? "Automatisches Listing alle 12 Stunden · ca. 60 Produkte/Monat" : locale === "en" ? "Automatic listing every 12 hours · ~60 products/month" : "12 saatte bir otomatik ilan · ayda ~60 ürün", locale === "de" ? "1 Shop-Integration" : locale === "en" ? "1 store integration" : "1 mağaza entegrasyonu", locale === "de" ? "Grundlegende Preis- & Bestandskontrolle" : locale === "en" ? "Basic price & stock tracking" : "Temel fiyat ve stok takibi", locale === "de" ? "E-Mail-Support" : locale === "en" ? "Email support" : "E-posta desteği"] },
    { id: "pro", name: "Pro", price: 79, popular: true, description: locale === "de" ? "Für Shops mit regelmäßigem Volumen." : locale === "en" ? "For stores with steady volume." : "Düzenli hacimli mağazalar için.", features: [locale === "de" ? "Automatisches Listing alle 6 Stunden · ca. 120 Produkte/Monat" : locale === "en" ? "Automatic listing every 6 hours · ~120 products/month" : "6 saatte bir otomatik ilan · ayda ~120 ürün", locale === "de" ? "2 Shop-Integrationen" : locale === "en" ? "2 store integrations" : "2 mağaza entegrasyonu", locale === "de" ? "Sofortige Preis- & Bestandssynchronisierung" : locale === "en" ? "Real-time price & stock sync" : "Anlık fiyat ve stok eşitleme", locale === "de" ? "Automatische Trackingnummern-Übernahme" : locale === "en" ? "Automatic tracking number updates" : "Otomatik takip numarası aktarımı", locale === "de" ? "Priorisierter Support" : locale === "en" ? "Priority support" : "Öncelikli destek"] },
    { id: "turbo", name: "Turbo", price: 119, description: locale === "de" ? "Für ambitionierte Händler und mehrere Shops." : locale === "en" ? "For ambitious sellers and multiple stores." : "Birden fazla mağazası olan satıcılar için.", features: [locale === "de" ? "Turbo-Listing alle 2 Stunden · 250+ Produkte/Monat" : locale === "en" ? "Turbo listing every 2 hours · 250+ products/month" : "2 saatte bir turbo ilan · ayda 250+ ürün", locale === "de" ? "5 Shop-Integrationen" : locale === "en" ? "5 store integrations" : "5 mağaza entegrasyonu", locale === "de" ? "VIP-WhatsApp-Support" : locale === "en" ? "VIP WhatsApp support" : "VIP WhatsApp desteği", locale === "de" ? "Automatische Übersetzung in mehrere Sprachen" : locale === "en" ? "Automatic multilingual translation" : "Otomatik çoklu dil çevirisi", locale === "de" ? "Persönliche Einrichtungshilfe" : locale === "en" ? "One-to-one setup assistance" : "Birebir kurulum desteği"] },
  ];
  const money = new Intl.NumberFormat(currencyLocale, { style: "currency", currency: "EUR", maximumFractionDigits: annual ? 2 : 0 });

  return (
    <section id="preise" className="pricingSection conversionPricing" aria-labelledby="pricing-title">
      <div className="sectionWrap">
        <div className="sectionIntro conversionIntro">
          <span className="sectionKicker">{t.kicker}</span>
          <h2 id="pricing-title">{t.title}</h2>
        </div>
        <div className="billingSwitch" role="group" aria-label={locale === "de" ? "Abrechnungszeitraum" : locale === "en" ? "Billing period" : "Fatura dönemi"}>
          <button type="button" aria-pressed={!annual} className={!annual ? "active" : ""} onClick={() => setAnnual(false)}>{t.monthly}</button>
          <button type="button" aria-pressed={annual} className={annual ? "active" : ""} onClick={() => setAnnual(true)}>{t.annually}<span>{t.discount}</span></button>
        </div>
        <div className="pricingPlanGrid">
          {plans.map((plan) => {
            const monthlyPrice = annual ? plan.price * .75 : plan.price;
            return (
              <article className={`planCard${plan.popular ? " featuredPlan" : ""}`} key={plan.id}>
                {plan.popular ? <span className="popularPlanBadge"><Sparkles size={14} />{t.popular}</span> : null}
                <div className="planCardHeading"><h3>{plan.name}</h3><p>{plan.description}</p></div>
                <div className="planPrice"><strong>{money.format(monthlyPrice)}</strong><span>{t.month}</span></div>
                {annual ? <p className="annualBillingNote">{money.format(monthlyPrice * 12)} {locale === "de" ? "pro Jahr · " : locale === "en" ? "per year · " : "yılda · "}{t.year}</p> : <p className="annualBillingNote">&nbsp;</p>}
                <ul className="planFeatures">{plan.features.map((feature) => <li key={feature}><Check size={17} aria-hidden="true" /><span>{feature}</span></li>)}</ul>
                <Link className={plan.popular ? "primaryButton planCta" : "secondaryButton planCta"} href={`/register?plan=${plan.id}&billing=${annual ? "annual" : "monthly"}`}>{t.start}</Link>
              </article>
            );
          })}
        </div>
        <p className="pricingFootnote">{locale === "de" ? "Preise in Euro. Paketwahl startet die Registrierung; ein bestehender Checkout wird nicht vorgetäuscht." : locale === "en" ? "Prices in euros. Choosing a plan starts registration; no checkout is implied." : "Fiyatlar Euro cinsindendir. Plan seçimi kayıt akışını başlatır; mevcut olmayan bir ödeme adımı gösterilmez."}</p>
      </div>
    </section>
  );
}
