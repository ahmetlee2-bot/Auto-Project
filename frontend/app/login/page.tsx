import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "../../components/auth/auth-form";
import { AuthShell } from "../../components/auth/auth-shell";

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
        <span className="active">Anmelden</span>
        <Link href="/register">Konto erstellen</Link>
      </div>
      {verified ? (
        <p className="authNotice">
          E-Mail-Adresse bestätigt. Du kannst dich jetzt anmelden.
        </p>
      ) : null}
      <AuthForm mode="login" />
      <p className="authHelper">
        <Link href="/forgot-password">Passwort vergessen?</Link>
      </p>
    </AuthShell>
  );
}
