import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "../../components/auth/reset-password-form";
import { AuthShell } from "../../components/auth/auth-shell";
export const metadata: Metadata = { title: "Passwort festlegen", robots: { index: false, follow: false } };
export default function ResetPasswordPage() { return <AuthShell eyebrow="NEUES PASSWORT" title="Passwort festlegen" description="Wähle ein neues Passwort für dein AutoLister-Konto."><ResetPasswordForm /><p className="authHelper"><Link href="/login">← Zum Login</Link></p></AuthShell>; }
