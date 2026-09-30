"use client";

import { FormEvent, useState } from "react";
import { createClient } from "../../lib/supabase/client";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (mode === "register") {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.autolister-app.de"}/api/v1/auth/register`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fullName: fullName.trim(),
              email: normalizedEmail,
              password,
            }),
          },
        );
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success)
          throw new Error(result.error || "Registrierung fehlgeschlagen.");
        window.location.assign(
          `/verify-email?email=${encodeURIComponent(normalizedEmail)}`,
        );
        return;
      }
      const result = await createClient().auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (result.error)
        throw new Error(
          result.error.message.includes("Email not confirmed")
            ? "Bitte bestätige zuerst deine E-Mail-Adresse."
            : result.error.message,
        );
      window.location.assign("/dashboard");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Anmeldung derzeit nicht verfügbar.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setError("");
    const { error: oauthError } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (oauthError) setError(oauthError.message);
  }
  return (
    <form className="authForm" onSubmit={submit}>
      {mode === "register" ? (
        <label>
          Vor- und Nachname
          <input
            type="text"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
            minLength={3}
            autoComplete="name"
          />
        </label>
      ) : null}
      <label>
        E-Mail-Adresse
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
        />
      </label>
      <label>
        Passwort
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={8}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
      </label>
      {error ? (
        <p className="authError" role="alert">
          {error}
        </p>
      ) : null}
      <button className="primaryButton" disabled={busy}>
        {busy
          ? "Bitte warten …"
          : mode === "login"
            ? "Anmelden"
            : "Konto erstellen"}
      </button>
      <span className="authDivider">oder</span>
      <button
        className="googleButton"
        type="button"
        disabled={busy}
        onClick={() => void google()}
      >
        Mit Google fortfahren
      </button>
    </form>
  );
}
