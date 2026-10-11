"use client";

import { useLocale } from "../lib/locale";

export function LocaleMessage({ de, en, tr, as: Tag = "span", className }: { de: string; en: string; tr: string; as?: "span" | "p" | "strong"; className?: string }) {
  const { locale } = useLocale();
  const value = locale === "en" ? en : locale === "tr" ? tr : de;
  return <Tag className={className}>{value}</Tag>;
}
