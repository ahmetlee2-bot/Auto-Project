"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, ImagePlus, LoaderCircle, Sparkles, X, RefreshCw } from "lucide-react";
import { calculateDraftTargetPrice } from "../../lib/drafts/pricing";
import type { DraftEditInput, DraftProduct } from "../../lib/drafts/types";
import { useLocale } from "../../lib/locale";

type Props = {
  draft: DraftProduct | null;
  defaultCategoryId?: string;
  storeId?: string;
  onClose: () => void;
  onSave: (id: string, input: DraftEditInput, publish: boolean) => Promise<void>;
};

const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
type RequiredAspectField = { name: string; required: boolean; mode: string; choices: string[]; value: string };


export function ProductEditModal({ draft, defaultCategoryId, storeId, onClose, onSave }: Props) {
  const { locale } = useLocale();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState("");
  const [category, setCategory] = useState("");
  const [margin, setMargin] = useState("20");
  const [shipping, setShipping] = useState("0");
  const [manualSalePrice, setManualSalePrice] = useState("");
  const [dedupingImages, setDedupingImages] = useState(false);
  const [applyFrame, setApplyFrame] = useState(true);
  const [busy, setBusy] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState("");
  const [titleNotice, setTitleNotice] = useState("");
  const [titleAlternatives, setTitleAlternatives] = useState<string[]>([]);
  const [refreshedPrice, setRefreshedPrice] = useState<number | null>(null);
  const [refreshingPrice, setRefreshingPrice] = useState(false);
  const [categorySuggestions, setCategorySuggestions] = useState<Array<{ id: string; name: string; path: string }>>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [categorySuggestionError, setCategorySuggestionError] = useState("");
  const [requiredAspects, setRequiredAspects] = useState<RequiredAspectField[]>([]);
  const [itemSpecifics, setItemSpecifics] = useState<Record<string, string[]>>({});
  const [loadingAspects, setLoadingAspects] = useState(false);
  const [aspectsError, setAspectsError] = useState("");
  const categoryTouched = useRef(false);

  useEffect(() => {
    if (!draft) return;
    setTitle(draft.title || "");
    setDescription(draft.description_html || "");
    setImages(Array.isArray(draft.images) ? draft.images : []);
    setManualSalePrice(draft.manual_sale_price == null ? "" : String(draft.manual_sale_price));
    setCategory(draft.selected_category_id || "");
    setItemSpecifics(draft.item_specifics && typeof draft.item_specifics === "object" ? draft.item_specifics : {});
    setRequiredAspects([]);
    setAspectsError("");
    categoryTouched.current = false;
    setCategorySuggestions([]);
    setCategorySuggestionError("");
    setMargin(String(draft.profit_margin_percent ?? 20));
    setShipping(String(draft.shipping_cost ?? 0));
    setApplyFrame(draft.apply_custom_frame !== false);
    setError("");
    setTitleNotice("");
    setTitleAlternatives([]);
    setRefreshedPrice(null);
  }, [draft]);

  const draftId = draft?.id;
  const selectedCategoryId = draft?.selected_category_id;
  const loadCategorySuggestions = useCallback(async () => {
    if (!draftId || !storeId) return;
    setLoadingCategories(true);
    setCategorySuggestionError("");
    try {
      const query = new URLSearchParams({ draftId, storeId });
      const response = await fetch(`/api/drafts/category-suggestions?${query.toString()}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "eBay-Kategorien konnten nicht geladen werden.");
      const categories = Array.isArray(result.categories) ? result.categories : [];
      setCategorySuggestions(categories);
      const currentIsSuggested = categories.some((item: { id: string }) => item.id === selectedCategoryId);
      if (!categoryTouched.current && categories.length && (!selectedCategoryId || !currentIsSuggested)) {
        setCategory(categories[0].id);
      }
    } catch (cause) {
      setCategorySuggestionError(cause instanceof Error ? cause.message : "eBay-Kategorien konnten nicht geladen werden.");
    } finally {
      setLoadingCategories(false);
    }
  }, [draftId, selectedCategoryId, storeId]);

  useEffect(() => { if (draftId && storeId) void loadCategorySuggestions(); }, [draftId, storeId, loadCategorySuggestions]);

  useEffect(() => {
    if (!draftId || !category.trim() || !/^\\d{1,20}$/.test(category.trim())) {
      setRequiredAspects([]);
      return;
    }
    let active = true;
    setLoadingAspects(true);
    setAspectsError("");
    const query = new URLSearchParams({ draftId, categoryId: category.trim(), ...(storeId ? { storeId } : {}) });
    void fetch(`/api/drafts/required-aspects?${query.toString()}`).then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "eBay-Pflichtmerkmale konnten nicht geladen werden.");
      if (!active) return;
      const fields = Array.isArray(result.aspects) ? result.aspects as RequiredAspectField[] : [];
      setRequiredAspects(fields.map((field) => {
        const saved = Object.entries(itemSpecifics).find(([key]) => key.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLocaleLowerCase("de-DE") === field.name.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLocaleLowerCase("de-DE"))?.[1]?.[0];
        return { ...field, value: saved || field.value || "" };
      }));
    }).catch((cause) => {
      if (active) setAspectsError(cause instanceof Error ? cause.message : "eBay-Pflichtmerkmale konnten nicht geladen werden.");
    }).finally(() => { if (active) setLoadingAspects(false); });
    return () => { active = false; };
  // itemSpecifics intentionally omitted: user edits should not refetch category metadata.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, category, storeId]);

  useEffect(() => {
    if (!draftId) return;
    let active = true;
    setDedupingImages(true);
    void fetch("/api/drafts/dedupe-images", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draftId }),
    }).then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (active && response.ok && Array.isArray(result.images)) setImages(result.images);
    }).catch(() => undefined).finally(() => { if (active) setDedupingImages(false); });
    return () => { active = false; };
  }, [draftId]);

  if (!draft) return null;
  const sourcePrice = refreshedPrice ?? draft.source_price;
  const calculatedTarget = calculateDraftTargetPrice({ source_price: sourcePrice, shipping_cost: shipping, profit_margin_percent: margin });
  const manualPriceValue = manualSalePrice.trim() ? Number(manualSalePrice.replace(",", ".")) : null;
  const target = manualSalePrice.trim()
    ? manualPriceValue !== null && Number.isFinite(manualPriceValue) && manualPriceValue > 0 && manualPriceValue <= 1_000_000 ? manualPriceValue : null
    : calculatedTarget;
  const titleInvalid = !title.trim() || title.length > 80;

  async function refreshAmazonPrice() {
    if (!draft) return;
    setRefreshingPrice(true);
    setError("");
    try {
      const response = await fetch("/api/drafts/refresh-price", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: draft.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Amazon-Preis konnte nicht geladen werden.");
      setRefreshedPrice(Number(result.sourcePrice));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Amazon-Preis konnte nicht geladen werden.");
    } finally {
      setRefreshingPrice(false);
    }
  }

  function moveImage(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= images.length) return;
    setImages((current) => {
      const updated = [...current];
      [updated[index], updated[nextIndex]] = [updated[nextIndex], updated[index]];
      return updated;
    });
  }

  function addImage() {
    try {
      const url = new URL(imageUrl.trim());
      if (url.protocol !== "https:") throw new Error();
      if (images.includes(url.toString())) {
        setError(locale === "de" ? "Dieses Bild ist bereits in der Liste." : locale === "en" ? "This image is already in the list." : "Bu görsel zaten listede.");
        return;
      }
      if (images.length >= 12) {
        setError(locale === "de" ? "Es sind maximal 12 Produktbilder erlaubt." : locale === "en" ? "A maximum of 12 product images is allowed." : "En fazla 12 ürün görseline izin verilir.");
        return;
      }
      setImages((current) => [...current, url.toString()]);
      setImageUrl("");
      setError("");
    } catch {
      setError(locale === "de" ? "Bitte gib eine gültige HTTPS-Bild-URL ein." : locale === "en" ? "Please enter a valid HTTPS image URL." : "Lütfen geçerli bir HTTPS görsel URL'si girin.");
    }
  }

  async function optimizeTitle() {
    if (!draft) return;
    setOptimizing(true);
    setError("");
    try {
      const response = await fetch("/api/drafts/optimize-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, asin: draft.asin, category, description, supplier: draft.supplier, source_url: draft.source_url, raw_title: title, raw_description: description, item_specifics: itemSpecifics }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Titel konnte nicht optimiert werden.");
      setTitle(String(body.title || "").slice(0, 80));
      setTitleAlternatives(Array.isArray(body.title_alternatives) ? body.title_alternatives.map(String).filter((value: string) => value.length > 0 && value.length <= 80).slice(0, 3) : []);
      if (body.item_specifics && typeof body.item_specifics === "object" && !Array.isArray(body.item_specifics)) {
        setItemSpecifics((current) => ({ ...current, ...body.item_specifics }));
      }
      if (body.source === "ai" && typeof body.description_html === "string") setDescription(body.description_html);
      setTitleNotice(body.source === "ai"
        ? (locale === "de" ? "eBay-Titel wurde mit KI optimiert. Bitte Produktangaben vor dem Speichern prüfen." : locale === "en" ? "eBay title optimized with AI. Review the product details before saving." : "eBay başlığı yapay zekâ ile optimize edildi. Kaydetmeden önce ürün bilgilerini kontrol edin.")
        : body.fallbackReason === "source_unavailable"
          ? (locale === "de" ? "Amazon-Produktdaten waren nicht erreichbar. Bitte den Originaltitel und die Merkmale prüfen; es wurden keine Angaben erfunden." : locale === "en" ? "Amazon product data was unavailable. Review the original title and features; no details were invented." : "Amazon ürün verileri alınamadı. Orijinal başlığı ve özellikleri kontrol edin; bilgi uydurulmadı.")
        : body.fallbackReason === "provider_unconfigured"
          ? (locale === "de" ? "Der KI-Anbieter ist auf dem Server noch nicht eingerichtet. Eine lokale 80-Zeichen-Optimierung wurde angewendet; für KI-Vorschläge muss ein API-Schlüssel serverseitig hinterlegt werden." : locale === "en" ? "No AI provider key is configured on the server. A local 80-character optimization was applied; add a server-side API key to enable AI suggestions." : "Sunucuda yapay zekâ sağlayıcı anahtarı yok. Yerel 80 karakter düzenlemesi uygulandı; yapay zekâ önerileri için API anahtarı sunucuya eklenmeli.")
          : (locale === "de" ? "Der KI-Anbieter war nicht erreichbar. Eine lokale Titeloptimierung wurde angewendet." : locale === "en" ? "The AI provider could not be reached. A local title optimization was applied." : "Yapay zekâ sağlayıcısına ulaşılamadı. Yerel başlık düzenlemesi uygulandı."));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (locale === "de" ? "KI-Titeloptimierung fehlgeschlagen." : locale === "en" ? "AI title optimization failed." : "Yapay zeka başlık optimizasyonu başarısız oldu."));
    } finally {
      setOptimizing(false);
    }
  }

  async function submit(publish: boolean) {
    if (!draft) return;
    if (titleInvalid) {
      setError(locale === "de" ? "Der Titel muss zwischen 1 und 80 Zeichen lang sein." : locale === "en" ? "Title must be between 1 and 80 characters long." : "Başlık 1 ile 80 karakter arasında olmalıdır.");
      return;
    }
    const parsedMargin = Number(margin);
    const parsedShipping = Number(shipping);
    if (!Number.isFinite(parsedMargin) || parsedMargin < 0 || parsedMargin > 300 || !Number.isFinite(parsedShipping) || parsedShipping < 0) {
      setError(locale === "de" ? "Bitte prüfe Zielmarge und Versandkosten." : locale === "en" ? "Please check target margin and shipping cost." : "Lütfen hedef marjı ve kargo maliyetini kontrol edin.");
      return;
    }
    if (target === null) {
      setError(locale === "de" ? "Bitte gib einen gültigen eBay-Verkaufspreis ein." : locale === "en" ? "Enter a valid eBay sale price." : "Geçerli bir eBay satış fiyatı girin.");
      return;
    }
    const missingAspects = requiredAspects.filter((field) => field.required && !field.value.trim());
    if (publish && (loadingAspects || aspectsError || missingAspects.length)) {
      setError(loadingAspects
        ? (locale === "de" ? "eBay-Pflichtmerkmale werden noch geladen. Bitte kurz warten." : locale === "en" ? "eBay required item specifics are still loading. Please wait." : "eBay zorunlu ürün özellikleri yükleniyor. Lütfen bekleyin.")
        : aspectsError || (locale === "de" ? `Bitte ergänze alle Pflichtmerkmale: ${missingAspects.map((field) => field.name).join(", ")}.` : locale === "en" ? `Complete all required item specifics: ${missingAspects.map((field) => field.name).join(", ")}.` : `Lütfen zorunlu ürün özelliklerini tamamlayın: ${missingAspects.map((field) => field.name).join(", ")}.`));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const savedSpecifics: Record<string, string[]> = { ...itemSpecifics };
      for (const field of requiredAspects) {
        if (field.value.trim()) savedSpecifics[field.name] = [field.value.trim()];
        else delete savedSpecifics[field.name];
      }
      await onSave(draft.id, {
        title: title.trim(),
        description_html: description,
        images,
        selected_category_id: category.trim() || null,
        item_specifics: savedSpecifics,
        profit_margin_percent: parsedMargin,
        shipping_cost: parsedShipping,
        apply_custom_frame: applyFrame,
        manual_sale_price: manualPriceValue && Number.isFinite(manualPriceValue) ? manualPriceValue : null,
      }, publish);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (locale === "de" ? "Änderungen konnten nicht gespeichert werden." : locale === "en" ? "Changes could not be saved." : "Değişiklikler kaydedilemedi."));
    } finally {
      setBusy(false);
    }
  }

  return <div className="draftModalBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="draftModal" role="dialog" aria-modal="true" aria-labelledby="draft-modal-title">
      <header className="draftModalHeader">
        <div><span className="draftEyebrow">{locale === "de" ? "ENTWURF" : locale === "en" ? "DRAFT" : "TASLAK"} · {draft.asin}</span><h2 id="draft-modal-title">{locale === "de" ? "Produkt bearbeiten" : locale === "en" ? "Edit product" : "Ürünü düzenle"}</h2></div>
        <button className="draftIconButton" type="button" aria-label={locale === "de" ? "Schließen" : locale === "en" ? "Close" : "Kapat"} disabled={busy || dedupingImages} onClick={onClose}><X size={19} /></button>
      </header>
      {error ? <p className="draftAlert" role="alert">{error}</p> : null}
      <div className="draftModalBody">
        <section className="draftEditorSection">
          <div className="draftSectionHeading"><div><h3>{locale === "de" ? "Produktbilder" : locale === "en" ? "Product images" : "Ürün görselleri"}</h3><p>{locale === "de" ? "Das erste Bild wird als eBay-Titelbild verwendet." : locale === "en" ? "The first image is used as the eBay cover image." : "İlk görsel eBay kapak görseli olarak kullanılır."}</p></div><span>{images.length}/12</span></div>
          {images.length ? <div className="draftImageGrid">{images.map((image, index) => <div className="draftImageTile" key={`${image}-${index}`}>
            <img src={image} alt={`${locale === "de" ? "Produktbild" : locale === "en" ? "Product image" : "Ürün görseli"} ${index + 1}`} referrerPolicy="no-referrer" />
            <span className="draftImageNumber">{index === 0 ? (locale === "de" ? "Titelbild" : locale === "en" ? "Cover" : "Kapak") : index + 1}</span>
            <div className="draftImageTools">
              <button type="button" aria-label={locale === "de" ? "Nach oben" : locale === "en" ? "Move up" : "Yukarı taşı"} disabled={index === 0} onClick={() => moveImage(index, -1)}><ArrowUp size={14} /></button>
              <button type="button" aria-label={locale === "de" ? "Nach unten" : locale === "en" ? "Move down" : "Aşağı taşı"} disabled={index === images.length - 1} onClick={() => moveImage(index, 1)}><ArrowDown size={14} /></button>
              <button type="button" aria-label={locale === "de" ? "Bild entfernen" : locale === "en" ? "Remove image" : "Görseli kaldır"} onClick={() => setImages((current) => current.filter((_, at) => at !== index))}><X size={14} /></button>
            </div>
          </div>)}</div> : <p className="draftMutedBox">{locale === "de" ? "Noch keine Bilder hinzugefügt." : locale === "en" ? "No images added yet." : "Henüz görsel eklenmedi."}</p>}
          <div className="draftInlineAdd"><input aria-label="Bild-URL" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://… Bild-URL" /><button type="button" className="draftSecondaryButton" onClick={addImage}><ImagePlus size={16} /> {locale === "de" ? "Bild hinzufügen" : locale === "en" ? "Add image" : "Görsel ekle"}</button></div>
          <label className="draftFrameToggle"><input type="checkbox" checked={applyFrame} onChange={(event) => setApplyFrame(event.target.checked)} /><span><strong>{locale === "de" ? "Rahmenvorlage auf das Titelbild anwenden" : locale === "en" ? "Apply frame template to cover image" : "Kapak görseline çerçeve şablonu uygula"}</strong><small>{locale === "de" ? "Nur das erste Bild erhält beim Veröffentlichen einen Rahmen. Die weiteren HD-Bilder bleiben unverändert." : locale === "en" ? "Only the first image receives a frame when published. Additional HD images remain unchanged." : "Yayınlanırken yalnızca ilk görsele çerçeve uygulanır. Diğer HD görseller olduğu gibi kalır."}</small></span></label>
        </section>

        <section className="draftEditorSection">
          <div className="draftSectionHeading"><div><h3>{locale === "de" ? "Titel & Kategorie" : locale === "en" ? "Title & Category" : "Başlık ve Kategori"}</h3><p>{locale === "de" ? "Der eBay-Titel darf höchstens 80 Zeichen haben." : locale === "en" ? "The eBay title may be at most 80 characters." : "eBay başlığı en fazla 80 karakter olabilir."}</p></div><a href={draft.source_url} target="_blank" rel="noopener noreferrer" className="draftTextLink">{locale === "de" ? "Amazon öffnen" : locale === "en" ? "Open Amazon" : "Amazon'da aç"} <ExternalLink size={14} /></a></div>
          <textarea className={`draftTitleInput ${title.length > 80 ? "invalid" : ""}`} value={title} maxLength={160} rows={3} onChange={(event) => { setTitle(event.target.value); setTitleNotice(""); setTitleAlternatives([]); }} />
          <div className="draftFieldFooter"><span className={title.length > 80 ? "draftDangerText" : "draftMutedText"}>{title.length}/80 {locale === "de" ? "Zeichen" : locale === "en" ? "characters" : "karakter"}</span><button type="button" className="draftSecondaryButton" disabled={optimizing} onClick={() => void optimizeTitle()}>{optimizing ? <LoaderCircle size={16} className="draftSpin" /> : <Sparkles size={16} />} {locale === "de" ? "KI-Titel optimieren" : locale === "en" ? "Optimize title with AI" : "Yapay zeka ile başlığı optimize et"}</button></div>
          {titleAlternatives.length ? <div className="draftTitleAlternatives" aria-label="SEO-Titelalternativen">{titleAlternatives.map((candidate, index) => <button key={`${candidate}-${index}`} type="button" className={candidate === title ? "selected" : ""} onClick={() => setTitle(candidate)}><span>{index + 1}</span>{candidate}<small>{candidate.length}/80</small></button>)}</div> : null}
          {titleNotice ? <p className="draftTitleHint" role="status">{titleNotice}</p> : null}
          <label className="draftFieldLabel">{locale === "de" ? "eBay-Kategorie" : locale === "en" ? "eBay category" : "eBay kategorisi"}<select value={categorySuggestions.some((item) => item.id === category) ? category : ""} disabled={loadingCategories || !categorySuggestions.length} onChange={(event) => { categoryTouched.current = true; setCategory(event.target.value); }}><option value="">{loadingCategories ? (locale === "de" ? "eBay-Vorschläge werden geladen …" : locale === "en" ? "Loading eBay suggestions …" : "eBay önerileri yükleniyor …") : categorySuggestions.length ? (locale === "de" ? "Kategorie auswählen …" : locale === "en" ? "Choose a category …" : "Kategori seçin …") : (locale === "de" ? "Keine Vorschläge verfügbar" : locale === "en" ? "No suggestions available" : "Öneri bulunamadı")}</option>{categorySuggestions.map((item) => <option key={item.id} value={item.id}>{item.path} · {item.id}</option>)}</select></label>
          <div className="draftFieldFooter"><span className="draftMutedText">{category ? (locale === "de" ? `Ausgewählte Kategorie-ID: ${category}` : locale === "en" ? `Selected category ID: ${category}` : `Seçili kategori kimliği: ${category}`) : (locale === "de" ? "Vor dem Veröffentlichen eine Kategorie auswählen." : locale === "en" ? "Choose a category before publishing." : "Yayınlamadan önce bir kategori seçin.")}</span><button type="button" className="draftSecondaryButton" disabled={loadingCategories || !storeId} onClick={() => void loadCategorySuggestions()}>{loadingCategories ? <LoaderCircle size={15} className="draftSpin" /> : <RefreshCw size={15} />}{locale === "de" ? "Vorschläge neu laden" : locale === "en" ? "Refresh suggestions" : "Önerileri yenile"}</button></div>
          {categorySuggestionError ? <p className="draftTitleHint" role="status">{categorySuggestionError} {locale === "de" ? "Bitte eBay-Konto prüfen und erneut laden." : locale === "en" ? "Check the eBay connection and retry." : "eBay bağlantısını kontrol edip tekrar deneyin."}</p> : null}
          <label className="draftFieldLabel">{locale === "de" ? "Kategorie-ID manuell eingeben" : locale === "en" ? "Enter category ID manually" : "Kategori kimliğini elle gir"}<input inputMode="numeric" value={category} onChange={(event) => { categoryTouched.current = true; setCategory(event.target.value.replace(/\D/g, "").slice(0, 20)); }} placeholder={defaultCategoryId || "z. B. 63073"} /></label>
        </section>

        {category.trim() && (loadingAspects || aspectsError || requiredAspects.length > 0) ? <section className="draftEditorSection">
          <div className="draftSectionHeading"><div><h3>{locale === "de" ? "eBay-Pflichtmerkmale" : locale === "en" ? "Required eBay item specifics" : "eBay zorunlu ürün özellikleri"}</h3><p>{locale === "de" ? "Diese Angaben hängen von der gewählten Kategorie ab und werden vor dem Veröffentlichen geprüft." : locale === "en" ? "These fields depend on the selected category and are checked before publishing." : "Bu alanlar seçilen kategoriye göre belirlenir ve yayınlamadan önce kontrol edilir."}</p></div></div>
          {loadingAspects ? <p className="draftMutedText">{locale === "de" ? "Kategorieanforderungen werden geladen …" : locale === "en" ? "Loading category requirements …" : "Kategori gereklilikleri yükleniyor …"}</p> : null}
          {aspectsError ? <p className="draftTitleHint" role="alert">{aspectsError}</p> : null}
          {requiredAspects.map((field) => <label className="draftFieldLabel" key={field.name}>{field.name}{field.required ? " *" : ""}{field.choices.length ? <select value={field.value} onChange={(event) => setRequiredAspects((current) => current.map((entry) => entry.name === field.name ? { ...entry, value: event.target.value } : entry))}><option value="">{locale === "de" ? "Bitte auswählen …" : locale === "en" ? "Select …" : "Seçin …"}</option>{field.choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}</select> : <input value={field.value} onChange={(event) => setRequiredAspects((current) => current.map((entry) => entry.name === field.name ? { ...entry, value: event.target.value.slice(0, 100) } : entry))} placeholder={locale === "de" ? "Produktangabe eingeben" : locale === "en" ? "Enter product detail" : "Ürün bilgisini girin"} />}</label>)}
        </section> : null}

        <section className="draftEditorSection">
          <div className="draftSectionHeading"><div><h3>{locale === "de" ? "Preis & Marge" : locale === "en" ? "Price & Margin" : "Fiyat ve Marj"}</h3><p>{locale === "de" ? "Vorschau berücksichtigt 13 % eBay- und 2 % Zahlungsgebühren." : locale === "en" ? "Preview accounts for 13% eBay and 2% payment fees." : "Önizleme %13 eBay ve %2 ödeme komisyonunu dikkate alır."}</p></div></div>
          <div className="draftPriceFields">
            <label className="draftFieldLabel">{locale === "de" ? "Amazon-Einkaufspreis" : locale === "en" ? "Amazon cost price" : "Amazon alış fiyatı"}<input value={sourcePrice == null ? "—" : euro.format(Number(sourcePrice))} readOnly /></label>
            <label className="draftFieldLabel">{locale === "de" ? "Zielmarge (%)" : locale === "en" ? "Target margin (%)" : "Hedef marj (%)"}<input type="number" min="0" max="300" step="0.1" value={margin} onChange={(event) => setMargin(event.target.value)} /></label>
            <label className="draftFieldLabel">{locale === "de" ? "Versandkosten (€)" : locale === "en" ? "Shipping cost (€)" : "Kargo (€)"}<input type="number" min="0" step="0.01" value={shipping} onChange={(event) => setShipping(event.target.value)} /></label>
          </div>
          <label className="draftFieldLabel draftManualPriceField">{locale === "de" ? "Gewünschter eBay-Verkaufspreis (€) · optional" : locale === "en" ? "Desired eBay sale price (€) · optional" : "İstediğiniz eBay satış fiyatı (€) · isteğe bağlı"}<input type="number" min="0.01" max="1000000" step="0.01" value={manualSalePrice} onChange={(event) => setManualSalePrice(event.target.value)} placeholder={calculatedTarget == null ? "—" : calculatedTarget.toFixed(2)} /><small>{locale === "de" ? "Leer lassen = automatische Berechnung. Ein eingetragener Preis bleibt auch in der laufenden Überwachung fest." : locale === "en" ? "Leave blank for automatic pricing. An entered price stays fixed during monitoring." : "Boş bırakılırsa otomatik hesaplanır. Girilen fiyat izleme süresince sabit kalır."}</small></label>
          {sourcePrice == null ? <button type="button" className="draftSecondaryButton" disabled={refreshingPrice} onClick={() => void refreshAmazonPrice()}>{refreshingPrice ? <LoaderCircle size={16} className="draftSpin" /> : <RefreshCw size={16} />} {locale === "de" ? "Amazon-Preis erneut laden" : locale === "en" ? "Retry Amazon price" : "Amazon fiyatını yeniden al"}</button> : null}
          {dedupingImages ? <p className="draftMutedText">{locale === "de" ? "Doppelte Bilder werden geprüft …" : locale === "en" ? "Checking duplicate images …" : "Yinelenen görseller kontrol ediliyor …"}</p> : null}
          <div className="draftPricePreview"><span>{manualSalePrice.trim() ? (locale === "de" ? "Manuell festgelegter eBay-Verkaufspreis" : locale === "en" ? "Manually set eBay sale price" : "Elle belirlenen eBay satış fiyatı") : (locale === "de" ? "Berechneter eBay-Verkaufspreis" : locale === "en" ? "Calculated eBay sale price" : "Hesaplanan eBay satış fiyatı")}</span><strong>{target == null ? (locale === "de" ? "Preis fehlt" : locale === "en" ? "Price missing" : "Fiyat eksik") : euro.format(target)}</strong></div>
        </section>

        <section className="draftEditorSection">
          <div className="draftSectionHeading"><div><h3>{locale === "de" ? "Beschreibung" : locale === "en" ? "Description" : "Açıklama"}</h3><p>{locale === "de" ? "HTML wird bei der Veröffentlichung als eBay-Beschreibung verwendet." : locale === "en" ? "HTML is used as the eBay item description when published." : "HTML, yayınlandığında eBay ürün açıklaması olarak kullanılır."}</p></div><button type="button" className="draftTextButton" disabled={optimizing} onClick={optimizeTitle}><RefreshCw size={15} /> {locale === "de" ? "KI-Titel & HTML neu erstellen" : locale === "en" ? "Regenerate AI title & HTML" : "Yapay zekâ başlık ve HTML oluştur"}</button></div>
          <textarea className="draftDescriptionInput" value={description} onChange={(event) => setDescription(event.target.value)} rows={9} placeholder={locale === "de" ? "Produktbeschreibung oder HTML einfügen …" : locale === "en" ? "Paste product description or HTML …" : "Ürün açıklaması veya HTML yapıştırın …"} />
          <iframe title="eBay HTML açıklama önizlemesi" sandbox="" srcDoc={description} style={{ width: "100%", height: 420, border: "1px solid #334155", borderRadius: 12, background: "white" }} />
        </section>
      </div>
      <footer className="draftModalFooter">
        <button className="draftSecondaryButton" type="button" disabled={busy || dedupingImages} onClick={onClose}>{locale === "de" ? "Abbrechen" : locale === "en" ? "Cancel" : "İptal"}</button>
        <button className="draftPrimaryButton" type="button" disabled={busy || titleInvalid} onClick={() => void submit(false)}>{busy && !optimizing ? <LoaderCircle size={16} className="draftSpin" /> : null} {locale === "de" ? "Änderungen speichern" : locale === "en" ? "Save changes" : "Değişiklikleri kaydet"}</button>
        <button className="draftPublishButton" type="button" disabled={busy || dedupingImages || titleInvalid || target == null || images.length === 0} onClick={() => void submit(true)}>{busy && !optimizing ? <LoaderCircle size={16} className="draftSpin" /> : null} {locale === "de" ? "Speichern & veröffentlichen" : locale === "en" ? "Save & publish" : "Kaydet ve yayınla"}</button>
      </footer>
    </section>
  </div>;
}
