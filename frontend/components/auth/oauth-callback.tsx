"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "../../lib/supabase/client";

export function OAuthCallback({ code }: { code: string }) {
  const started = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void createClient()
      .auth.exchangeCodeForSession(code)
      .then(({ error: exchangeError }) => {
        if (exchangeError) {
          console.error("[AutoLister OAuth] code exchange failed", {
            name: exchangeError.name,
            code: exchangeError.code,
          });
          setError("Google-Anmeldung fehlgeschlagen. Bitte versuche es erneut.");
          return;
        }
        window.location.replace("/dashboard");
      })
      .catch((cause: unknown) => {
        console.error("[AutoLister OAuth] code exchange threw", {
          name: cause instanceof Error ? cause.name : "UnknownError",
        });
        setError("Google-Anmeldung fehlgeschlagen. Bitte versuche es erneut.");
      });
  }, [code]);

  return (
    <main className="authPage">
      <section className="authCard" aria-live="polite">
        <h1>{error ? "Anmeldung fehlgeschlagen" : "Google-Anmeldung wird abgeschlossen"}</h1>
        <p>{error || "Deine Sitzung wird sicher eingerichtet. Einen Moment bitte …"}</p>
        {error ? <a href="/login">Zur Anmeldung</a> : null}
      </section>
    </main>
  );
}
