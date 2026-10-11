import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "../../components/auth/reset-password-form";
import { AuthShell } from "../../components/auth/auth-shell";
import { LocaleMessage } from "../../components/locale-message";
export const metadata: Metadata = { title: "Passwort festlegen", robots: { index: false, follow: false } };
export default function ResetPasswordPage() { return <AuthShell eyebrow="NEUES PASSWORT" title="Passwort festlegen" description="Wähle ein neues Passwort für dein AutoLister-Konto."><ResetPasswordForm /><p className="authHelper"><Link href="/login"><LocaleMessage de="← Zum Login" en="← Back to sign in" tr="← Girişe dön" /></Link></p></AuthShell>; }
