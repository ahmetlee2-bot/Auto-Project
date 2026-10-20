"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useStores } from "../../lib/ebay/StoreContext";

type PoolProduct = {
  id: string; asin: string; source_marketplace: string; title: string; description: string; brand: string | null;
  category_id: string | null; amazon_price: number; suggested_ebay_price: number | null; estimated_profit: number | null;
  estimated_shipping: number; images: string[]; stock_status: string; condition: string; is_vero_safe: boolean; is_published: boolean;
  is_demo: boolean;
};
type DepotResponse = { products: PoolProduct[]; categories: string[]; canImport: boolean; error?: string };

const money = (value: number | null | undefined, currency: string) => value === null || value === undefined
  ? "—"
  : new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(Number(value));

export function ProductDepot() {
  const { stores, selectedStoreId } = useStores();
  const [products, setProducts] = useState<PoolProduct[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [canImport, setCanImport] = useState(false);
  const [marketplace, setMarketplace] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [maxPrice, setMaxPrice] = useState("");
  const [minProfit, setMinProfit] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [manualStoreIds, setManualStoreIds] = useState<string[]>([]);
  const [importJson, setImportJson] = useState("");
  const [importMarketplace, setImportMarketplace] = useState("AMZ_DE");
  const [review, setReview] = useState<Record<string, { categoryId: string; isVeroSafe: boolean }>>({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (marketplace !== "ALL") params.set("marketplace", marketplace);
    if (category !== "ALL") params.set("category", category);
    if (maxPrice) params.set("maxPrice", maxPrice);
    if (minProfit) params.set("minProfit", minProfit);
    return params.toString();
  }, [marketplace, category, maxPrice, minProfit]);

  const loadProducts = useCallback(async () => {
    setError("");
    const params = new URLSearchParams(query);
    params.set("includeReview", "1");
    const response = await fetch(`/api/depot?${params}`, { cache: "no-store" });
    const body = await response.json() as DepotResponse;
    if (!response.ok) throw new Error(body.error || "Produktdepot konnte nicht geladen werden.");
    setProducts(body.products || []);
    setCategories(body.categories || []);
    setCanImport(body.canImport === true);
    setReview((current) => Object.fromEntries((body.products || []).map((product) => [product.id, current[product.id] || { categoryId: product.category_id || "", isVeroSafe: product.is_vero_safe }])));
    setSelected((current) => current.filter((id) => (body.products || []).some((product) => product.id === id)));
  }, [query]);

  useEffect(() => { void loadProducts().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Produktdepot konnte nicht geladen werden.")); }, [loadProducts]);

  const activeStores = stores.filter((store) => store.status === "active");
  const chosenStores = selectedStoreId === "ALL_STORES"
    ? (manualStoreIds.length ? manualStoreIds : activeStores.map((store) => store.id))
    : [selectedStoreId];
  const currenciesByMarket: Record<string, string> = { AMZ_US: "USD", AMZ_DE: "EUR" };

  const enqueue = async (productIds: string[]) => {
    if (!chosenStores.length) { setError("Verbinden Sie zuerst einen aktiven eBay-Shop."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storeIds: chosenStores, productIds }) });
      const body = await response.json() as { queued?: Array<{ asin: string }>; skipped?: Array<{ reason: string }>; error?: string };
      if (!response.ok) throw new Error(body.error || "Die Produkte konnten nicht eingereiht werden.");
      const skipSummary = body.skipped?.length ? ` ${body.skipped.length} Einträge übersprungen: ${body.skipped.slice(0, 3).map((item) => item.reason).join("; ")}${body.skipped.length > 3 ? " …" : ""}` : "";
      setNotice(`${body.queued?.length || 0} Produkte wurden in die Shop-Warteschlange aufgenommen.${skipSummary}`);
      setSelected([]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Die Produkte konnten nicht eingereiht werden."); }
    finally { setBusy(false); }
  };

  const importProducts = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      let payload: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(importJson);
        if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) payload = { asins: parsed, sourceMarketplace: importMarketplace };
        else if (Array.isArray(parsed)) payload = { products: parsed };
        else if (typeof parsed === "object" && parsed !== null && "products" in parsed) payload = parsed as Record<string, unknown>;
        else if (typeof parsed === "object" && parsed !== null && "asins" in parsed) payload = parsed as Record<string, unknown>;
        else if (typeof parsed === "string") payload = { asins: parsed, sourceMarketplace: importMarketplace };
        else throw new Error("Das JSON muss eine Produktliste oder ein ASIN-Objekt enthalten.");
      } catch (parseError) {
        if (parseError instanceof SyntaxError) payload = { asins: importJson.split(/[\s,;]+/), sourceMarketplace: importMarketplace };
        else throw parseError;
      }
      const response = await fetch("/api/depot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json() as { imported?: number; failed?: Array<{ asin: string; error: string }>; requiresReview?: boolean; error?: string };
      if (!response.ok) throw new Error(body.error || "Der Import ist fehlgeschlagen.");
      setNotice(`${body.imported || 0} Produkte zum Depot hinzugefügt.${body.requiresReview ? " Daten aus Rainforest oder dem direkten Amazon-Seitenparser. Titel, Bilder, Preis, Kategorie und Nutzungsrechte müssen vor einer Freigabe geprüft werden." : ""}${body.failed?.length ? ` Nicht abgerufen: ${body.failed.map((item) => `${item.asin} (${item.error})`).join("; ")}` : ""}`);
      setImportJson("");
      await loadProducts();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Der Import ist fehlgeschlagen."); }
    finally { setBusy(false); }
  };

  const reviewProduct = async (product: PoolProduct, publish = true) => {
    const draft = review[product.id] || { categoryId: product.category_id || "", isVeroSafe: product.is_vero_safe };
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/depot", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: product.id, categoryId: draft.categoryId, isVeroSafe: draft.isVeroSafe, isPublished: publish }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Das Produkt konnte nicht freigegeben werden.");
      setNotice(publish ? `${product.asin} wurde im Produktdepot freigegeben.` : `${product.asin} wurde aus dem öffentlichen Produktdepot entfernt.`);
      await loadProducts();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Das Produkt konnte nicht freigegeben werden."); }
    finally { setBusy(false); }
  };

  return (
    <main className="proWorkspace">
      <div className="proPageHeading"><div><span className="proEyebrow">Produktauswahl</span><h1>Curated Product Depot</h1><p>Prüfen Sie Produktdaten, Kategorie und Nutzungsrechte. Ausgewählte Produkte werden unter Beachtung der Shop-Limits in die Listing-Warteschlange aufgenommen.</p></div></div>
      <section className="proPanel">
        <div className="proToolbar">
          <div className="proToolbarControls">
            <label className="proLabel">Marktplatz<select className="proSelect" value={marketplace} onChange={(event) => setMarketplace(event.target.value)}><option value="ALL">Alle Märkte</option><option value="AMZ_DE">Amazon DE</option><option value="AMZ_US">Amazon US</option></select></label>
            <label className="proLabel">eBay-Kategorie<select className="proSelect" value={category} onChange={(event) => setCategory(event.target.value)}><option value="ALL">Alle Kategorien</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="proLabel">Max. Einkaufspreis<input className="proInput" type="number" min="0" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} /></label>
            <label className="proLabel">Mindestgewinn (€)<input className="proInput" type="number" min="0" value={minProfit} onChange={(event) => setMinProfit(event.target.value)} /></label>
          </div>
          <button className="proButton" type="button" onClick={() => void loadProducts().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Aktualisieren fehlgeschlagen."))}>Aktualisieren</button>
        </div>
        {selectedStoreId === "ALL_STORES" && activeStores.length > 0 && <fieldset className="proStoreTargets"><legend>Ziel-Shops (ohne Auswahl werden alle aktiven Shops verwendet)</legend>{activeStores.map((store) => <label className="proCheckbox" key={store.id}><input type="checkbox" checked={manualStoreIds.includes(store.id)} onChange={(event) => setManualStoreIds((current) => event.target.checked ? [...current, store.id] : current.filter((id) => id !== store.id))} />{store.marketplace_id.replace("EBAY_", "")} · {store.store_name}</label>)}</fieldset>}
        {canImport && <details className="proImport"><summary>Admin: Produkte per ASIN oder JSON importieren</summary><p className="proMuted">ASIN-Import nutzt Rainforest API, wenn konfiguriert, sonst den direkten Amazon.de/.com-Seitenparser. Amazon kann direkte Anfragen blockieren; Captchas werden nicht umgangen. ASIN-Importe bleiben bis zur Prüfung von Kategorie und Nutzungsrechten unveröffentlicht.</p><label className="proLabel">Amazon-Quelle<select className="proSelect" value={importMarketplace} onChange={(event) => setImportMarketplace(event.target.value)}><option value="AMZ_DE">Amazon Deutschland</option><option value="AMZ_US">Amazon USA</option></select></label><textarea className="proTextarea" value={importJson} onChange={(event) => setImportJson(event.target.value)} placeholder={'ASINs zeilenweise eingeben: B000000000\n\noder JSON: [{"asin":"B000000000","source_marketplace":"AMZ_DE","title":"Produktname","amazon_price":19.99,"images":["https://..."],"category_id":"eBay Kategorie-ID"}]'} /><button className="proButton proButtonPrimary" type="button" disabled={busy || !importJson.trim()} onClick={() => void importProducts()}>{busy ? "Daten werden abgerufen…" : "Produkte importieren"}</button></details>}
        {notice && <p className="proNotice" role="status">{notice}</p>}{error && <p className="proNotice proNoticeError" role="alert">{error}</p>}
        <label className="proCheckbox"><input type="checkbox" checked={products.some((product) => !product.is_demo) && selected.length === products.filter((product) => !product.is_demo).length} onChange={(event) => setSelected(event.target.checked ? products.filter((product) => !product.is_demo).map((product) => product.id) : [])} />Alle freigabefähigen Produkte auswählen</label>
        {selected.length > 0 && <div className="proBulkBar"><span>{selected.length} ausgewählt</span><button className="proButton proButtonPrimary" type="button" disabled={busy} onClick={() => void enqueue(selected)}>Auswahl zur Warteschlange hinzufügen</button></div>}
        <div className="proGrid">
          {products.map((product) => {
            const currency = currenciesByMarket[product.source_marketplace] || "EUR";
            return <article className="proCard" key={product.id}>
              <div className="proDepotImage">{product.images[0] ? <Image src={product.images[0]} alt="" width={220} height={160} unoptimized /> : <span>Kein Bild</span>}</div>
              <div className="proDepotTop"><label className="proCheckbox"><input type="checkbox" checked={selected.includes(product.id)} disabled={product.is_demo} onChange={(event) => setSelected((current) => event.target.checked ? [...current, product.id] : current.filter((id) => id !== product.id))} />Auswählen</label><span className="proTag proTagSuccess">{product.source_marketplace.replace("AMZ_", "Amazon ")}</span>{product.is_demo && <span className="proTag proTagWarn">DEMO · NICHT VERÖFFENTLICHEN</span>}</div>
              <h3>{product.title}</h3>
              <p className="proMuted">ASIN {product.asin}{product.category_id ? ` · Kategorie ${product.category_id}` : ""}</p>
              <div className="proDepotPrices"><span>Amazon <b>{money(product.amazon_price, currency)}</b></span><span>eBay-Vorschlag <b>{money(product.suggested_ebay_price, currency)}</b></span><span>Geschätzter Gewinn <b className="proProfit">{money(product.estimated_profit, currency)}</b></span><span>Bestand <b>{product.stock_status === "in_stock" ? "Verfügbar" : "Nicht verfügbar"}</b></span></div>
              <div className="proToolbarControls"><button className="proButton proButtonPrimary" type="button" disabled={busy || product.is_demo || product.stock_status !== "in_stock" || !product.is_published} onClick={() => void enqueue([product.id])}>In Warteschlange aufnehmen</button>{product.is_demo ? <span className="proMuted">Amazon-Link für Demo deaktiviert</span> : <a className="proButton" href={`https://www.amazon.${product.source_marketplace === "AMZ_US" ? "com" : "de"}/dp/${product.asin}`} target="_blank" rel="noreferrer">Bei Amazon öffnen ↗</a>}</div>
              {canImport && <div className="proPoolReview"><span className={`proTag ${product.is_published ? "proTagSuccess" : "proTagWarn"}`}>{product.is_published ? "Veröffentlicht" : product.is_demo ? "Demo-Daten · gesperrt" : "Prüfung erforderlich"}</span><label className="proLabel">eBay-Kategorie-ID<input className="proInput" disabled={product.is_demo} value={review[product.id]?.categoryId ?? product.category_id ?? ""} onChange={(event) => setReview((current) => ({ ...current, [product.id]: { categoryId: event.target.value, isVeroSafe: current[product.id]?.isVeroSafe ?? product.is_vero_safe } }))} /></label><label className="proCheckbox"><input type="checkbox" disabled={product.is_demo} checked={product.is_demo ? false : review[product.id]?.isVeroSafe ?? product.is_vero_safe} onChange={(event) => setReview((current) => ({ ...current, [product.id]: { categoryId: current[product.id]?.categoryId ?? product.category_id ?? "", isVeroSafe: event.target.checked } }))} />Nutzungsrechte geprüft und VERO-Risiko bewertet</label><div className="proToolbarControls"><button className="proButton" type="button" disabled={busy || product.is_demo || !review[product.id]?.isVeroSafe || !(review[product.id]?.categoryId || product.category_id)} onClick={() => void reviewProduct(product)}>{product.is_published ? "Freigabe aktualisieren" : "Prüfen und freigeben"}</button>{product.is_published && <button className="proButton proButtonDanger" type="button" disabled={busy} onClick={() => void reviewProduct(product, false)}>Veröffentlichung zurückziehen</button>}</div></div>}
            </article>;
          })}
        </div>
        {!products.length && <div className="proEmpty">Für diese Filter sind keine Produkte verfügbar.</div>}
      </section>
    </main>
  );
}
