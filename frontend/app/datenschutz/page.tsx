import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "../../components/brand-mark";
import { legalIdentity } from "../../lib/legal";

export const dynamic = "force-dynamic";
export function generateMetadata(): Metadata {
  return {
    title: "Datenschutzerklärung",
    robots: { index: !legalIdentity().isExample, follow: true },
  };
}

export default function DatenschutzPage() {
  const legal = legalIdentity();
  return (
    <main className="legalPage">
      <BrandMark />
      <h1>Datenschutzerklärung</h1>
      {legal.isExample ? (
        <div className="legalNotice">
          <strong>Mustertext:</strong> Betreiberangaben und Verarbeitungsdetails
          müssen vor dem produktiven Einsatz mit den tatsächlichen Diensten und
          Verträgen abgeglichen werden.
        </div>
      ) : null}
      <section>
        <h2>1. Verantwortliche Stelle</h2>
        <p>
          {legal.company}
          <br />
          {legal.address}
          <br />
          Kontakt: {legal.email}
        </p>
      </section>
      <section>
        <h2>2. Welche Daten verarbeitet werden</h2>
        <p>
          Bei Registrierung und Anmeldung verarbeiten wir insbesondere Namen,
          E-Mail-Adresse, Kontoinformationen und technische Sitzungsdaten. Für
          die Nutzung von AutoLister können Produktdaten wie ASIN, Titel,
          Bilder, Preise, Lagerbestand, eBay-Angebotsdaten und Statusmeldungen
          verarbeitet werden.
        </p>
      </section>
      <section>
        <h2>3. Zwecke und Rechtsgrundlagen</h2>
        <p>
          Die Verarbeitung dient der Bereitstellung des Benutzerkontos und der
          angeforderten Import- und Listing-Funktionen (Art. 6 Abs. 1 lit. b
          DSGVO). Sicherheitsprotokolle und die Absicherung des Dienstes beruhen
          auf berechtigten Interessen (Art. 6 Abs. 1 lit. f DSGVO). Soweit eine
          Einwilligung erforderlich ist, erfolgt die Verarbeitung nach Art. 6
          Abs. 1 lit. a DSGVO.
        </p>
      </section>
      <section>
        <h2>4. Hosting und Dienstleister</h2>
        <p>
          Die Anwendung wird auf Hetzner Cloud Infrastruktur betrieben. Die
          Anmeldung verwendet Supabase Auth. Für verbundene eBay-Funktionen
          werden die dafür notwendigen Daten über die eBay API verarbeitet. Beim
          Aufruf externer Dienste gelten ergänzend deren Datenschutzhinweise.
          Eingesetzte Dienstleister und Verarbeitungsorte sind vor
          Veröffentlichung dieser Mustererklärung zu prüfen.
        </p>
      </section>
      <section>
        <h2>5. Speicherdauer</h2>
        <p>
          Personenbezogene Daten werden nur so lange gespeichert, wie es für die
          Bereitstellung des Dienstes oder gesetzliche Aufbewahrungspflichten
          erforderlich ist. Konkrete Aufbewahrungsfristen und Löschabläufe sind
          vom Betreiber zu ergänzen.
        </p>
      </section>
      <section>
        <h2>6. Cookies und lokale Speicherung</h2>
        <p>
          Für Anmeldung und Sitzungsverwaltung können technisch erforderliche
          Cookies oder vergleichbare lokale Speichermechanismen verwendet
          werden. Sie ermöglichen es, den angemeldeten Bereich sicher
          bereitzustellen.
        </p>
      </section>
      <section>
        <h2>7. Deine Rechte</h2>
        <p>
          Du hast nach Maßgabe der DSGVO Rechte auf Auskunft, Berichtigung,
          Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und
          Widerspruch. Eine erteilte Einwilligung kann jederzeit mit Wirkung für
          die Zukunft widerrufen werden. Du kannst dich zudem bei einer
          Datenschutzaufsichtsbehörde beschweren.
        </p>
      </section>
      <section>
        <h2>8. Sicherheit und Kontakt</h2>
        <p>
          Die Übertragung der Website erfolgt über HTTPS. Für
          Datenschutzanfragen erreichst du die verantwortliche Stelle unter{" "}
          {legal.email}.
        </p>
      </section>
      <p>Stand: September 2026</p>
      <p>
        <Link href="/">← Zur Startseite</Link>
      </p>
    </main>
  );
}
