"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabase/client";
import { localeText, useLocale } from "../../lib/locale";

export function AuthNav() {
  const [email, setEmail] = useState<string | null>(null);
  const { locale } = useLocale();
  useEffect(() => { const supabase = createClient(); void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || null)); }, []);
  return email
    ? <Link className="primaryButton" href="/dashboard">{localeText(locale, { de: "Zum Dashboard", en: "Go to dashboard", tr: "Panele git" })} →</Link>
    : <span className="authNav">
        <Link className="quietButton" href="/login">{localeText(locale, { de: "Anmelden", en: "Log in", tr: "Giriş yap" })}</Link>
        <Link className="primaryButton" href="/register">{localeText(locale, { de: "Kostenlos registrieren", en: "Sign up free", tr: "Ücretsiz kayıt ol" })}</Link>
      </span>;
}
