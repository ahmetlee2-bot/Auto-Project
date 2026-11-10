"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ConnectResult = { authUrl?: string; authorizationUrl?: string; error?: string };
const marketplaces = [
  ["EBAY_DE", "🇩🇪 eBay DE"],
  ["EBAY_US", "🇺🇸 eBay US"],
  ["EBAY_GB", "🇬🇧 eBay GB"],
] as const;

function decodeCode(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

function parseCallback(value: string): { code?: string; state?: string } {
  const input = value.trim();
  if (/^https?:\/\//i.test(input)) {
    const url = new URL(input);
    return { code: url.searchParams.get("code") || undefined, state: url.searchParams.get("state") || undefined };
  }
  return { code: decodeCode(input) };
}

export function StoreConnectModal({
  open,
  onClose,
  marketplace = "EBAY_DE",
  onMarketplaceChange,
}: {
  open: boolean;
  onClose: () => void;
  marketplace?: string;
  onMarketplaceChange?: (marketplace: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [selectedMarketplace, setSelectedMarketplace] = useState(marketplace);
  const [callback, setCallback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [authUrl, setAuthUrl] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => setMounted(true), []);
  useEffect(() => setSelectedMarketplace(marketplace), [marketplace]);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  function changeMarketplace(value: string) {
    setSelectedMarketplace(value);
    onMarketplaceChange?.(value);
  }

  async function start() {
    // Open synchronously during the click so browser popup protection permits it.
    const popup = window.open("about:blank", "_blank", "width=1000,height=800");
    setBusy(true);
    setError("");
    setSuccess("");
    setAuthUrl("");
    try {
      const response = await fetch(`/api/ebay/stores/connect?marketplace=${encodeURIComponent(selectedMarketplace)}&json=true`, { cache: "no-store" });
      const body = await response.json() as ConnectResult;
      if (!response.ok) throw new Error(body.error || "Bağlantı başlatılamadı.");
      const url = body.authUrl || body.authorizationUrl || "";
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || !["auth.ebay.com", "auth.sandbox.ebay.com"].includes(parsed.hostname)) throw new Error("eBay adresi geçersiz.");
      setAuthUrl(parsed.toString());
      if (popup) popup.location.href = parsed.toString();
    } catch (cause) {
      popup?.close();
      setError(cause instanceof Error ? cause.message : "Bağlantı hatası.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const parsed = parseCallback(callback);
      if (!parsed.code) throw new Error("Metinde eBay onay kodu bulunamadı.");
      const response = await fetch("/api/ebay/oauth/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback, ...parsed }),
      });
      const body = await response.json() as { connected?: boolean; redirect?: string; error?: string };
      if (!response.ok || !body.connected) throw new Error(body.error || "Bağlantı tamamlanamadı.");
      setSuccess("✅ eBay mağazanız başarıyla bağlandı!");
      window.setTimeout(() => window.location.assign(body.redirect || "/dashboard?store_connection=connected"), 1100);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bağlantı hatası.");
    } finally {
      setBusy(false);
    }
  }

  async function copyAuthUrl() {
    try { await navigator.clipboard.writeText(authUrl); }
    catch { setError("Bağlantı adresi kopyalanamadı; bağlantıya sağ tıklayıp adresi kopyalayın."); }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto storeConnectOverlay"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section className="proPanel storeConnectDialog max-w-lg w-full max-h-[88vh] flex flex-col" role="dialog" aria-modal="true" aria-labelledby="store-connect-title">
        <header className="storeConnectHeader">
          <div className="storeConnectHeaderTitle">
            <h2 id="store-connect-title">eBay Mağazası Bağla</h2>
            <label className="srOnly" htmlFor="store-connect-marketplace">eBay pazaryeri</label>
            <select id="store-connect-marketplace" value={selectedMarketplace} onChange={(event) => changeMarketplace(event.target.value)}>
              {marketplaces.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </div>
          <button type="button" className="storeConnectClose" onClick={onClose} aria-label="Kapat">✕</button>
        </header>

        <div className="storeConnectBody">
          <section className="storeConnectCompactStep">
            <div className="storeConnectCompactTitle"><span>1</span><h3>1. Adım · Tek Tıkla Yetkilendir</h3></div>
            <p>eBay resmi giriş ekranını açıp &apos;Agree and Continue&apos; ile izin verin.</p>
            <button type="button" className="proButton proButtonPrimary storeConnectPrimary" disabled={busy} onClick={() => void start()}>
              {busy ? "eBay sayfası hazırlanıyor…" : "🔗 1. Adım: eBay İzin Sayfasını Yeni Sekmede Aç ↗"}
            </button>
            {authUrl && <div className="storeConnectFallbackLink">
              <a href={authUrl} target="_blank" rel="noreferrer">Yetkilendirme sayfasını aç ↗</a>
              <button type="button" className="proButton" onClick={() => void copyAuthUrl()}>Bağlantıyı kopyala</button>
            </div>}
          </section>

          <section className="storeConnectCompactStep">
            <div className="storeConnectCompactTitle"><span>2</span><h3>2. Adım · Onay Kodu / Link Yapıştır</h3></div>
            <p>Otomatik dönmezse veya <code>127.0.0.1</code> sayfası açılırsa, o sayfanın adres çubuğundaki linki aşağıya yapıştırın:</p>
            <input
              type="text"
              className="storeConnectCodeInput"
              value={callback}
              onChange={(event) => setCallback(event.target.value)}
              autoComplete="off"
              placeholder="http://127.0.0.1:3210/api/ebay/oauth/callback?state=...&code=..."
              aria-label="eBay callback bağlantısı veya onay kodu"
            />
            <button type="button" className="proButton proButtonPrimary storeConnectVerify" disabled={busy || !callback.trim()} onClick={() => void submit()}>
              {busy ? "İşleniyor…" : "Mağazayı Doğrula & Bağla"}
            </button>
          </section>
          {success && <p role="status" className="storeConnectSuccess">{success}</p>}
          {error && <p role="alert" className="proNotice proNoticeError">{error}</p>}
        </div>

        <footer className="storeConnectFooter">
          <span>Yetkilendirme eBay’in güvenli sayfasında tamamlanır.</span>
          <button type="button" className="storeConnectCancel" onClick={onClose}>Vazgeç / Kapat</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
