"use client";

import { useEffect, useState } from "react";
import { useLocale } from "../lib/locale";
import { translate } from "../lib/messages";

const supportEmail = "contact.autolister@gmail.com";

export function ContactSupport({
  label = "Kontakt",
  className = "contactLink",
}: {
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { locale } = useLocale();

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(supportEmail);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      window.location.assign(`mailto:${supportEmail}`);
    }
  }

  return (
    <>
      <button className={className} type="button" onClick={() => setOpen(true)}>
        {label === "Kontakt" ? translate(locale, "Kontakt") : label}
      </button>
      {open ? (
        <div
          className="contactOverlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            className="contactDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-title"
          >
            <button
              className="contactClose"
              type="button"
        aria-label={translate(locale, "Schließen")}
              onClick={() => setOpen(false)}
            >
              ×
            </button>
            <span className="sectionKicker">{translate(locale, "WIR HELFEN GERNE")}</span>
            <h2 id="contact-title">{translate(locale, "Kontaktiere unser Support-Team")}</h2>
            <p>
              {translate(locale, "Schreib uns, wenn du Fragen zu AutoLister oder deinem Konto hast.")}
            </p>
            <div className="contactEmailRow">
              <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
              <button
                className="secondaryButton"
                type="button"
                onClick={() => void copyEmail()}
              >
                {copied ? translate(locale, "Kopiert ✓") : translate(locale, "E-Mail kopieren")}
              </button>
            </div>
            <p className="contactResponseNote">
              {translate(locale, "Wir antworten in der Regel innerhalb von 24 Stunden.")}
            </p>
            <span className="contactCopyFeedback" aria-live="polite">
              {copied ? translate(locale, "E-Mail-Adresse wurde kopiert.") : ""}
            </span>
          </section>
        </div>
      ) : null}
    </>
  );
}
