"use client";

import { useState, type FormEvent } from "react";

export default function TrackSearchPage() {
  const [number, setNumber] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = number.trim().toUpperCase();
    if (!/^(?:AQ[A-Z0-9]{6,20}DE|AL[A-Z0-9]{6,40}DE)$/.test(value)) {
      setError("Bitte geben Sie eine gültige Sendungsnummer ein (z. B. AQ…DE oder AL…DE).");
      return;
    }
    window.location.assign(`/track/${encodeURIComponent(value)}`);
  }

  return (
    <div className="aqPage">
      <header className="aqHeader">
        <div className="aqContainer aqHeaderInner">
          <div className="aqBrand">
            <div className="aqLogoBox">
              <span className="aqLogoIcon">A</span>
            </div>
            <div>
              <div className="aqBrandName">AQUILINE <span className="aqBrandSub">LOGISTICS</span></div>
              <div className="aqBrandTagline">International Parcel &amp; Express Network Germany</div>
            </div>
          </div>
          <div className="aqHeaderMeta">
            <span className="aqBadgeVerified">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Verifiziertes Tracking
            </span>
          </div>
        </div>
      </header>

      <main className="aqContainer aqMain">
        <section className="aqSearchCard">
          <div className="aqSearchHeader">
            <span className="aqStatusIndicator">SENDUNGSABFRAGE</span>
            <h1 className="aqSearchTitle">Sendung verfolgen</h1>
            <p className="aqSearchSub">
              Geben Sie Ihre Aquiline Sendungsnummer ein, um den aktuellen Status, Standort und Zustellzeitpunkt Ihrer Lieferung in Echtzeit abzurufen.
            </p>
          </div>

          <form onSubmit={submit} className="aqSearchForm">
            <div className="aqInputWrap">
              <svg className="aqSearchIcon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <input
                id="tracking-number"
                autoComplete="off"
                value={number}
                onChange={(e) => { setNumber(e.target.value); setError(""); }}
                placeholder="Sendungsnummer eingeben (z. B. AQ123456DE / AL...DE)"
                className="aqInput"
              />
              <button type="submit" className="aqBtn">Sendung suchen</button>
            </div>
            {error && <div className="aqErrorMsg">{error}</div>}
          </form>

          <div className="aqQuickHelp">
            <strong>Hinweis zur Sendungsnummer:</strong>
            <p>Die 10- bis 40-stellige Sendungsnummer finden Sie in Ihrer Versandbestätigung oder auf Ihrem elektronischen Lieferschein.</p>
          </div>
        </section>

        <section className="aqTrustBanner">
          <div className="aqTrustItem">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            <div>
              <strong>SSL 256-Bit Verschlüsselt</strong>
              <small>Sichere Datenübertragung direkt aus den Logistiksystemen</small>
            </div>
          </div>
          <div className="aqTrustItem">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            <div>
              <strong>Sendungsschutz Aktiv</strong>
              <small>Haftung und Versicherung nach CMR/HGB Gütertransport</small>
            </div>
          </div>
          <div className="aqTrustItem">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
            <div>
              <strong>Echtzeit-Synchronisation</strong>
              <small>Kontinuierliche Aktualisierung an jedem Fracht-Checkpoint</small>
            </div>
          </div>
        </section>
      </main>

      <footer className="aqFooter">
        <div className="aqContainer aqFooterInner">
          <div className="aqFooterCol">
            <strong>AQUILINE LOGISTICS INTERNATIONAL</strong>
            <p>Ihr verlässlicher Partner für grenzüberschreitenden und innerdeutschen Paketversand.</p>
          </div>
          <div className="aqFooterLinks">
            <span>Sendungsverfolgung</span>
            <span>Datenschutz</span>
            <span>Zustellbedingungen</span>
            <span>Impressum</span>
          </div>
        </div>
        <div className="aqContainer aqFooterBottom">
          <small>© {new Date().getFullYear()} Aquiline Logistics Services. Alle Rechte vorbehalten.</small>
        </div>
      </footer>

      <style>{aqSearchStyles}</style>
    </div>
  );
}

