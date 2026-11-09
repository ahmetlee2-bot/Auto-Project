"use client";

import { useState } from "react";

const packages = [
  { id: "tier_50", name: "Starter", credits: 50, price: "8,50 €", unit: "0,17 € / Jeton" },
  { id: "tier_100", name: "Popular", credits: 100, price: "15,00 €", unit: "0,15 € / Jeton", featured: true },
  { id: "tier_250", name: "Pro", credits: 250, price: "32,50 €", unit: "0,13 € / Jeton" },
] as const;

export function TopUpCreditsModal({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState<string>("tier_100");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function checkout() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/wallet/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: selected }),
      });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || "Checkout konnte nicht gestartet werden.");
      window.location.assign(result.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout konnte nicht gestartet werden.");
      setBusy(false);
    }
  }

  return <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 1000, display: "grid", placeItems: "center", padding: 16, background: "rgba(3,8,20,.78)" }}>
    <section role="dialog" aria-modal="true" aria-labelledby="topupTitle" style={{ width: "min(680px, 100%)", border: "1px solid #334155", borderRadius: 18, padding: 24, background: "#0f172a", color: "#f8fafc", boxShadow: "0 24px 80px #0008" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }}><div><span className="proEyebrow">GUTHABEN</span><h2 id="topupTitle" style={{ margin: "8px 0" }}>Tracking-Credits aufladen</h2><p className="proMuted" style={{ marginTop: 0 }}>Ein Credit wird nur für eine erfolgreiche 3PL-Konvertierung verwendet.</p></div><button className="proButton" type="button" disabled={busy} onClick={onClose} aria-label="Schließen">×</button></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, margin: "20px 0" }}>
        {packages.map((item) => <button key={item.id} type="button" onClick={() => setSelected(item.id)} aria-pressed={selected === item.id} style={{ textAlign: "left", cursor: "pointer", borderRadius: 14, border: selected === item.id ? "2px solid #3b82f6" : "1px solid #334155", padding: 16, color: "#f8fafc", background: selected === item.id ? "#14264b" : "#111c31" }}><strong>{item.name}{"featured" in item && item.featured ? " · Beliebt" : ""}</strong><div style={{ fontSize: 22, fontWeight: 800, marginTop: 10 }}>{item.credits} Jetons</div><div style={{ marginTop: 6 }}>{item.price}</div><small style={{ color: "#94a3b8" }}>{item.unit}</small></button>)}
      </div>
      {error && <p className="proNotice proNoticeError" role="alert">{error}</p>}
      <div style={{ display: "flex", justifyContent: "end", gap: 10 }}><button className="proButton" type="button" disabled={busy} onClick={onClose}>Abbrechen</button><button className="proButton proButtonPrimary" type="button" disabled={busy} onClick={() => void checkout()}>{busy ? "Checkout wird geöffnet…" : "Jetzt aufladen"}</button></div>
    </section>
  </div>;
}
