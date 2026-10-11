import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "../../components/auth/auth-form";
import { AuthShell } from "../../components/auth/auth-shell";
import { LocaleMessage } from "../../components/locale-message";

export const metadata: Metadata = {
  title: { absolute: "Anmelden | AutoLister SaaS" },
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string }>;
}) {
  const verified = (await searchParams).verified === "1";
  return (
    <AuthShell
      eyebrow="WILLKOMMEN ZURÜCK"
      title="Bei AutoLister anmelden"
      description="Melde dich an und öffne dein Operations-Dashboard."
    >
      <div className="authModeTabs" aria-label="Kontozugang">
        <span className="active"><LocaleMessage de="Anmelden" en="Sign in" tr="Giriş yap" /></span>
        <Link href="/register"><LocaleMessage de="Konto erstellen" en="Create account" tr="Hesap oluştur" /></Link>
      </div>
      {verified ? (
        <p className="authNotice">
          <LocaleMessage de="E-Mail-Adresse bestätigt. Du kannst dich jetzt anmelden." en="Email confirmed. You can now sign in." tr="E-posta doğrulandı. Şimdi giriş yapabilirsin." />
        </p>
      ) : null}
      <AuthForm mode="login" />
      <p className="authHelper">
        <Link href="/forgot-password"><LocaleMessage de="Passwort vergessen?" en="Forgot your password?" tr="Şifreni mi unuttun?" /></Link>
      </p>
    </AuthShell>
  );
}
