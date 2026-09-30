import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "../../components/auth/auth-form";
import { AuthShell } from "../../components/auth/auth-shell";

export const metadata: Metadata = {
  title: { absolute: "Konto erstellen | AutoLister SaaS" },
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return (
    <AuthShell
      eyebrow="KOSTENLOS STARTEN"
      title="Dein AutoLister-Konto"
      description="Erstelle dein Konto und bereite deine eBay-Abläufe an einem Ort vor."
    >
      <div className="authModeTabs" aria-label="Kontozugang">
        <Link href="/login">Anmelden</Link>
        <span className="active">Konto erstellen</span>
      </div>
      <AuthForm mode="register" />
      <p className="authHelper">
        Informationen findest du in den{" "}
        <Link href="/terms.html">Nutzungsbedingungen</Link> und der{" "}
        <Link href="/datenschutz">Datenschutzerklärung</Link>.
      </p>
    </AuthShell>
  );
}
