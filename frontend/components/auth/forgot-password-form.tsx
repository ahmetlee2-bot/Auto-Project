"use client";

import { FormEvent, useState } from "react";
import { createClient } from "../../lib/supabase/client";
import { useLocale } from "../../lib/locale";
import { translate } from "../../lib/messages";

export function ForgotPasswordForm() {
  const { locale } = useLocale();
  const [email, setEmail] = useState(""); const [notice, setNotice] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); setNotice(""); const { error: resetError } = await createClient().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` }); if (resetError) setError(resetError.message); else setNotice(locale === "de" ? "Wenn ein Konto existiert, wurde eine E-Mail zum Zurücksetzen gesendet." : locale === "en" ? "If an account exists, a password reset email has been sent." : "Hesap varsa, şifre sıfırlama e-postası gönderildi."); setBusy(false); }
  return <form className="authForm" onSubmit={submit}><label>{translate(locale, "E-Mail")}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label>{error ? <p className="authError">{error}</p> : null}{notice ? <p className="authNotice">{notice}</p> : null}<button className="primaryButton" disabled={busy}>{busy ? (locale === "de" ? "Wird gesendet …" : locale === "en" ? "Sending …" : "Gönderiliyor …") : (locale === "de" ? "Reset-E-Mail senden" : locale === "en" ? "Send reset email" : "Sıfırlama e-postası gönder")}</button></form>;
}
