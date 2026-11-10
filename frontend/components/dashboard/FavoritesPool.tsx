"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, ExternalLink, Trash2 } from "lucide-react";
import { ProductEditModal } from "./ProductEditModal";
import type { DraftProduct, DraftEditInput } from "../../lib/drafts/types";
import { useLocale, type Locale } from "../../lib/locale";

type Favorite = { id: string; asin: string; title: string; image_url: string | null; amazon_url: string; amazon_price: number | null; is_prime: boolean; suggested_ebay_price: number | null; created_at: string };
type ListingSetup = { storeId: string | null; defaults: { merchantLocationKey: string; fulfillmentPolicyId: string; paymentPolicyId: string; returnPolicyId: string } };
const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

const copyByLocale: Record<Locale, {
  loadError: string;
  alreadyInDrafts: string;
  stagedNotice: string;
  stageError: string;
  confirmDelete: string;
  deletedNotice: string;
  deleteError: string;
  eyebrow: string;
  heading: string;
  subheading: string;
  refresh: string;
  loading: string;
  empty: string;
  suggestion: string;
  savedOn: string;
  openAmazon: string;
  staging: string;
  stageToDrafts: string;
  removeFromPool: string;
}> = {
  de: {
    loadError: "Favoriten konnten nicht geladen werden.",
    alreadyInDrafts: "Dieser Kandidat liegt bereits in deinen Entwürfen.",
    stagedNotice: "Kandidat in den Produktentwürfen abgelegt. Dort kannst du ihn bearbeiten und vor der Veröffentlichung prüfen.",
    stageError: "Kandidat konnte nicht übernommen werden.",
    confirmDelete: "Diesen Kandidaten dauerhaft aus dem Produktpool löschen?",
    deletedNotice: "Kandidat aus dem Produktpool gelöscht.",
    deleteError: "Kandidat konnte nicht gelöscht werden.",
    eyebrow: "FAVORITEN · SOURCING",
    heading: "Produktpool",
    subheading: "Gespeicherte Amazon-Produkte prüfen und in den eBay-Auftrag geben.",
    refresh: "Aktualisieren",
    loading: "Favoriten werden geladen …",
    empty: "Noch keine Favoriten. Speichere Produkte über die Chrome-Erweiterung auf Amazon.de.",
    suggestion: "Vorschlag",
    savedOn: "Gespeichert",
    openAmazon: "Amazon öffnen",
    staging: "Wird übernommen …",
    stageToDrafts: "In Entwürfe übernehmen",
    removeFromPool: "Aus Pool entfernen",
  },
  en: {
    loadError: "Favorites could not be loaded.",
    alreadyInDrafts: "This candidate is already in your drafts.",
    stagedNotice: "Candidate moved to product drafts. You can edit and review it there before publishing.",
    stageError: "Candidate could not be moved to drafts.",
    confirmDelete: "Permanently delete this candidate from the product pool?",
    deletedNotice: "Candidate removed from the product pool.",
    deleteError: "Candidate could not be deleted.",
    eyebrow: "FAVORITES · SOURCING",
    heading: "Product pool",
    subheading: "Review saved Amazon products and move them into your eBay workflow.",
    refresh: "Refresh",
    loading: "Loading favorites …",
    empty: "No favorites yet. Save products on Amazon.de using the Chrome extension.",
    suggestion: "Suggested",
    savedOn: "Saved",
    openAmazon: "Open Amazon",
    staging: "Moving …",
    stageToDrafts: "Move to drafts",
    removeFromPool: "Remove from pool",
  },
  tr: {
    loadError: "Favoriler yüklenemedi.",
    alreadyInDrafts: "Bu ürün adayı zaten taslaklarınızda bulunuyor.",
    stagedNotice: "Ürün adayı taslaklara aktarıldı. Yayınlamadan önce orada düzenleyip kontrol edebilirsiniz.",
    stageError: "Ürün adayı taslaklara aktarılamadı.",
    confirmDelete: "Bu ürün adayını ürün havuzundan kalıcı olarak silmek istiyor musunuz?",
    deletedNotice: "Ürün adayı ürün havuzundan silindi.",
    deleteError: "Ürün adayı silinemedi.",
    eyebrow: "FAVORİLER · ÜRÜN HAVUZU",
    heading: "Ürün havuzu",
    subheading: "Kaydedilen Amazon ürünlerini inceleyin ve eBay iş akışına aktarın.",
    refresh: "Yenile",
    loading: "Favoriler yükleniyor …",
    empty: "Henüz favori yok. Chrome eklentisiyle Amazon.de üzerinden ürün kaydedin.",
    suggestion: "Öneri",
    savedOn: "Kaydedildi:",
    openAmazon: "Amazon'da aç",
    staging: "Aktarılıyor …",
    stageToDrafts: "Taslaklara aktar",
    removeFromPool: "Havuzdan sil",
  },
};

