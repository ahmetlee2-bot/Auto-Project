import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "../../components/auth/auth-form";
import { AuthShell } from "../../components/auth/auth-shell";
import { LocaleMessage } from "../../components/locale-message";

export const metadata: Metadata = {
  title: { absolute: "Konto erstellen | AutoLister SaaS" },
  robots: { index: false, follow: false },
};

const registrationPlans = {
  starter: { name: "Starter", price: 49 },
  pro: { name: "Pro", price: 79 },
  turbo: { name: "Turbo", price: 119 },
} as const;

export default async function RegisterPage({
  searchParams,
}: {
    searchParams: Promise<{ plan?: string; billing?: string }>;
  }) {
  const { plan: planId, billing } = await searchParams;
  const selectedPlan = planId && planId in registrationPlans
    ? registrationPlans[planId as keyof typeof registrationPlans]
    : null;
  const annualBilling = billing === "annual";
  const selectedMonthlyPrice = selectedPlan ? selectedPlan.price * (annualBilling ? 0.75 : 1) : 0;
  const priceLocale = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: annualBilling ? 2 : 0,
    maximumFractionDigits: 2,
  });

  return (
    <AuthShell
      eyebrow="KOSTENLOS STARTEN"
      title="Dein AutoLister-Konto"
      description="Erstelle dein Konto und bereite deine eBay-Abläufe an einem Ort vor."
    >
      <div className="authModeTabs" aria-label="Kontozugang">
        <Link href="/login"><LocaleMessage de="Anmelden" en="Sign in" tr="Giriş yap" /></Link>
        <span className="active"><LocaleMessage de="Konto erstellen" en="Create account" tr="Hesap oluştur" /></span>
      </div>
      {selectedPlan ? (
        <div className="selectedPlanNotice">
          <strong><LocaleMessage de="Ausgewählter Tarif" en="Selected plan" tr="Seçilen plan" />: {selectedPlan.name}</strong>
          <span>{priceLocale.format(selectedMonthlyPrice)} / <LocaleMessage de="Monat" en="month" tr="ay" /></span>
          {annualBilling ? <small>{priceLocale.format(selectedMonthlyPrice * 12)} · <LocaleMessage de="jährlich abgerechnet" en="billed annually" tr="yıllık faturalandırma" /></small> : null}
          <small><LocaleMessage de="Die Registrierung schließt kein kostenpflichtiges Abo ab." en="Creating an account does not start a paid subscription." tr="Hesap oluşturmak ücretli abonelik başlatmaz." /></small>
        </div>
      ) : null}
      <AuthForm mode="register" />
      <p className="authHelper">
        <LocaleMessage de="Informationen findest du in den" en="Read our" tr="Bilgi için" />{" "}
        <Link href="/terms"><LocaleMessage de="Nutzungsbedingungen" en="Terms of service" tr="Kullanım koşulları" /></Link> {" "}
        <LocaleMessage de="und der" en="and our" tr="ve" />{" "}
        <Link href="/datenschutz"><LocaleMessage de="Datenschutzerklärung" en="Privacy policy" tr="Gizlilik politikası" /></Link>.
      </p>
    </AuthShell>
  );
}
