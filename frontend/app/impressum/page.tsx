import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "../../components/brand-mark";
import { legalIdentity } from "../../lib/legal";

export const dynamic = "force-dynamic";
export function generateMetadata(): Metadata {
  return {
    title: "Impressum",
    robots: { index: !legalIdentity().isExample, follow: true },
  };
}

export default function ImpressumPage() {
  const legal = legalIdentity();
  return (
    <main className="legalPage">
      <BrandMark />
      <h1>Impressum</h1>
      {legal.isExample ? (
        <div className="legalNotice">
          <strong>Musterangaben:</strong> Diese Seite enthält Platzhalter. Vor
          dem produktiven Einsatz müssen die Angaben durch die tatsächlichen
          Betreiberinformationen ersetzt werden.
        </div>
      ) : null}
      <section>
        <h2>Angaben gemäß § 5 DDG</h2>
        <p>
          {legal.company}
          <br />
          {legal.address}
        </p>
      </section>
      <section>
        <h2>Kontakt</h2>
        <p>
          E-Mail:{" "}
          {legal.isExample ? (
            legal.email
          ) : (
            <a href={`mailto:${legal.email}`}>{legal.email}</a>
          )}
        </p>
      </section>
      <section>
        <h2>Umsatzsteuer</h2>
        <p>
          Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz:{" "}
          {legal.vatId}
        </p>
      </section>
      <section>
        <h2>Verantwortlich für den Inhalt</h2>
        <p>
          {legal.company}
          <br />
          {legal.address}
        </p>
      </section>
      <p>
        <Link href="/">← Zur Startseite</Link>
      </p>
    </main>
  );
}
