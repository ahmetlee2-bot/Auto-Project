"use client";

import { FormEvent, useState } from "react";
import { createClient } from "../../lib/supabase/client";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [fullName, setFullName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice(""); const supabase = createClient();
    const result = mode === "login" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName.trim() }, emailRedirectTo: `${window.location.origin}/dashboard` } });
    if (result.error) setError(result.error.message); else if (mode === "register" && !result.data.session) setNotice("Konto erstellt. Bitte bestätige deine E-Mail-Adresse."); else window.location.assign("/dashboard"); setBusy(false);
  }
  return <form className="authForm" onSubmit={submit}>{mode === "register" ? <label>Vor- und Nachname<input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={3} autoComplete="name" /></label> : null}<label>E-Mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label><label>Passwort<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>{error ? <p className="authError">{error}</p> : null}{notice ? <p className="authNotice">{notice}</p> : null}<button className="primaryButton" disabled={busy}>{busy ? "Bitte warten …" : mode === "login" ? "Einloggen" : "Kostenlos registrieren"}</button></form>;
}
