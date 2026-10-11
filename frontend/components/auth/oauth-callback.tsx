"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "../../lib/supabase/client";
import { useLocale } from "../../lib/locale";

export function OAuthCallback({ code }: { code: string }) {
  const { locale } = useLocale();
  const started = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void createClient()
      .auth.getSession()
      .then(({ data, error: sessionError }) => {
        if (sessionError || !data.session) {
          console.error("[AutoLister OAuth] session not established", {
            name: sessionError?.name ?? "NoSession",
            code: sessionError?.code,
            message: sessionError?.message,
          });
          setError(locale === "de" ? "Google-Anmeldung fehlgeschlagen. Bitte versuche es erneut." : locale === "en" ? "Google sign-in failed. Please try again." : "Google ile giriş başarısız oldu. Lütfen tekrar dene.");
          return;
        }
        window.location.replace("/dashboard");
      })
      .catch(() => {
        setError(locale === "de" ? "Google-Anmeldung fehlgeschlagen. Bitte versuche es erneut." : locale === "en" ? "Google sign-in failed. Please try again." : "Google ile giriş başarısız oldu. Lütfen tekrar dene.");
      });
  }, [code]);

  return (
    <main className="authPage">
      <section className="authCard" aria-live="polite">
        <h1>{error ? (locale === "de" ? "Anmeldung fehlgeschlagen" : locale === "en" ? "Sign-in failed" : "Giriş başarısız") : (locale === "de" ? "Google-Anmeldung wird abgeschlossen" : locale === "en" ? "Completing Google sign-in" : "Google girişi tamamlanıyor")}</h1>
        <p>{error || (locale === "de" ? "Deine Sitzung wird sicher eingerichtet. Einen Moment bitte …" : locale === "en" ? "Your session is being set up securely. Please wait …" : "Oturumun güvenli şekilde ayarlanıyor. Lütfen bekle …")}</p>
        {error ? <a href="/login">{locale === "de" ? "Zur Anmeldung" : locale === "en" ? "Back to sign in" : "Girişe dön"}</a> : null}
      </section>
    </main>
  );
}
