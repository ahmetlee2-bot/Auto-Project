"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Locale = "de" | "en" | "tr";
export const LOCALE_COOKIE = "autolister-language";
const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void } | null>(null);

export function LocaleProvider({ children, initialLocale = "de" }: { children: React.ReactNode; initialLocale?: Locale }) {
  const [locale, setValue] = useState<Locale>(initialLocale);
  useEffect(() => {
    const saved = window.localStorage.getItem(LOCALE_COOKIE);
    if (saved === "de" || saved === "en" || saved === "tr") setValue(saved);
  }, []);
  const setLocale = (next: Locale) => {
    setValue(next);
    window.localStorage.setItem(LOCALE_COOKIE, next);
    document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.documentElement.lang = next;
    window.dispatchEvent(new CustomEvent("autolister:locale-change", { detail: { locale: next } }));
  };
  const value = useMemo(() => ({ locale, setLocale }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used within LocaleProvider");
  return context;
}

export function localeText(locale: Locale, values: Record<Locale, string>) {
  return values[locale];
}
