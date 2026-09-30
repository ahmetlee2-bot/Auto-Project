"use client";

import { useEffect, useState } from "react";

const API = `${process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.autolister-app.de"}/api/v1`;

export function VerifyEmailForm({ email }: { email: string }) {
  const [code, setCode] = useState("");
  const [seconds, setSeconds] = useState(60);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = window.setInterval(
      () => setSeconds((value) => value - 1),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [seconds]);
  async function request(path: string, body: Record<string, string>) {
    const response = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success)
      throw new Error(result.error || "Anfrage fehlgeschlagen.");
    return result;
  }
  async function verify() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request("/auth/verify-otp", { email, code });
      window.location.assign("/login?verified=1");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Code konnte nicht geprüft werden.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    if (seconds > 0 || busy) return;
    setError("");
    try {
      await request("/auth/resend-otp", { email });
      setSeconds(60);
      setNotice("Ein neuer Code wurde gesendet.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Code konnte nicht gesendet werden.",
      );
    }
  }
  return (
    <div className="verifyBox">
      <label>
        6-stelliger Bestätigungscode
        <input
          className="otpInput"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(event) =>
            setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
          }
          placeholder="000000"
        />
      </label>
      {error ? <p className="authError">{error}</p> : null}
      {notice ? <p className="authNotice">{notice}</p> : null}
      <button
        className="primaryButton"
        type="button"
        disabled={busy || code.length !== 6}
        onClick={() => void verify()}
      >
        {busy ? "Wird geprüft …" : "E-Mail bestätigen"}
      </button>
      <button
        className="resendButton"
        type="button"
        disabled={busy || seconds > 0}
        onClick={() => void resend()}
      >
        {seconds > 0
          ? `Code erneut senden (${seconds}s)`
          : "Code erneut senden"}
      </button>
    </div>
  );
}
