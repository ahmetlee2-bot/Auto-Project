"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ExternalLink, RefreshCw, Settings2, Trash2 } from "lucide-react";
import { useLocale, type Locale } from "../../lib/locale";
import type { TrackedProduct } from "../../lib/repricer/types";

type Listing = { listingId?: string; title?: string; price?: string; quantity?: number; imageUrls?: string[] };
const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
type Settings = { margin: string; shipping: string; minimum: string; quantity: string };
const settingsOf = (p: TrackedProduct): Settings => ({ margin: String(p.target_margin_percent), shipping: String(p.estimated_shipping ?? 0), minimum: String(p.minimum_sale_price ?? 0), quantity: p.manual_quantity_override == null ? "" : String(p.manual_quantity_override) });

const copyByLocale: Record<Locale, {
  loadError: string;
  actionError: string;
  confirmBulkDelete: (count: number) => string;
  bulkFailed: (failed: number, total: number) => string;
  bulkDeleted: string;
  bulkActivated: string;
  heading: string;
  subheading: string;
  refresh: string;
  selectedCount: (count: number) => string;
  activateSelected: string;
  deleteSelected: string;
  clearSelection: string;
  loading: string;
  empty: string;
  selectAll: string;
  colProduct: string;
  colAmazon: string;
  colEbay: string;
  colStatus: string;
  colActions: string;
  inStock: string;
  outOfStock: string;
  unchecked: string;
  pieces: string;
  paused: string;
  outOfStockZero: string;
  errorStatus: string;
  priceSynced: string;
  synced: string;
  checkedAt: (date: string) => string;
  notCheckedYet: string;
  syncNow: string;
  syncDone: string;
  settings: string;
  pause: string;
  activate: string;
  pausedNotice: string;
  activatedNotice: string;
  confirmDelete: string;
  confirmEndEbay: string;
  deletedNotice: string;
  deleteLabel: string;
  modalEyebrow: string;
  closeLabel: string;
  syncPartialError: (err: string) => string;
  settingsSaved: string;
  targetMargin: string;
  shippingCost: string;
  minSalePrice: string;
  quantityOverride: string;
  cancel: string;
  saving: string;
  saveAndSync: string;
  unmanagedHeading: string;
  unmanagedSub: string;
  addedNotice: string;
  amazonPlaceholder: string;
  marginShort: string;
  startMonitoring: string;
  assignAmazon: string;
}> = {
  de: {
    loadError: "Produkte konnten nicht geladen werden.",
    actionError: "Aktion fehlgeschlagen.",
    confirmBulkDelete: (count) => `${count} Produkte aus der Überwachung löschen? eBay-Angebote bleiben bestehen.`,
    bulkFailed: (failed, total) => `${failed} von ${total} Aktionen konnten nicht ausgeführt werden.`,
    bulkDeleted: "Ausgewählte Produkte gelöscht.",
    bulkActivated: "Ausgewählte Produkte aktiviert.",
    heading: "Amazon ↔ eBay Produktüberwachung",
    subheading: "Aktuelle Einkaufspreise, Bestände und synchronisierte Angebote.",
    refresh: "Aktualisieren",
    selectedCount: (count) => `${count} ausgewählt`,
    activateSelected: "Ausgewählte aktivieren",
    deleteSelected: "Ausgewählte löschen",
    clearSelection: "Auswahl aufheben",
    loading: "Produkte werden geladen …",
    empty: "Noch keine überwachten Produkte. Verbinde unten ein eBay-Angebot mit einer Amazon-ASIN.",
    selectAll: "Alle Produkte auswählen",
    colProduct: "Produkt",
    colAmazon: "Quelle · Amazon",
    colEbay: "Ziel · eBay",
    colStatus: "Änderung & Status",
    colActions: "Aktionen",
    inStock: "Auf Lager",
    outOfStock: "Ausverkauft",
    unchecked: "Ungeprüft",
    pieces: "Stück",
    paused: "Pausiert",
    outOfStockZero: "Nicht vorrätig · Bestand 0",
    errorStatus: "Fehler",
    priceSynced: "Preis synchronisiert",
    synced: "Synchronisiert",
    checkedAt: (date) => `Geprüft ${date}`,
    notCheckedYet: "Noch nicht geprüft",
    syncNow: "Jetzt synchronisieren",
    syncDone: "Amazon und eBay wurden geprüft.",
    settings: "Einstellungen",
    pause: "Pausieren",
    activate: "Aktivieren",
    pausedNotice: "Überwachung pausiert.",
    activatedNotice: "Überwachung aktiviert.",
    confirmDelete: "Dieses Produkt aus der Überwachung entfernen?\n\nOK: Überwachung löschen. Abbrechen: Behalten.",
    confirmEndEbay: "Soll das eBay-Angebot ebenfalls beendet werden?",
    deletedNotice: "Überwachungseintrag gelöscht.",
    deleteLabel: "Löschen",
    modalEyebrow: "PRODUKTEINSTELLUNGEN",
    closeLabel: "Schließen",
    syncPartialError: (err) => `Einstellungen gespeichert, Synchronisierung fehlgeschlagen: ${err}`,
    settingsSaved: "Einstellungen gespeichert und neu synchronisiert.",
    targetMargin: "Zielmarge (%)",
    shippingCost: "Versandkosten (€)",
    minSalePrice: "Mindestverkaufspreis (€)",
    quantityOverride: "eBay-Bestand überschreiben (leer = automatisch)",
    cancel: "Abbrechen",
    saving: "Wird gespeichert …",
    saveAndSync: "Speichern & synchronisieren",
    unmanagedHeading: "Weitere aktive eBay-Angebote",
    unmanagedSub: "Amazon-ASIN zuordnen, um Preis und Bestand zu überwachen.",
    addedNotice: "Produkt hinzugefügt. Erste Prüfung kann jetzt gestartet werden.",
    amazonPlaceholder: "Amazon.de-URL oder ASIN",
    marginShort: "Marge %",
    startMonitoring: "Überwachung starten",
    assignAmazon: "Amazon zuordnen",
  },
  en: {
    loadError: "Products could not be loaded.",
    actionError: "Action failed.",
    confirmBulkDelete: (count) => `Remove ${count} products from monitoring? Active eBay listings will remain live.`,
    bulkFailed: (failed, total) => `${failed} of ${total} actions could not be completed.`,
    bulkDeleted: "Selected products removed.",
    bulkActivated: "Selected products activated.",
    heading: "Amazon ↔ eBay Product Monitoring",
    subheading: "Live source prices, stock levels, and synchronized listings.",
    refresh: "Refresh",
    selectedCount: (count) => `${count} selected`,
    activateSelected: "Activate selected",
    deleteSelected: "Delete selected",
    clearSelection: "Clear selection",
    loading: "Loading products …",
    empty: "No monitored products yet. Link an eBay listing with an Amazon ASIN below.",
    selectAll: "Select all products",
    colProduct: "Product",
    colAmazon: "Source · Amazon",
    colEbay: "Target · eBay",
    colStatus: "Change & Status",
    colActions: "Actions",
    inStock: "In stock",
    outOfStock: "Out of stock",
    unchecked: "Unchecked",
    pieces: "pcs",
    paused: "Paused",
    outOfStockZero: "Out of stock · Qty 0",
    errorStatus: "Error",
    priceSynced: "Price synced",
    synced: "Synchronized",
    checkedAt: (date) => `Checked ${date}`,
    notCheckedYet: "Not checked yet",
    syncNow: "Sync now",
    syncDone: "Amazon and eBay were checked.",
    settings: "Settings",
    pause: "Pause",
    activate: "Activate",
    pausedNotice: "Monitoring paused.",
    activatedNotice: "Monitoring activated.",
    confirmDelete: "Remove this product from monitoring?\n\nOK: Remove monitoring. Cancel: Keep.",
    confirmEndEbay: "Would you also like to end the active eBay listing?",
    deletedNotice: "Monitoring entry removed.",
    deleteLabel: "Delete",
    modalEyebrow: "PRODUCT SETTINGS",
    closeLabel: "Close",
    syncPartialError: (err) => `Settings saved, synchronization failed: ${err}`,
    settingsSaved: "Settings saved and resynchronized.",
    targetMargin: "Target margin (%)",
    shippingCost: "Shipping cost (€)",
    minSalePrice: "Minimum sale price (€)",
    quantityOverride: "eBay stock override (empty = automatic)",
    cancel: "Cancel",
    saving: "Saving …",
    saveAndSync: "Save & sync",
    unmanagedHeading: "Other active eBay listings",
    unmanagedSub: "Assign an Amazon ASIN to monitor price and stock.",
    addedNotice: "Product added. Initial check can now be started.",
    amazonPlaceholder: "Amazon.de URL or ASIN",
    marginShort: "Margin %",
    startMonitoring: "Start monitoring",
    assignAmazon: "Assign Amazon",
  },
  tr: {
    loadError: "Ürünler yüklenemedi.",
    actionError: "İşlem başarısız oldu.",
    confirmBulkDelete: (count) => `${count} ürün izlemeden kaldırılsın mı? eBay ilanları açık kalır.`,
    bulkFailed: (failed, total) => `${total} işlemden ${failed} tanesi tamamlanamadı.`,
    bulkDeleted: "Seçili ürünler silindi.",
    bulkActivated: "Seçili ürünler etkinleştirildi.",
    heading: "Amazon ↔ eBay Ürün İzleme",
    subheading: "Güncel alış fiyatları, stok durumu ve eşitlenen ilanlar.",
    refresh: "Yenile",
    selectedCount: (count) => `${count} seçildi`,
    activateSelected: "Seçilenleri etkinleştir",
    deleteSelected: "Seçilenleri sil",
    clearSelection: "Seçimi temizle",
    loading: "Ürünler yükleniyor …",
    empty: "Henüz izlenen ürün yok. Aşağıdan bir eBay ilanını Amazon ASIN ile eşleştirin.",
    selectAll: "Tüm ürünleri seç",
    colProduct: "Ürün",
    colAmazon: "Kaynak · Amazon",
    colEbay: "Hedef · eBay",
    colStatus: "Değişim ve Durum",
    colActions: "İşlemler",
    inStock: "Stokta",
    outOfStock: "Tükendi",
    unchecked: "Kontrol edilmedi",
    pieces: "adet",
    paused: "Duraklatıldı",
    outOfStockZero: "Stokta yok · Adet 0",
    errorStatus: "Hata",
    priceSynced: "Fiyat eşitlendi",
    synced: "Eşitlendi",
    checkedAt: (date) => `Son kontrol: ${date}`,
    notCheckedYet: "Henüz kontrol edilmedi",
    syncNow: "Şimdi eşitle",
    syncDone: "Amazon ve eBay kontrol edildi.",
    settings: "Ayarlar",
    pause: "Duraklat",
    activate: "Etkinleştir",
    pausedNotice: "İzleme duraklatıldı.",
    activatedNotice: "İzleme etkinleştirildi.",
    confirmDelete: "Bu ürünü izlemeden kaldırmak istiyor musunuz?\n\nTamam: İzlemeyi sil. İptal: Koru.",
    confirmEndEbay: "eBay ilanının da sonlandırılmasını ister misiniz?",
    deletedNotice: "İzleme kaydı silindi.",
    deleteLabel: "Sil",
    modalEyebrow: "ÜRÜN AYARLARI",
    closeLabel: "Kapat",
    syncPartialError: (err) => `Ayarlar kaydedildi, eşitleme başarısız: ${err}`,
    settingsSaved: "Ayarlar kaydedildi ve yeniden eşitlendi.",
    targetMargin: "Hedef kâr marjı (%)",
    shippingCost: "Kargo maliyeti (€)",
    minSalePrice: "Minimum satış fiyatı (€)",
    quantityOverride: "eBay stok manuel değer (boş = otomatik)",
    cancel: "İptal",
    saving: "Kaydediliyor …",
    saveAndSync: "Kaydet ve eşitle",
    unmanagedHeading: "Diğer aktif eBay ilanları",
    unmanagedSub: "Fiyat ve stok takibi için Amazon ASIN eşleştirin.",
    addedNotice: "Ürün eklendi. İlk kontrol şimdi başlatılabilir.",
    amazonPlaceholder: "Amazon.de URL veya ASIN",
    marginShort: "Marj %",
    startMonitoring: "İzlemeyi başlat",
    assignAmazon: "Amazon eşleştir",
  },
};

