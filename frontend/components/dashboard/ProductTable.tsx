"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ExternalLink, RefreshCw, SquarePen, Trash2 } from "lucide-react";
import type { TrackedProduct } from "../../lib/repricer/types";

type Listing = { listingId?: string; title?: string; price?: string; quantity?: number; imageUrls?: string[] };
const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export function ProductTable({ listings }: { listings: Listing[] }) {
  const [products, setProducts] = useState<TrackedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [margin, setMargin] = useState("20");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [amazonInput, setAmazonInput] = useState("");
  const [enrollMargin, setEnrollMargin] = useState("20");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/tracked-products", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Produkte konnten nicht geladen werden.");
      setProducts(body.products || []);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ladefehler."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const unmanaged = useMemo(() => {
    const ids = new Set(products.map((row) => row.ebay_item_id));
    return listings.filter((item) => item.listingId && !ids.has(item.listingId));
  }, [listings, products]);

  async function mutate(path: string, method: string, body?: object) {
    const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    return result;
  }
  async function action(id: string, work: () => Promise<void>) {
    setBusyId(id); setError(""); setNotice("");
    try { await work(); await load(); }
    catch (cause) { await load(); setError(cause instanceof Error ? cause.message : "Aktion fehlgeschlagen."); }
    finally { setBusyId(null); }
  }

  return (
    <div className="trackedProducts">
      <div className="trackedToolbar">
        <div><h3>Amazon ↔ eBay Produktüberwachung</h3><p>Aktuelle Einkaufspreise, Bestände und synchronisierte Angebote.</p></div>
        <button type="button" className="trackedButton" onClick={() => void load()}><RefreshCw size={16} /> Aktualisieren</button>
      </div>
      {error && <p className="trackedError" role="alert">{error}</p>}
      {notice && <p className="trackedNotice" role="status">{notice}</p>}
      {loading ? <p className="trackedEmpty">Produkte werden geladen …</p> : products.length === 0 ? <p className="trackedEmpty">Noch keine überwachten Produkte. Verbinde unten ein eBay-Angebot mit einer Amazon-ASIN.</p> : (
        <div className="trackedScroll"><table className="trackedTable">
          <thead><tr><th>Produkt</th><th>Quelle · Amazon</th><th>Ziel · eBay</th><th>Änderung & Status</th><th>Aktionen</th></tr></thead>
          <tbody>{products.map((product) => <tr key={product.id} className={product.active ? "" : "trackedPaused"}>
            <td><div className="trackedProductName">
              {product.image_url ? <img src={product.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="trackedNoImage">▧</span>}
              <div><strong>{product.title}</strong><small>ASIN {product.amazon_asin} · eBay {product.ebay_item_id}</small></div>
            </div></td>
            <td><strong>{product.amazon_price === null ? "—" : euro.format(Number(product.amazon_price))}</strong><div className="trackedMeta"><span className={`trackedBadge ${product.amazon_stock_status === true ? "stock" : product.amazon_stock_status === false ? "empty" : "unknown"}`}>{product.amazon_stock_status === true ? "Auf Lager" : product.amazon_stock_status === false ? "Ausverkauft" : "Ungeprüft"}</span><a href={product.amazon_url} target="_blank" rel="noopener noreferrer" aria-label={`Amazon öffnen: ${product.amazon_asin}`}><ExternalLink size={15} /></a></div></td>
            <td><strong>{product.ebay_price === null ? "—" : euro.format(Number(product.ebay_price))}</strong><div className="trackedMeta"><span>{product.ebay_quantity} Stück</span><a href={product.ebay_url} target="_blank" rel="noopener noreferrer" aria-label={`eBay öffnen: ${product.ebay_item_id}`}><ExternalLink size={15} /></a></div></td>
            <td><div className="trackedState"><span className={`trackedBadge ${!product.active ? "unknown" : product.sync_status === "out_of_stock" ? "empty" : product.sync_status === "error" ? "empty" : "stock"}`}>{!product.active ? "Pausiert" : product.sync_status === "out_of_stock" ? "Nicht vorrätig · Bestand 0" : product.sync_status === "error" ? "Fehler" : product.sync_status === "price_changed" ? "Preis synchronisiert" : "Synchronisiert"}</span>
              {product.amazon_price_delta !== null && Number(product.amazon_price_delta) !== 0 && <span className={`trackedDelta ${Number(product.amazon_price_delta) > 0 ? "up" : "down"}`}>{Number(product.amazon_price_delta) > 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}{Number(product.amazon_price_delta) > 0 ? "+" : ""}{euro.format(Number(product.amazon_price_delta))}</span>}
              <small>{product.last_checked_at ? `Geprüft ${new Date(product.last_checked_at).toLocaleString("de-DE")}` : "Noch nicht geprüft"}</small>
              {product.last_error && <small className="trackedRowError" title={product.last_error}>{product.last_error}</small>}</div></td>
            <td><div className="trackedActions">
              <button type="button" disabled={busyId !== null || !product.active} onClick={() => void action(product.id, async () => { await mutate(`/api/tracked-products/${product.id}/sync`, "POST"); setNotice("Amazon und eBay wurden geprüft."); })}><RefreshCw size={15} /> Jetzt synchronisieren</button>
              {editingId === product.id ? <form onSubmit={(event) => { event.preventDefault(); void action(product.id, async () => { await mutate(`/api/tracked-products/${product.id}`, "PATCH", { targetMarginPercent: Number(margin) }); setEditingId(null); setNotice("Marge gespeichert. Jetzt synchronisieren, um den Angebotspreis zu aktualisieren."); }); }}><label>Marge % <input type="number" min="0" max="300" step="0.01" value={margin} onChange={(event) => setMargin(event.target.value)} /></label><button type="submit" disabled={busyId !== null}>Speichern</button></form> : <button type="button" onClick={() => { setEditingId(product.id); setMargin(String(product.target_margin_percent)); }}><SquarePen size={15} /> Marge {Number(product.target_margin_percent)} %</button>}
              <button type="button" disabled={busyId !== null} onClick={() => void action(product.id, async () => { await mutate(`/api/tracked-products/${product.id}`, "PATCH", { active: !product.active }); setNotice(product.active ? "Überwachung pausiert." : "Überwachung aktiviert."); })}>{product.active ? "Überwachung pausieren" : "Fortsetzen"}</button>
              <button type="button" className="trackedDelete" disabled={busyId !== null} onClick={() => { if (window.confirm("Dieses Produkt aus der Überwachung löschen? Das eBay-Angebot bleibt bestehen.")) void action(product.id, async () => { await mutate(`/api/tracked-products/${product.id}`, "DELETE"); setNotice("Überwachung gelöscht."); }); }}><Trash2 size={15} /> Löschen</button>
            </div></td>
          </tr>)}</tbody>
        </table></div>
      )}
      {unmanaged.length > 0 && <div className="trackedUnmanaged"><h4>Weitere aktive eBay-Angebote</h4><p>Amazon-ASIN zuordnen, um Preis und Bestand zu überwachen.</p>{unmanaged.map((item) => <div className="trackedEnroll" key={item.listingId}>
        <span><strong>{item.title || item.listingId}</strong><small>Item ID {item.listingId}</small></span>
        {addingId === item.listingId ? <form onSubmit={(event) => { event.preventDefault(); void action(item.listingId!, async () => { await mutate("/api/tracked-products", "POST", { ebayItemId: item.listingId, amazonUrl: amazonInput, targetMarginPercent: Number(enrollMargin) }); setAddingId(null); setAmazonInput(""); setNotice("Produkt hinzugefügt. Erste Prüfung kann jetzt gestartet werden."); }); }}><input required aria-label="Amazon-ASIN oder URL" placeholder="Amazon.de-URL oder ASIN" value={amazonInput} onChange={(event) => setAmazonInput(event.target.value)} /><label>Marge % <input required type="number" min="0" max="300" step="0.01" value={enrollMargin} onChange={(event) => setEnrollMargin(event.target.value)} /></label><button type="submit" disabled={busyId !== null}>Überwachung starten</button></form> : <button type="button" onClick={() => { setAddingId(item.listingId!); setAmazonInput(""); }}>Amazon zuordnen</button>}
      </div>)}</div>}
    </div>
  );
}
