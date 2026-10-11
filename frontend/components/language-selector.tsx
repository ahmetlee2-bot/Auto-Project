"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Globe } from "lucide-react";
import { useLocale } from "../lib/locale";

const languages = [
  { code: "de", label: "Deutsch", short: "DE" },
  { code: "en", label: "English", short: "EN" },
  { code: "tr", label: "Türkçe", short: "TR" },
] as const;
type LanguageCode = (typeof languages)[number]["code"];

export function LanguageSelector() {
  const { locale: language, setLocale } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selectLanguage = (code: LanguageCode) => {
    setOpen(false);
    setLocale(code);
  };

  const selected = languages.find((item) => item.code === language) ?? languages[0];
  return (
    <div className="languageSelector" ref={rootRef}>
      <button
        className="languageTrigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${language === "de" ? "Sprache" : language === "en" ? "Language" : "Dil"}: ${selected.label}`}
        onClick={() => setOpen((value) => !value)}
      >
        <Globe size={16} aria-hidden="true" />
        <span>{selected.short}</span>
        <ChevronDown className={open ? "chevronOpen" : ""} size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="languageMenu" role="listbox" aria-label={language === "de" ? "Sprache auswählen" : language === "en" ? "Select language" : "Dil seçin"}>
          {languages.map((item) => (
            <button
              key={item.code}
              className="languageOption"
              type="button"
              role="option"
              aria-selected={item.code === language}
              onClick={() => selectLanguage(item.code)}
            >
              <span>{item.label}</span>
              {item.code === language && <Check size={16} aria-label={language === "de" ? "Ausgewählt" : language === "en" ? "Selected" : "Seçili"} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
