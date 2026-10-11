"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useLocale } from "../lib/locale";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const { locale } = useLocale();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";
  return (
    <button
      className="headerIconButton"
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark
        ? locale === "de" ? "Helles Design aktivieren" : locale === "en" ? "Switch to light theme" : "Açık temaya geç"
        : locale === "de" ? "Dunkles Design aktivieren" : locale === "en" ? "Switch to dark theme" : "Koyu temaya geç"}
      title={isDark
        ? locale === "de" ? "Helles Design" : locale === "en" ? "Light theme" : "Açık tema"
        : locale === "de" ? "Dunkles Design" : locale === "en" ? "Dark theme" : "Koyu tema"}
    >
      {isDark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
    </button>
  );
}