export function FavoritesPool({ onInspect }: { onInspect?: () => void }) {
  const { locale } = useLocale();
  const t = copyByLocale[locale];
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<DraftProduct | null>(null);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { const response = await fetch("/api/favorites", { cache: "no-store" }); const body = await response.json(); if (!response.ok) throw new Error(body.error || t.loadError); setFavorites(body.favorites || []); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : t.loadError); }
    finally { setLoading(false); }
  }, [t.loadError]);
  useEffect(() => { void load(); }, [load]);
  async function stageFavorite(item: Favorite) {
    setBusy(item.id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/drafts/from-favorite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ favoriteId: item.id }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setNotice(result.alreadyExists ? t.alreadyInDrafts : t.stagedNotice);
      const draftsResponse = await fetch("/api/drafts", { cache: "no-store" });
      const draftsBody = await draftsResponse.json();
      if (!draftsResponse.ok) throw new Error(draftsBody.error);
      const draft = (draftsBody.drafts || []).find((d: DraftProduct) => d.id === result.draftId);
      if (draft) setEditing(draft); else onInspect?.();
      window.dispatchEvent(new Event("products-changed"));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.stageError);
    } finally { setBusy(null); }
  }

  async function removeFavorite(item: Favorite) {
    if (!window.confirm(t.confirmDelete)) return;
    setBusy(item.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/favorites/${item.id}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      setFavorites(current => current.filter(row => row.id !== item.id));
      setSelected(current => current.filter(id => id !== item.id));
      window.dispatchEvent(new Event("products-changed"));
      setNotice(t.deletedNotice);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.deleteError);
    } finally { setBusy(null); }
  }
  async function deleteSelected() {
    if (!selected.length || !window.confirm(`${selected.length} · ${t.confirmDelete}`)) return;
    setBusy("bulk"); setError("");
    try {
      const response = await fetch("/api/favorites", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: selected }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setFavorites(current => current.filter(item => !result.deletedIds.includes(item.id)));
      setSelected([]); setNotice(t.deletedNotice); window.dispatchEvent(new Event("products-changed"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.deleteError); }
    finally { setBusy(null); }
  }
  async function saveInspection(id: string, input: DraftEditInput, publish: boolean) {
    const response = await fetch(`/api/drafts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    if (publish) {
      if (!window.confirm(locale === "tr" ? "Görsel haklarını ve ürün bilgilerini onaylayarak eBay’de yayınla?" : "Confirm image rights and publish on eBay?")) throw new Error("Yayınlama iptal edildi.");
      const setupResponse = await fetch("/api/drafts/ebay-settings", { cache: "no-store" });
      const setup = await setupResponse.json();
      if (!setupResponse.ok) throw new Error(setup.error);
      const listingSetup = setup as ListingSetup;
      const published = await fetch("/api/drafts/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id], imageRightsConfirmed: true, storeId: listingSetup.storeId, settings: listingSetup.defaults }) });
      const result = await published.json();
      if (!published.ok || result.results?.some((row: { error?: string }) => row.error)) throw new Error(result.error || result.results?.find((row: { error?: string }) => row.error)?.error || "Yayınlanamadı.");
    }
    setEditing(null); window.dispatchEvent(new Event("products-changed"));
    onInspect?.();
  }
  const dateLocale = locale === "de" ? "de-DE" : locale === "en" ? "en-GB" : "tr-TR";
  return <div className="favoritePool">
    <ProductEditModal draft={editing} onClose={() => { setEditing(null); onInspect?.(); }} onSave={saveInspection} />
    <div className="favoriteActions"><label><input type="checkbox" aria-label="Tüm ürünleri seç" checked={favorites.length > 0 && selected.length === favorites.length} onChange={e => setSelected(e.target.checked ? favorites.map(f => f.id) : [])} /> {locale === "tr" ? "Tümünü seç" : "Select all"}</label><button className="favoriteDelete" type="button" disabled={!selected.length || busy !== null} onClick={() => void deleteSelected()}>{locale === "tr" ? "Seçilenleri Sil" : locale === "de" ? "Auswahl löschen" : "Delete selected"} ({selected.length})</button></div>
    <div className="favoritePoolHeading"><div><p className="sectionEyebrow">{t.eyebrow}</p><h3>{t.heading}</h3><p>{t.subheading}</p></div><button type="button" className="quietButton" onClick={() => void load()}>{t.refresh}</button></div>
    {error && <p className="trackedError" role="alert">{error}</p>}{notice && <p className="trackedNotice" role="status">{notice}</p>}
    {loading ? <p className="emptyDashboard">{t.loading}</p> : favorites.length === 0 ? <p className="emptyDashboard">{t.empty}</p> : <div className="favoriteGrid">{favorites.map((item) => <article className="favoriteCard" key={item.id}>
      <label className="favoriteSelect"><input type="checkbox" aria-label={item.title} checked={selected.includes(item.id)} onChange={e => setSelected(current => e.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} /></label>
      {item.image_url ? <img className="favoriteImage" src={item.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className="favoriteImage favoriteImageEmpty">▧</div>}
      <div className="favoriteInfo"><span className="favoriteAsin">ASIN {item.asin}{item.is_prime ? " · Prime" : ""}</span><h4>{item.title}</h4><p>Amazon {item.amazon_price == null ? "—" : euro.format(Number(item.amazon_price))} <span>·</span> {t.suggestion} {item.suggested_ebay_price == null ? "—" : euro.format(Number(item.suggested_ebay_price))}</p><small>{t.savedOn} {new Date(item.created_at).toLocaleDateString(dateLocale)}</small></div>
      <div className="favoriteActions"><a className="quietButton" href={item.amazon_url} target="_blank" rel="noopener noreferrer">{t.openAmazon} <ExternalLink size={15} /></a><button className="primaryButton" type="button" disabled={busy !== null} onClick={() => void stageFavorite(item)}><ArrowRight size={15} /> {busy === item.id ? t.staging : (locale === "tr" ? "⭐ Favori / İncele & Düzenle" : locale === "de" ? "⭐ Prüfen & bearbeiten" : "⭐ Inspect & edit")}</button><button className="favoriteDelete" type="button" disabled={busy !== null} onClick={() => void removeFavorite(item)}><Trash2 size={15} /> {t.removeFromPool}</button></div>
    </article>)}</div>}
  </div>;
}
