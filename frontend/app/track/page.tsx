"use client";

import { useState, type FormEvent } from "react";

export default function TrackSearchPage() {
  const [number, setNumber] = useState("");
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = number.trim().toUpperCase();
    if (!/^AL[A-F0-9]{32}DE$/.test(value)) { setError("Bitte geben Sie eine gültige Statusreferenz ein."); return; }
    window.location.assign(`/track/${encodeURIComponent(value)}`);
  }
  return <main className="trackingShell">
    <header className="trackingBrand"><span className="trackingMark">S</span><div><strong>Sendungsverfolgung</strong><small>Shipment Tracking</small></div></header>
    <section className="trackingCard"><span className="trackingEyebrow">LIEFERSTATUS</span><h1>Sendung verfolgen</h1><p>Geben Sie Ihre Statusreferenz ein, um den zuletzt erfassten Lieferstatus zu sehen.</p>
      <form onSubmit={submit} className="trackingSearch"><label htmlFor="tracking-number">Statusreferenz</label><input id="tracking-number" autoComplete="off" value={number} onChange={event => { setNumber(event.target.value); setError(""); }} placeholder="AL…DE" /><button type="submit">Status anzeigen</button>{error && <span role="alert">{error}</span>}</form>
      <small className="trackingNote">Diese Seite zeigt Lieferantenstatus und ist kein Paketdienst-Tracking.</small>
    </section>
    <footer>Aktualisiert, sobald neue Lieferanteninformationen vorliegen.</footer>
    <style>{trackingStyles}</style>
  </main>;
}

const trackingStyles = `
.trackingShell{min-height:100vh;background:linear-gradient(145deg,#f1f6fb,#e9eef6);color:#172338;padding:36px 18px;font-family:Arial, sans-serif}.trackingBrand{max-width:820px;margin:0 auto 32px;display:flex;gap:12px;align-items:center}.trackingMark{width:42px;height:42px;border-radius:13px;background:#1465d8;color:white;display:grid;place-items:center;font-weight:800}.trackingBrand strong,.trackingBrand small{display:block}.trackingBrand small{margin-top:3px;color:#728098}.trackingCard{max-width:820px;margin:auto;background:#fff;border:1px solid #dce4ee;border-radius:22px;padding:clamp(24px,5vw,48px);box-shadow:0 16px 48px #10294a12}.trackingEyebrow{font-size:12px;letter-spacing:.16em;color:#2673dc;font-weight:800}.trackingCard h1{font-size:clamp(28px,5vw,42px);margin:12px 0}.trackingCard p{color:#58677e;line-height:1.6}.trackingSearch{display:grid;gap:10px;margin-top:28px}.trackingSearch label{font-size:14px;font-weight:700}.trackingSearch input{height:52px;border:1px solid #cbd6e4;border-radius:10px;padding:0 14px;font:inherit}.trackingSearch button{height:50px;border:0;border-radius:10px;background:#1465d8;color:#fff;font-weight:700;font-size:15px;cursor:pointer}.trackingSearch span{color:#b42318}.trackingNote{display:block;margin-top:20px;color:#748198}.trackingShell footer{max-width:820px;margin:20px auto;color:#778399;font-size:13px}`;
