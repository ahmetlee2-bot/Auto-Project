"use client";

import { LanguageSelector } from "./language-selector";
import { ThemeToggle } from "./theme-toggle";

export function HeaderPreferences() {
  return (
    <div className="headerPreferences">
      <LanguageSelector />
      <ThemeToggle />
    </div>
  );
}
