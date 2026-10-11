"use client";

import { useEffect, useState } from "react";
import { useLocale } from "../../lib/locale";
import { translate } from "../../lib/messages";

const API = `${process.env.NEXT_PUBLIC_API_BASE_URL || "https://api.autolister-app.de"}/api/v1`;

export function VerifyEmailForm({ email }: { email: string }) {
  const { locale } = useLocale();
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
      throw new Error(result.error || (locale === "de" ? "Anfrage fehlgeschlagen." : locale === "en" ? "Request failed." : "İstek başarısız oldu."));
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
          : locale === "de" ? "Code konnte nicht geprüft werden." : locale === "en" ? "Could not verify the code." : "Kod doğrulanamadı.",
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
      setNotice(locale === "de" ? "Ein neuer Code wurde gesendet." : locale === "en" ? "A new code has been sent." : "Yeni kod gönderildi.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : locale === "de" ? "Code konnte nicht gesendet werden." : locale === "en" ? "Could not send the code." : "Kod gönderilemedi.",
      );
    }
  }
  return (
    <div className="verifyBox">
      <label>
        {translate(locale, "6-stelliger Bestätigungscode")}
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
        {busy ? (locale === "de" ? "Wird geprüft …" : locale === "en" ? "Verifying …" : "Doğrulanıyor …") : (locale === "de" ? "E-Mail bestätigen" : locale === "en" ? "Verify email" : "E-postayı doğrula")}
      </button>
      <button
        className="resendButton"
        type="button"
        disabled={busy || seconds > 0}
        onClick={() => void resend()}
      >
        {seconds > 0
          ? `${locale === "de" ? "Code erneut senden" : locale === "en" ? "Resend code" : "Kodu yeniden gönder"} (${seconds}s)`
          : locale === "de" ? "Code erneut senden" : locale === "en" ? "Resend code" : "Kodu yeniden gönder"}
      </button>
    </div>
  );
}
