import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type LeadLocale = "de" | "en" | "tr";
type StoreStatus = "none" | "one" | "multiple";

const allowedCountryCodes = new Set(["+49", "+90", "+1", "+44", "+33"]);
const allowedStoreStatuses = new Set<StoreStatus>(["none", "one", "multiple"]);
const allowedLocales = new Set<LeadLocale>(["de", "en", "tr"]);

const copy = {
  de: {
    invalid: "Bitte prüfe deine Angaben und versuche es erneut.",
    unavailable: "WhatsApp-Kontakt ist momentan nicht konfiguriert.",
    store: { none: "Noch kein Shop", one: "Ein aktiver Shop", multiple: "Mehrere Shops" },
    message: (name: string, phone: string, store: string, note: string) =>
      `Neue AutoLister-Anfrage\nName: ${name}\nTelefon: ${phone}\nShop-Status: ${store}${note ? `\nFrage: ${note}` : ""}`,
  },
  en: {
    invalid: "Please check your details and try again.",
    unavailable: "WhatsApp contact is not configured right now.",
    store: { none: "No store yet", one: "One active store", multiple: "Multiple stores" },
    message: (name: string, phone: string, store: string, note: string) =>
      `New AutoLister request\nName: ${name}\nPhone: ${phone}\nStore status: ${store}${note ? `\nQuestion: ${note}` : ""}`,
  },
  tr: {
    invalid: "Bilgilerini kontrol edip tekrar dene.",
    unavailable: "WhatsApp iletişim numarası şu anda yapılandırılmamış.",
    store: { none: "Henüz mağaza yok", one: "Bir aktif mağaza", multiple: "Birden fazla mağaza" },
    message: (name: string, phone: string, store: string, note: string) =>
      `Yeni AutoLister talebi\nAd: ${name}\nTelefon: ${phone}\nMağaza durumu: ${store}${note ? `\nNot: ${note}` : ""}`,
  },
} satisfies Record<LeadLocale, {
  invalid: string;
  unavailable: string;
  store: Record<StoreStatus, string>;
  message: (name: string, phone: string, store: string, note: string) => string;
}>;

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: copy.en.invalid }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: copy.en.invalid }, { status: 400 });
  }

  const body = payload as Record<string, unknown>;
  const fullName = stringValue(body.fullName);
  const countryCode = stringValue(body.countryCode);
  const phoneInput = stringValue(body.phone);
  const storeStatus = stringValue(body.storeStatus) as StoreStatus;
  const note = stringValue(body.note);
  const locale = allowedLocales.has(body.locale as LeadLocale) ? body.locale as LeadLocale : "en";
  const strings = copy[locale];
  const phoneDigits = phoneInput.replace(/\D/g, "");

  if (
    fullName.length < 2 || fullName.length > 100 ||
    !allowedCountryCodes.has(countryCode) || phoneDigits.length < 6 || phoneDigits.length > 20 ||
    !allowedStoreStatuses.has(storeStatus) || note.length > 1000 || body.consent !== true
  ) {
    return NextResponse.json({ error: strings.invalid }, { status: 400 });
  }

  const destination = (process.env.WHATSAPP_LEAD_NUMBER ?? "").replace(/\D/g, "");
  if (destination.length < 8 || destination.length > 15) {
    return NextResponse.json({ error: strings.unavailable }, { status: 503 });
  }

  const fullPhone = `${countryCode}${phoneDigits}`;
  const message = strings.message(fullName, fullPhone, strings.store[storeStatus], note);
  const whatsappUrl = `https://wa.me/${destination}?text=${encodeURIComponent(message)}`;
  let notificationSent = false;
  const webhookValue = process.env.LEAD_WEBHOOK_URL;

  if (webhookValue) {
    try {
      const webhookUrl = new URL(webhookValue);
      if (webhookUrl.protocol !== "https:") throw new Error("Webhook must use HTTPS");
      const webhookResponse = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, phone: fullPhone, storeStatus, note, locale, receivedAt: new Date().toISOString() }),
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      notificationSent = webhookResponse.ok;
    } catch {
      // WhatsApp remains available when an optional notification webhook is down.
    }
  }

  return NextResponse.json({ whatsappUrl, notificationSent }, { status: 200 });
}
