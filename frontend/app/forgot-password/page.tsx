import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "../../components/auth/forgot-password-form";
import { AuthShell } from "../../components/auth/auth-shell";
export const metadata: Metadata = { title: "Passwort vergessen", robots: { index: false, follow: false } };
export default function ForgotPasswordPage() { return <AuthShell eyebrow="KONTO WIEDERHERSTELLEN" title="Passwort vergessen?" description="Gib deine E-Mail-Adresse ein. Wir senden dir einen sicheren Link."><ForgotPasswordForm /><p className="authHelper"><Link href="/login">← Zurück zum Login</Link></p></AuthShell>; }