const aqSearchStyles = `
  .aqPage {
    min-height: 100vh;
    background: #f8fafc;
    color: #0f172a;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.5;
  }
  .aqContainer {
    max-width: 920px;
    margin: 0 auto;
    padding: 0 20px;
  }
  .aqHeader {
    background: #ffffff;
    border-bottom: 1px solid #e2e8f0;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .aqHeaderInner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 74px;
  }
  .aqBrand {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .aqLogoBox {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    background: linear-gradient(135deg, #1e40af, #2563eb);
    display: grid;
    place-items: center;
    box-shadow: 0 4px 10px rgba(37,99,235,0.25);
  }
  .aqLogoIcon {
    color: #ffffff;
    font-size: 24px;
    font-weight: 900;
  }
  .aqBrandName {
    font-size: 18px;
    font-weight: 800;
    color: #0f172a;
  }
  .aqBrandSub {
    color: #2563eb;
  }
  .aqBrandTagline {
    font-size: 11px;
    color: #64748b;
  }
  .aqBadgeVerified {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #ecfdf5;
    color: #059669;
    font-size: 12px;
    font-weight: 700;
    padding: 5px 10px;
    border-radius: 6px;
    border: 1px solid #a7f3d0;
  }
  .aqMain {
    padding: 40px 20px 48px;
  }
  .aqSearchCard {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 36px;
    box-shadow: 0 10px 25px -5px rgba(15,23,42,0.06);
    margin-bottom: 32px;
  }
  .aqStatusIndicator {
    display: inline-block;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.8px;
    padding: 4px 10px;
    border-radius: 20px;
    background: #eff6ff;
    color: #1d4ed8;
    margin-bottom: 12px;
  }
  .aqSearchTitle {
    font-size: 32px;
    font-weight: 800;
    color: #0f172a;
    margin: 0 0 8px;
  }
  .aqSearchSub {
    font-size: 14px;
    color: #475569;
    margin: 0 0 28px;
    max-width: 680px;
  }
  .aqSearchForm {
    margin-bottom: 24px;
  }
  .aqInputWrap {
    display: flex;
    align-items: center;
    position: relative;
    border: 2px solid #cbd5e1;
    border-radius: 12px;
    background: #ffffff;
    padding: 4px 6px 4px 14px;
    transition: border-color 0.2s ease;
  }
  .aqInputWrap:focus-within {
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37,99,235,0.15);
  }
  .aqSearchIcon {
    margin-right: 10px;
    flex-shrink: 0;
  }
  .aqInput {
    flex: 1;
    border: none;
    outline: none;
    font-size: 15px;
    color: #0f172a;
    font-family: inherit;
    padding: 10px 0;
  }
  .aqBtn {
    background: #2563eb;
    color: #ffffff;
    font-weight: 700;
    font-size: 14px;
    border: none;
    border-radius: 8px;
    padding: 12px 20px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s ease;
  }
  .aqBtn:hover {
    background: #1d4ed8;
  }
  .aqErrorMsg {
    margin-top: 10px;
    color: #dc2626;
    font-size: 13px;
    font-weight: 600;
  }
  .aqQuickHelp {
    background: #f8fafc;
    border-radius: 8px;
    padding: 14px 16px;
    font-size: 12px;
    color: #64748b;
    border: 1px solid #f1f5f9;
  }
  .aqQuickHelp strong {
    color: #334155;
    display: block;
    margin-bottom: 2px;
  }
  .aqTrustBanner {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 20px;
  }
  .aqTrustItem {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .aqTrustItem strong {
    display: block;
    font-size: 12px;
    font-weight: 700;
    color: #0f172a;
  }
  .aqTrustItem small {
    display: block;
    font-size: 11px;
    color: #64748b;
    margin-top: 2px;
  }
  .aqFooter {
    background: #ffffff;
    border-top: 1px solid #e2e8f0;
    padding: 36px 0 24px;
    font-size: 12px;
    color: #64748b;
  }
  .aqFooterInner {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    margin-bottom: 24px;
    flex-wrap: wrap;
  }
  .aqFooterCol strong {
    display: block;
    font-size: 13px;
    color: #0f172a;
    margin-bottom: 4px;
  }
  .aqFooterLinks {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }
  .aqFooterLinks span {
    color: #475569;
  }
  .aqFooterBottom {
    border-top: 1px solid #f1f5f9;
    padding-top: 16px;
    color: #94a3b8;
  }
  @media (max-width: 640px) {
    .aqTrustBanner {
      grid-template-columns: 1fr;
    }
    .aqInputWrap {
      flex-direction: column;
      align-items: stretch;
      padding: 10px;
    }
    .aqSearchIcon {
      display: none;
    }
    .aqBtn {
      margin-top: 8px;
    }
  }
`;
