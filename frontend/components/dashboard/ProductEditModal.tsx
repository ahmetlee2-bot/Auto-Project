"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, ImagePlus, LoaderCircle, Sparkles, X } from "lucide-react";
import { calculateDraftTargetPrice } from "../../lib/drafts/pricing";
import type { DraftEditInput, DraftProduct } from "../../lib/drafts/types";
import { useLocale } from "../../lib/locale";

type Props = {
  draft: DraftProduct | null;
  defaultCategoryId?: string;
  onClose: () => void;
  onSave: (id: string, input: DraftEditInput, publish: boolean) => Promise<void>;
};

const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const ebayTemplate = `<section style="font-family:Arial,sans-serif;max-width:900px;margin:auto;color:#1f2937;line-height:1.6"><h2>Produktbeschreibung</h2><p>Bitte prüfe die Produktdetails und Lieferinformationen vor dem Kauf.</p><ul><li>Originalprodukt gemäß Titel und Bildern</li><li>Sicher verpackt und zuverlässig versendet</li><li>Bei Fragen hilft unser Kundenservice gerne weiter</li></ul></section>`;

export function ProductEditModal({ draft, defaultCategoryId, onClose, onSave }: Props) {
  const { locale } = useLocale();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState("");
  const [category, setCategory] = useState("");
  const [margin, setMargin] = useState("20");
  const [shipping, setShipping] = useState("0");
  const [applyFrame, setApplyFrame] = useState(true);
  const [busy, setBusy] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!draft) return;
    setTitle(draft.title || "");
    setDescription(draft.description_html || "");
    setImages(Array.isArray(draft.images) ? draft.images : []);
    setCategory(draft.selected_category_id || "");
    setMargin(String(draft.profit_margin_percent ?? 20));
    setShipping(String(draft.shipping_cost ?? 0));
    setApplyFrame(draft.apply_custom_frame !== false);
    setError("");
  }, [draft]);

  if (!draft) return null;
  const target = calculateDraftTargetPrice({ source_price: draft.source_price, shipping_cost: shipping, profit_margin_percent: margin });
  const titleInvalid = !title.trim() || title.length > 80;

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
    setOptimizing(true);
    setError("");
    try {
      const response = await fetch("/api/drafts/optimize-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Titel konnte nicht optimiert werden.");
      setTitle(String(body.title || "").slice(0, 80));
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
    setBusy(true);
    setError("");
    try {
      await onSave(draft.id, {
        title: title.trim(),
        description_html: description,
        images,
        selected_category_id: category.trim() || null,
        profit_margin_percent: parsedMargin,
        shipping_cost: parsedShipping,
        apply_custom_frame: applyFrame,
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
        <button className="draftIconButton" type="button" aria-label={locale === "de" ? "Schließen" : locale === "en" ? "Close" : "Kapat"} disabled={busy} onClick={onClose}><X size={19} /></button>
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
          <textarea className={`draftTitleInput ${title.length > 80 ? "invalid" : ""}`} value={title} maxLength={160} rows={3} onChange={(event) => setTitle(event.target.value)} />
          <div className="draftFieldFooter"><span className={title.length > 80 ? "draftDangerText" : "draftMutedText"}>{title.length}/80 {locale === "de" ? "Zeichen" : locale === "en" ? "characters" : "karakter"}</span><button type="button" className="draftSecondaryButton" disabled={optimizing} onClick={() => void optimizeTitle()}>{optimizing ? <LoaderCircle size={16} className="draftSpin" /> : <Sparkles size={16} />} {locale === "de" ? "KI-Titel optimieren" : locale === "en" ? "Optimize title with AI" : "Yapay zeka ile başlığı optimize et"}</button></div>
          <label className="draftFieldLabel">{locale === "de" ? "eBay-Kategorie-ID (optional)" : locale === "en" ? "eBay Category ID (optional)" : "eBay Kategori Kimliği (isteğe bağlı)"}<input value={category} onChange={(event) => setCategory(event.target.value)} placeholder={defaultCategoryId || "z. B. 123456"} /></label>
        </section>

        <section className="draftEditorSection">
          <div className="draftSectionHeading"><div><h3>{locale === "de" ? "Preis & Marge" : locale === "en" ? "Price & Margin" : "Fiyat ve Marj"}</h3><p>{locale === "de" ? "Vorschau berücksichtigt 13 % eBay- und 2 % Zahlungsgebühren." : locale === "en" ? "Preview accounts for 13% eBay and 2% payment fees." : "Önizleme %13 eBay ve %2 ödeme komisyonunu dikkate alır."}</p></div></div>
          <div className="draftPriceFields">
            <label className="draftFieldLabel">{locale === "de" ? "Amazon-Einkaufspreis" : locale === "en" ? "Amazon cost price" : "Amazon alış fiyatı"}<input value={draft.source_price == null ? "—" : euro.format(Number(draft.source_price))} readOnly /></label>
            <label className="draftFieldLabel">{locale === "de" ? "Zielmarge (%)" : locale === "en" ? "Target margin (%)" : "Hedef marj (%)"}<input type="number" min="0" max="300" step="0.1" value={margin} onChange={(event) => setMargin(event.target.value)} /></label>
            <label className="draftFieldLabel">{locale === "de" ? "Versandkosten (€)" : locale === "en" ? "Shipping cost (€)" : "Kargo (€)"}<input type="number" min="0" step="0.01" value={shipping} onChange={(event) => setShipping(event.target.value)} /></label>
          </div>
          <div className="draftPricePreview"><span>{locale === "de" ? "Berechneter eBay-Verkaufspreis" : locale === "en" ? "Calculated eBay sale price" : "Hesaplanan eBay satış fiyatı"}</span><strong>{target == null ? (locale === "de" ? "Amazon-Preis fehlt" : locale === "en" ? "Amazon price missing" : "Amazon fiyatı eksik") : euro.format(target)}</strong></div>
        </section>

        <section className="draftEditorSection">
          <div className="draftSectionHeading"><div><h3>{locale === "de" ? "Beschreibung" : locale === "en" ? "Description" : "Açıklama"}</h3><p>{locale === "de" ? "HTML wird bei der Veröffentlichung als eBay-Beschreibung verwendet." : locale === "en" ? "HTML is used as the eBay item description when published." : "HTML, yayınlandığında eBay ürün açıklaması olarak kullanılır."}</p></div><button type="button" className="draftTextButton" onClick={() => setDescription(ebayTemplate)}>{locale === "de" ? "eBay-Vorlage anwenden" : locale === "en" ? "Apply eBay template" : "eBay şablonunu uygula"}</button></div>
          <textarea className="draftDescriptionInput" value={description} onChange={(event) => setDescription(event.target.value)} rows={9} placeholder={locale === "de" ? "Produktbeschreibung oder HTML einfügen …" : locale === "en" ? "Paste product description or HTML …" : "Ürün açıklaması veya HTML yapıştırın …"} />
        </section>
      </div>
      <footer className="draftModalFooter">
        <button className="draftSecondaryButton" type="button" disabled={busy} onClick={onClose}>{locale === "de" ? "Abbrechen" : locale === "en" ? "Cancel" : "İptal"}</button>
        <button className="draftPrimaryButton" type="button" disabled={busy || titleInvalid} onClick={() => void submit(false)}>{busy && !optimizing ? <LoaderCircle size={16} className="draftSpin" /> : null} {locale === "de" ? "Änderungen speichern" : locale === "en" ? "Save changes" : "Değişiklikleri kaydet"}</button>
        <button className="draftPublishButton" type="button" disabled={busy || titleInvalid || target == null || images.length === 0} onClick={() => void submit(true)}>{busy && !optimizing ? <LoaderCircle size={16} className="draftSpin" /> : null} {locale === "de" ? "Speichern & veröffentlichen" : locale === "en" ? "Save & publish" : "Kaydet ve yayınla"}</button>
      </footer>
    </section>
  </div>;
}