export function ProductTable({ listings }: { listings: Listing[] }) {
  const { locale } = useLocale();
  const t = copyByLocale[locale];
  const [products, setProducts] = useState<TrackedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<TrackedProduct | null>(null);
  const [settings, setSettings] = useState<Settings>({ margin: "20", shipping: "0", minimum: "0", quantity: "" });
  const [selected, setSelected] = useState<string[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [amazonInput, setAmazonInput] = useState("");
  const [enrollMargin, setEnrollMargin] = useState("20");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/tracked-products", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || t.loadError);
      setProducts(body.products || []); setSelected((old) => old.filter((id) => (body.products || []).some((p: TrackedProduct) => p.id === id))); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.loadError); }
    finally { setLoading(false); }
  }, [t.loadError]);
  useEffect(() => { void load(); const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30_000); return () => window.clearInterval(timer); }, [load]);
  const unmanaged = useMemo(() => { const ids = new Set(products.map((row) => row.ebay_item_id)); return listings.filter((item) => item.listingId && !ids.has(item.listingId)); }, [listings, products]);

  async function mutate(path: string, method: string, body?: object) {
    const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || result.syncError || `HTTP ${response.status}`); return result;
  }
  async function action(id: string, work: () => Promise<void>) {
    setBusyId(id); setError(""); setNotice("");
    try { await work(); await load(); } catch (cause) { await load(); setError(cause instanceof Error ? cause.message : t.actionError); }
    finally { setBusyId(null); }
  }
  async function bulk(active?: boolean) {
    const ids = [...selected]; if (!ids.length) return;
    const deleting = active === undefined;
    if (deleting && !window.confirm(t.confirmBulkDelete(ids.length))) return;
    setBusyId("bulk"); setError("");
    const results = await Promise.allSettled(ids.map((id) => mutate(`/api/tracked-products/${id}`, deleting ? "DELETE" : "PATCH", deleting ? undefined : { active })));
    const failed = results.filter((result) => result.status === "rejected").length;
    setSelected([]); await load(); setBusyId(null);
    if (failed) setError(t.bulkFailed(failed, ids.length)); else setNotice(deleting ? t.bulkDeleted : t.bulkActivated);
  }
  const allSelected = products.length > 0 && selected.length === products.length;
  const dateLocale = locale === "de" ? "de-DE" : locale === "en" ? "en-GB" : "tr-TR";

  return <div className="trackedProducts">
    <div className="trackedToolbar"><div><h3>{t.heading}</h3><p>{t.subheading}</p></div><button type="button" className="trackedButton" onClick={() => void load()}><RefreshCw size={16} /> {t.refresh}</button></div>
    {selected.length > 0 && <div className="trackedBulkBar"><strong>{t.selectedCount(selected.length)}</strong><button type="button" disabled={busyId !== null} onClick={() => void bulk(true)}>{t.activateSelected}</button><button type="button" className="trackedDelete" disabled={busyId !== null} onClick={() => void bulk()}>{t.deleteSelected}</button><button type="button" onClick={() => setSelected([])}>{t.clearSelection}</button></div>}
    {error && <p className="trackedError" role="alert">{error}</p>}{notice && <p className="trackedNotice" role="status">{notice}</p>}
    {loading ? <p className="trackedEmpty">{t.loading}</p> : products.length === 0 ? <p className="trackedEmpty">{t.empty}</p> : <div className="trackedScroll"><table className="trackedTable"><thead><tr><th><input aria-label={t.selectAll} type="checkbox" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? products.map((p) => p.id) : [])} /></th><th>{t.colProduct}</th><th>{t.colAmazon}</th><th>{t.colEbay}</th><th>{t.colStatus}</th><th>{t.colActions}</th></tr></thead><tbody>{products.map((product) => <tr key={product.id} className={product.active ? "" : "trackedPaused"}>
      <td><input aria-label={`${product.title}`} type="checkbox" checked={selected.includes(product.id)} onChange={(e) => setSelected((old) => e.target.checked ? [...old, product.id] : old.filter((id) => id !== product.id))} /></td>
      <td><div className="trackedProductName">{product.image_url ? <img src={product.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="trackedNoImage">▧</span>}<div><strong>{product.title}</strong><small>ASIN {product.amazon_asin} · eBay {product.ebay_item_id}</small></div></div></td>
      <td><strong>{product.amazon_price === null ? "—" : euro.format(Number(product.amazon_price))}</strong><div className="trackedMeta"><span className={`trackedBadge ${product.amazon_stock_status === true ? "stock" : product.amazon_stock_status === false ? "empty" : "unknown"}`}>{product.amazon_stock_status === true ? t.inStock : product.amazon_stock_status === false ? t.outOfStock : t.unchecked}</span><a href={product.amazon_url} target="_blank" rel="noopener noreferrer" aria-label={`Amazon: ${product.amazon_asin}`}><ExternalLink size={15} /></a></div></td>
      <td><strong>{product.ebay_price === null ? "—" : euro.format(Number(product.ebay_price))}</strong><div className="trackedMeta"><span>{product.ebay_quantity} {t.pieces}</span><a href={product.ebay_url} target="_blank" rel="noopener noreferrer" aria-label={`eBay: ${product.ebay_item_id}`}><ExternalLink size={15} /></a></div></td>
      <td><div className="trackedState"><span className={`trackedBadge ${!product.active ? "unknown" : product.sync_status === "out_of_stock" || product.sync_status === "error" ? "empty" : "stock"}`}>{!product.active ? t.paused : product.sync_status === "out_of_stock" ? t.outOfStockZero : product.sync_status === "error" ? t.errorStatus : product.sync_status === "price_changed" ? t.priceSynced : t.synced}</span>{product.amazon_price_delta !== null && Number(product.amazon_price_delta) !== 0 && <span className={`trackedDelta ${Number(product.amazon_price_delta) > 0 ? "up" : "down"}`}>{Number(product.amazon_price_delta) > 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}{Number(product.amazon_price_delta) > 0 ? "+" : ""}{euro.format(Number(product.amazon_price_delta))}</span>}<small>{product.last_checked_at ? t.checkedAt(new Date(product.last_checked_at).toLocaleString(dateLocale)) : t.notCheckedYet}</small>{product.last_error && <small className="trackedRowError" title={product.last_error}>{product.last_error}</small>}</div></td>
      <td><div className="trackedActions"><button type="button" disabled={busyId !== null || !product.active} onClick={() => void action(product.id, async () => { await mutate(`/api/tracked-products/${product.id}/sync`, "POST"); setNotice(t.syncDone); })}><RefreshCw size={15} /> {t.syncNow}</button><button type="button" disabled={busyId !== null} onClick={() => { setEditing(product); setSettings(settingsOf(product)); }}><Settings2 size={15} /> {t.settings}</button><button type="button" disabled={busyId !== null} onClick={() => void action(product.id, async () => { await mutate(`/api/tracked-products/${product.id}`, "PATCH", { active: !product.active }); setNotice(product.active ? t.pausedNotice : t.activatedNotice); })}>{product.active ? t.pause : t.activate}</button><button type="button" className="trackedDelete" disabled={busyId !== null} onClick={() => { const close = window.confirm(t.confirmDelete); if (close) { const endListing = window.confirm(t.confirmEndEbay); void action(product.id, async () => { await mutate(`/api/tracked-products/${product.id}`, "DELETE", { endEbayListing: endListing }); setNotice(t.deletedNotice); }); } }}><Trash2 size={15} /> {t.deleteLabel}</button></div></td>
    </tr>)}</tbody></table></div>}
    {editing && <div className="trackedModalBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}><section className="trackedModal" role="dialog" aria-modal="true" aria-labelledby="trackedSettingsTitle"><div className="trackedModalHeader"><div><span className="trackedEyebrow">{t.modalEyebrow}</span><h3 id="trackedSettingsTitle">{editing.title}</h3></div><button type="button" aria-label={t.closeLabel} onClick={() => setEditing(null)}>×</button></div><form onSubmit={(event) => { event.preventDefault(); void action(editing.id, async () => { const result = await mutate(`/api/tracked-products/${editing.id}`, "PATCH", { targetMarginPercent: Number(settings.margin), estimatedShipping: Number(settings.shipping), minimumSalePrice: Number(settings.minimum), manualQuantityOverride: settings.quantity === "" ? null : Number(settings.quantity), recalculate: true }); setEditing(null); setNotice(result.syncError ? t.syncPartialError(String(result.syncError)) : t.settingsSaved); }); }}><label>{t.targetMargin}<input required type="number" min="0" max="300" step="0.01" value={settings.margin} onChange={(e) => setSettings({ ...settings, margin: e.target.value })} /></label><label>{t.shippingCost}<input required type="number" min="0" max="10000" step="0.01" value={settings.shipping} onChange={(e) => setSettings({ ...settings, shipping: e.target.value })} /></label><label>{t.minSalePrice}<input required type="number" min="0" max="1000000" step="0.01" value={settings.minimum} onChange={(e) => setSettings({ ...settings, minimum: e.target.value })} /></label><label>{t.quantityOverride}<input type="number" min="0" max="10000" step="1" value={settings.quantity} onChange={(e) => setSettings({ ...settings, quantity: e.target.value })} /></label><div className="trackedModalActions"><button type="button" onClick={() => setEditing(null)}>{t.cancel}</button><button type="submit" disabled={busyId !== null}>{busyId === editing.id ? t.saving : t.saveAndSync}</button></div></form></section></div>}
    {unmanaged.length > 0 && <div className="trackedUnmanaged"><h4>{t.unmanagedHeading}</h4><p>{t.unmanagedSub}</p>{unmanaged.map((item) => <div className="trackedEnroll" key={item.listingId}><span><strong>{item.title || item.listingId}</strong><small>Item ID {item.listingId}</small></span>{addingId === item.listingId ? <form onSubmit={(event) => { event.preventDefault(); void action(item.listingId!, async () => { await mutate("/api/tracked-products", "POST", { ebayItemId: item.listingId, amazonUrl: amazonInput, targetMarginPercent: Number(enrollMargin) }); setAddingId(null); setAmazonInput(""); setNotice(t.addedNotice); }); }}><input required aria-label={t.amazonPlaceholder} placeholder={t.amazonPlaceholder} value={amazonInput} onChange={(event) => setAmazonInput(event.target.value)} /><label>{t.marginShort} <input type="number" min="0" max="300" step="0.01" value={enrollMargin} onChange={(event) => setEnrollMargin(event.target.value)} /></label><button type="submit" disabled={busyId !== null}>{t.startMonitoring}</button></form> : <button type="button" onClick={() => { setAddingId(item.listingId!); setAmazonInput(""); }}>{t.assignAmazon}</button>}</div>)}</div>}
  </div>;
}
