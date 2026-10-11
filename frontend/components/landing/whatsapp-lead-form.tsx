"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock3, LoaderCircle, LockKeyhole, MessageCircle, Zap } from "lucide-react";
import { useLocale } from "../../lib/locale";

type LeadResponse = { whatsappUrl?: string; notificationSent?: boolean; directFallback?: boolean; error?: string };

export function WhatsAppLeadForm({ fallbackNumber }: { fallbackNumber?: string }) {
  const { locale } = useLocale();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LeadResponse | null>(null);
  const [error, setError] = useState("");
  const [fullName, setFullName] = useState("");
  const [countryCode, setCountryCode] = useState("+49");
  const [phone, setPhone] = useState("");
  const [storeStatus, setStoreStatus] = useState("");
  const [note, setNote] = useState("");
  const t = {
    kicker: locale === "de" ? "PERSÖNLICH SPRECHEN" : locale === "en" ? "TALK TO A REAL PERSON" : "BİREBİR GÖRÜŞELİM",
    title: locale === "de" ? "Noch Fragen? Wir melden uns." : locale === "en" ? "Still have questions? We can help." : "Soruların mı var? Yardımcı olalım.",
    intro: locale === "de" ? "Hinterlasse deine Nummer. Wir melden uns über WhatsApp bei dir." : locale === "en" ? "Leave your number and we’ll get back to you on WhatsApp." : "Numaranı bırak, WhatsApp üzerinden sana ulaşalım.",
    name: locale === "de" ? "Vor- und Nachname" : locale === "en" ? "Full name" : "Ad soyad",
    phone: locale === "de" ? "WhatsApp-Nummer" : locale === "en" ? "WhatsApp number" : "WhatsApp numarası",
    store: locale === "de" ? "Wie ist dein Shop-Status?" : locale === "en" ? "What is your store status?" : "Mağaza durumun nedir?",
    choose: locale === "de" ? "Bitte auswählen" : locale === "en" ? "Select an option" : "Bir seçenek seç",
    noStore: locale === "de" ? "Ich habe noch keinen Shop" : locale === "en" ? "I don’t have a store yet" : "Henüz mağazam yok",
    oneStore: locale === "de" ? "Ich habe einen aktiven Shop" : locale === "en" ? "I have one active store" : "Aktif mağazam var",
    several: locale === "de" ? "Ich habe mehrere Shops" : locale === "en" ? "I have multiple stores" : "Birden fazla mağazam var",
    note: locale === "de" ? "Deine Frage (optional)" : locale === "en" ? "Your question (optional)" : "Sorun (isteğe bağlı)",
    notePlaceholder: locale === "de" ? "Wobei können wir helfen?" : locale === "en" ? "How can we help?" : "Nasıl yardımcı olabiliriz?",
    consent: locale === "de" ? "Ich stimme zu, dass AutoLister mich zur Beantwortung meiner Anfrage kontaktiert. Details stehen in der Datenschutzerklärung." : locale === "en" ? "I agree that AutoLister may contact me about my request. See the privacy notice for details." : "AutoLister'ın talebim hakkında benimle iletişime geçmesini kabul ediyorum. Ayrıntılar gizlilik bildiriminde.",
    submit: locale === "de" ? "WhatsApp-Rückruf anfragen" : locale === "en" ? "Request a WhatsApp follow-up" : "WhatsApp'tan dönüş iste",
    privacy: locale === "de" ? "Deine Angaben bleiben vertraulich." : locale === "en" ? "Your details are kept private." : "Bilgilerin gizli tutulur.",
    response: locale === "de" ? "Wir antworten in der Regel innerhalb von 15 Minuten." : locale === "en" ? "We usually reply within 15 minutes." : "Genellikle 15 dakika içinde yanıt veririz.",
    success: locale === "de" ? "Anfrage erhalten" : locale === "en" ? "Request received" : "Talebin alındı",
    successText: locale === "de" ? "Danke! Öffne WhatsApp und sende die vorbereitete Nachricht, damit wir deine Anfrage erhalten." : locale === "en" ? "Thanks! Open WhatsApp and send the prepared message so we receive your request." : "Teşekkürler! Talebinin bize ulaşması için WhatsApp'ı açıp hazırlanan mesajı gönder.",
    open: locale === "de" ? "WhatsApp öffnen und senden" : locale === "en" ? "Open WhatsApp and send" : "WhatsApp'ı aç ve gönder",
    another: locale === "de" ? "Weitere Anfrage senden" : locale === "en" ? "Send another request" : "Yeni talep gönder",
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: fullName.trim(), countryCode, phone: phone.trim(), storeStatus, note: note.trim(), locale, consent: true }),
        signal: AbortSignal.timeout(12000),
      });
      const body = await response.json() as LeadResponse;
      if (!response.ok || !body.whatsappUrl) throw new Error(body.error || (locale === "de" ? "Die Anfrage konnte nicht gesendet werden. Bitte versuche es später erneut." : locale === "en" ? "Your request could not be submitted. Please try again later." : "Talebin gönderilemedi. Lütfen daha sonra tekrar dene."));
      setResult(body);
    } catch (cause) {
      const directNumber = (fallbackNumber ?? "").replace(/\D/g, "");
      if (directNumber.length >= 8 && directNumber.length <= 15) {
        const storeLabel = storeStatus === "none" ? t.noStore : storeStatus === "one" ? t.oneStore : t.several;
        const message = locale === "de"
          ? `Neue AutoLister-Anfrage\nName: ${fullName.trim()}\nTelefon: ${countryCode}${phone.trim()}\nShop-Status: ${storeLabel}${note.trim() ? `\nFrage: ${note.trim()}` : ""}`
          : locale === "en"
            ? `New AutoLister request\nName: ${fullName.trim()}\nPhone: ${countryCode}${phone.trim()}\nStore status: ${storeLabel}${note.trim() ? `\nQuestion: ${note.trim()}` : ""}`
            : `Yeni AutoLister talebi\nAd: ${fullName.trim()}\nTelefon: ${countryCode}${phone.trim()}\nMağaza durumu: ${storeLabel}${note.trim() ? `\nNot: ${note.trim()}` : ""}`;
        setResult({ whatsappUrl: `https://wa.me/${directNumber}?text=${encodeURIComponent(message)}`, directFallback: true });
      } else {
        setError(cause instanceof Error ? cause.message : (locale === "de" ? "Verbindung fehlgeschlagen." : locale === "en" ? "Connection failed." : "Bağlantı kurulamadı."));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="whatsapp-lead" className="sectionWrap leadSection" aria-labelledby="lead-title">
      <div className="leadIntro">
        <span className="sectionKicker">{t.kicker}</span>
        <h2 id="lead-title">{t.title}</h2>
        <p>{t.intro}</p>
        <div className="leadTrustList"><span><LockKeyhole size={16} />{t.privacy}</span><span><Zap size={16} />{t.response}</span></div>
      </div>
      <div className="leadFormCard">
        {result ? (
          <div className="leadSuccess" role="status">
            <CheckCircle2 size={42} aria-hidden="true" />
            <h3>{t.success}</h3>
            <p>{t.successText}</p>
            <a className="primaryButton" href={result.whatsappUrl} target="_blank" rel="noopener noreferrer"><MessageCircle size={17} />{t.open}</a>
            <button className="leadReset" type="button" onClick={() => setResult(null)}>{t.another}</button>
          </div>
        ) : (
          <form className="leadForm" onSubmit={submit}>
            <label>{t.name}<input name="fullName" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} required minLength={2} maxLength={100} /></label>
            <label>{t.phone}<span className="leadPhoneRow"><select aria-label={locale === "de" ? "Landesvorwahl" : locale === "en" ? "Country calling code" : "Ülke kodu"} value={countryCode} onChange={(event) => setCountryCode(event.target.value)}><option value="+49">🇩🇪 +49</option><option value="+90">🇹🇷 +90</option><option value="+1">🇺🇸 +1</option><option value="+44">🇬🇧 +44</option><option value="+33">🇫🇷 +33</option></select><input name="phone" type="tel" autoComplete="tel-national" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required minLength={5} maxLength={24} placeholder="151 12345678" /></span></label>
            <label>{t.store}<select name="storeStatus" value={storeStatus} onChange={(event) => setStoreStatus(event.target.value)} required><option value="">{t.choose}</option><option value="none">{t.noStore}</option><option value="one">{t.oneStore}</option><option value="multiple">{t.several}</option></select></label>
            <label>{t.note}<textarea name="note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={3} placeholder={t.notePlaceholder} /></label>
            <label className="leadConsent"><input type="checkbox" required /><span>{t.consent} <Link href="/datenschutz" target="_blank">{locale === "de" ? "Datenschutz" : locale === "en" ? "Privacy policy" : "Gizlilik bildirimi"}</Link>.</span></label>
            {error ? <p className="leadError" role="alert">{error}</p> : null}
            <button className="primaryButton leadSubmit" type="submit" disabled={busy}>{busy ? <><LoaderCircle size={17} className="leadSpinner" />{locale === "de" ? "Wird gesendet …" : locale === "en" ? "Sending …" : "Gönderiliyor …"}</> : <><MessageCircle size={17} />{t.submit}</>}</button>
            <span className="leadResponseNote"><Clock3 size={14} />{t.response}</span>
          </form>
        )}
      </div>
    </section>
  );
}
