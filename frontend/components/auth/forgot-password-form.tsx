"use client";

import { FormEvent, useState } from "react";
import { createClient } from "../../lib/supabase/client";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState(""); const [notice, setNotice] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); setNotice(""); const { error: resetError } = await createClient().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` }); if (resetError) setError(resetError.message); else setNotice("Wenn ein Konto existiert, wurde eine E-Mail zum Zurücksetzen gesendet."); setBusy(false); }
  return <form className="authForm" onSubmit={submit}><label>E-Mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label>{error ? <p className="authError">{error}</p> : null}{notice ? <p className="authNotice">{notice}</p> : null}<button className="primaryButton" disabled={busy}>{busy ? "Wird gesendet …" : "Reset-E-Mail senden"}</button></form>;
}
