"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, ExternalLink, LoaderCircle, PackageCheck, Pencil, RefreshCw, Rocket, Settings2, Trash2 } from "lucide-react";
import { calculateDraftTargetPrice, estimateDraftNetProfit } from "../../lib/drafts/pricing";
import type { DraftEditInput, DraftProduct } from "../../lib/drafts/types";
import { useLocale } from "../../lib/locale";
import { useStores } from "../../lib/ebay/StoreContext";
import { ProductEditModal } from "./ProductEditModal";

type Option = { id: string; name: string };
type PublishSettings = { merchantLocationKey: string; fulfillmentPolicyId: string; paymentPolicyId: string; returnPolicyId: string };
type EbaySetup = {
  storeId: string | null;
  marketplaceId: string;
  merchantLocations: Option[];
  fulfillmentPolicies: Option[];
  paymentPolicies: Option[];
  returnPolicies: Option[];
  defaults: PublishSettings & { categoryId: string };
};
type PublishResult = { id: string; jobId: string; status: "queued" | "processing"; queuePosition: number | null };
type DraftListingJob = { id: string; draft_id: string; status: "queued" | "processing" | "completed" | "failed"; progress: number; current_step: string; queue_position: number | null; last_error: string | null };

const settingsStorageKey = "autolister-ebay-listing-settings-v1";
const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

async function responseJson(response: Response) {
  return response.json().catch(() => ({})) as Promise<Record<string, any>>;
}

export function DraftsTab() {
  const { locale } = useLocale();
  const { stores, selectedStoreId } = useStores();
  const effectiveStoreId = selectedStoreId === "ALL_STORES"
    ? stores.find((store) => store.status === "active" && store.marketplace_id === "EBAY_DE")?.id
    : selectedStoreId;
  const [drafts, setDrafts] = useState<DraftProduct[]>([]);
  const [listingJobs, setListingJobs] = useState<DraftListingJob[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<DraftProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [setup, setSetup] = useState<EbaySetup | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settings, setSettings] = useState<PublishSettings>({ merchantLocationKey: "", fulfillmentPolicyId: "", paymentPolicyId: "", returnPolicyId: "" });
  const [setupError, setSetupError] = useState("");
  const [locationCity, setLocationCity] = useState("Augsburg");
  const [locationPostalCode, setLocationPostalCode] = useState("86150");
  const [creatingLocation, setCreatingLocation] = useState(false);
  const [supplierUrl, setSupplierUrl] = useState("");
  const [importingSupplier, setImportingSupplier] = useState(false);

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/drafts", { cache: "no-store" });
      const body = await responseJson(response);
      if (!response.ok) throw new Error(body.error || (locale === "de" ? "Entwürfe konnten nicht geladen werden." : locale === "en" ? "Drafts could not be loaded." : "Taslaklar yüklenemedi."));
      setDrafts((body.drafts || []) as DraftProduct[]);
      setSelected((current) => current.filter((id) => (body.drafts || []).some((draft: DraftProduct) => draft.id === id)));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (locale === "de" ? "Entwürfe konnten nicht geladen werden." : locale === "en" ? "Drafts could not be loaded." : "Taslaklar yüklenemedi."));
    } finally {
      setLoading(false);
    }
  }, [locale]);

  const loadListingJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/drafts/jobs", { cache: "no-store" });
      if (!response.ok) return;
      const body = await responseJson(response);
      setListingJobs((body.jobs || []) as DraftListingJob[]);
    } catch { /* The queue widget and next poll will recover. */ }
  }, []);

  const loadSetup = useCallback(async () => {
    setSetupError("");
    try {
      const query = effectiveStoreId ? `?storeId=${encodeURIComponent(effectiveStoreId)}` : "";
      const response = await fetch(`/api/drafts/ebay-settings${query}`, { cache: "no-store" });
      const body = await responseJson(response);
      if (!response.ok) throw new Error(body.error || (locale === "de" ? "eBay-Einstellungen konnten nicht geladen werden." : locale === "en" ? "eBay settings could not be loaded." : "eBay ayarları yüklenemedi."));
      const result = body as EbaySetup;
      setSetup(result);
      const storageKey = `${settingsStorageKey}:${result.storeId || "legacy"}`;
      let stored: Partial<PublishSettings> = {};
      try { stored = JSON.parse(window.localStorage.getItem(storageKey) || "{}"); } catch { /* Use account defaults. */ }
      const choose = (candidate: string | undefined, options: Option[], fallback: string, allowManual = false) => {
        if (candidate && (options.some((option) => option.id === candidate) || candidate === fallback)) return candidate;
        if (allowManual && candidate && /^[A-Za-z0-9_-]{1,64}$/.test(candidate)) return candidate;
        return fallback || (options.length === 1 ? options[0].id : "");
      };
      setSettings({
        merchantLocationKey: choose(stored.merchantLocationKey, result.merchantLocations, result.defaults.merchantLocationKey),
        fulfillmentPolicyId: choose(stored.fulfillmentPolicyId, result.fulfillmentPolicies, result.defaults.fulfillmentPolicyId, true),
        paymentPolicyId: choose(stored.paymentPolicyId, result.paymentPolicies, result.defaults.paymentPolicyId, true),
        returnPolicyId: choose(stored.returnPolicyId, result.returnPolicies, result.defaults.returnPolicyId, true),
      });
    } catch (cause) {
      setSetupError(cause instanceof Error ? cause.message : (locale === "de" ? "eBay-Einstellungen konnten nicht geladen werden." : locale === "en" ? "eBay settings could not be loaded." : "eBay ayarları yüklenemedi."));
    }
  }, [locale, effectiveStoreId]);

  useEffect(() => { void loadDrafts(); void loadSetup(); }, [loadDrafts, loadSetup]);
  useEffect(() => {
    void loadListingJobs();
    const timer = window.setInterval(() => void loadListingJobs(), 3000);
    const changed = () => { void loadListingJobs(); void loadDrafts(); };
    window.addEventListener("draft-listing-jobs-changed", changed);
    return () => { window.clearInterval(timer); window.removeEventListener("draft-listing-jobs-changed", changed); };
  }, [loadDrafts, loadListingJobs]);
  useEffect(() => {
    const openRequestedDraft = () => {
      const id = window.sessionStorage.getItem("autolister-edit-draft-id");
      const draft = id ? drafts.find((item) => item.id === id) : null;
      if (draft) { setEditing(draft); window.sessionStorage.removeItem("autolister-edit-draft-id"); }
    };
    openRequestedDraft();
    window.addEventListener("draft-edit-request", openRequestedDraft);
    return () => window.removeEventListener("draft-edit-request", openRequestedDraft);
  }, [drafts]);
  useEffect(() => {
    if (settings.merchantLocationKey || settings.fulfillmentPolicyId || settings.paymentPolicyId || settings.returnPolicyId) {
      window.localStorage.setItem(`${settingsStorageKey}:${setup?.storeId || "legacy"}`, JSON.stringify(settings));
    }
  }, [settings, setup?.storeId]);

  const selectableDrafts = useMemo(() => drafts.filter((draft) => draft.status === "draft" || draft.status === "error"), [drafts]);
  const allSelected = selectableDrafts.length > 0 && selectableDrafts.every((draft) => selected.includes(draft.id));
  const settingsReady = Boolean(settings.merchantLocationKey && settings.fulfillmentPolicyId && settings.paymentPolicyId && settings.returnPolicyId);

  async function createLocation() {
    if (!setup?.storeId) return;
    setCreatingLocation(true);
    setSetupError("");
    try {
      const response = await fetch("/api/drafts/ebay-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "createDefaultLocation", storeId: setup.storeId, city: locationCity, postalCode: locationPostalCode }) });
      const body = await responseJson(response);
      if (!response.ok) throw new Error(body.error || "eBay-Standort konnte nicht erstellt werden.");
      await loadSetup();
      setNotice(locale === "de" ? "Versandstandort ist ausgewählt." : locale === "en" ? "Shipping location selected." : "Satış konumu seçildi.");
    } catch (cause) {
      setSetupError(cause instanceof Error ? cause.message : "eBay-Standort konnte nicht erstellt werden.");
    } finally { setCreatingLocation(false); }
  }
  async function importSupplierProduct() {
    setImportingSupplier(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/drafts/import-supplier", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({sourceUrl:supplierUrl.trim()}) });
      const body = await responseJson(response);
      if (!response.ok) throw new Error(body.error || "Produkt konnte nicht importiert werden.");
      setSupplierUrl("");
      setNotice(body.needsReview ? "Taslak oluşturuldu; eksik başlık/fiyat/görselleri düzenleme ekranında tamamlayın." : "Ürün taslağa aktarıldı.");
      await loadDrafts();
      if (body.draftId) setEditing((await fetch("/api/drafts",{cache:"no-store"}).then(responseJson)).drafts?.find((d:DraftProduct)=>d.id===body.draftId)||null);
    } catch(cause) { setError(cause instanceof Error ? cause.message : "Ürün içe aktarılamadı."); }
    finally { setImportingSupplier(false); }
  }
  const canDeleteSelection = selected.every((id) => !drafts.find((draft) => draft.id === id)?.ebay_item_id);

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function requestPublish(ids: string[], confirmRights = true): Promise<string[]> {
    if (!ids.length) return [];
    if (!settingsReady) {
      setSetupError(locale === "de" ? "Wähle zuerst Standort sowie Versand-, Zahlungs- und Rückgaberichtlinie für dein eBay-Konto." : locale === "en" ? "Please select your location and shipping, payment, and return policies for your eBay account first." : "Lütfen önce eBay hesabınız için konum ile kargo, ödeme ve iade politikalarını seçin.");
      throw new Error(locale === "de" ? "eBay-Veröffentlichungseinstellungen fehlen." : locale === "en" ? "Missing eBay publishing settings." : "eBay yayınlama ayarları eksik.");
    }
    if (confirmRights && !window.confirm(locale === "de" ? "Die Produktbilder und Angaben werden auf eBay veröffentlicht. Bestätigst du, dass du die notwendigen Rechte an den Bildern und Inhalten besitzt?" : locale === "en" ? "Product images and details will be published on eBay. Do you confirm that you hold the necessary rights to the images and content?" : "Ürün görselleri ve bilgileri eBay'de yayınlanacaktır. Görseller ve içerik için gerekli kullanım haklarına sahip olduğunuzu onaylıyor musunuz?")) return [];
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/drafts/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, imageRightsConfirmed: true, storeId: setup?.storeId, settings }) });
      const body = await responseJson(response);
      if (!response.ok) throw new Error(body.error || "Listeauftrag konnte nicht eingereiht werden.");
      const jobs = (body.jobs || []) as Array<PublishResult & { draft_id: string }>;
      const queuedIds = jobs.map((job) => job.draft_id).filter(Boolean);
      setSelected((current) => current.filter((id) => !queuedIds.includes(id)));
      if (editing && queuedIds.includes(editing.id)) setEditing(null);
      setNotice(locale === "de" ? `${queuedIds.length} Produkt(e) eingereiht. Die Veröffentlichung läuft im Hintergrund weiter.` : locale === "en" ? `${queuedIds.length} product(s) queued. Publishing will continue in the background.` : `${queuedIds.length} ürün listeleme kuyruğuna alındı. İşlem arka planda devam ediyor.`);
      window.dispatchEvent(new Event("draft-listing-jobs-changed"));
      void loadDrafts();
      void loadListingJobs();
      return queuedIds;
    } catch (cause) {
      if (cause instanceof Error) setError(cause.message);
      throw cause;
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft(id: string, input: DraftEditInput, publishAfterSave: boolean) {
    if (publishAfterSave && !window.confirm(locale === "de" ? "Die Produktbilder und Angaben werden nach dem Speichern auf eBay veröffentlicht. Bestätigst du, dass du die notwendigen Rechte daran besitzt?" : locale === "en" ? "The product images and details will be published on eBay after saving. Do you confirm that you hold the necessary rights?" : "Ürün görselleri ve bilgileri kaydedildikten sonra eBay'de yayınlanacaktır. Gerekli haklara sahip olduğunuzu onaylıyor musunuz?")) {
      throw new Error(locale === "de" ? "Veröffentlichung abgebrochen." : locale === "en" ? "Publishing cancelled." : "Yayınlama iptal edildi.");
    }
    if (publishAfterSave && !settingsReady) throw new Error(locale === "de" ? "Wähle zuerst die eBay-Standort- und Richtlinieneinstellungen aus." : locale === "en" ? "Please select your eBay location and policy settings first." : "Lütfen önce eBay konum ve politika ayarlarını seçin.");
    const response = await fetch(`/api/drafts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const body = await responseJson(response);
    if (!response.ok) throw new Error(body.error || "Entwurf konnte nicht gespeichert werden.");
    setDrafts((current) => current.map((draft) => draft.id === id ? body.draft as DraftProduct : draft));
    if (publishAfterSave) {
      const published = await requestPublish([id], false);
      if (published.includes(id)) setEditing(null);
    } else {
      setNotice(locale === "de" ? "Änderungen wurden im Entwurf gespeichert." : locale === "en" ? "Changes saved to draft." : "Değişiklikler taslağa kaydedildi.");
      setEditing(null);
    }
  }

  async function retryListing(draftId: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/drafts/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "retry", draftId }) });
      const body = await responseJson(response);
      if (!response.ok) throw new Error(body.error || "Listeauftrag konnte nicht erneut eingereiht werden.");
      setNotice("Listeauftrag erneut eingereiht. Die Verarbeitung läuft im Hintergrund.");
      await Promise.all([loadDrafts(), loadListingJobs()]);
      window.dispatchEvent(new Event("draft-listing-jobs-changed"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Listeauftrag konnte nicht erneut eingereiht werden."); }
    finally { setBusy(false); }
  }

  async function deleteDrafts(ids: string[]) {
    if (!ids.length || !window.confirm(locale === "de" ? `${ids.length} Entwurf/Entwürfe dauerhaft aus dem Pool entfernen?` : locale === "en" ? `Permanently remove ${ids.length} draft(s) from the pool?` : `${ids.length} taslak havuzdan kalıcı olarak silinsin mi?`)) return;
    setBusy(true);
    setError("");
    try {
      const deletedIds: string[] = [];
      for (let offset = 0; offset < ids.length; offset += 200) {
        const response = await fetch("/api/drafts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: ids.slice(offset, offset + 200) }) });
        const body = await responseJson(response);
        if (!response.ok) throw new Error(body.error || "Entwürfe konnten nicht gelöscht werden.");
        deletedIds.push(...(body.deletedIds || []));
      }
      setNotice(locale === "de" ? `${deletedIds.length} Entwurf/Entwürfe entfernt.` : locale === "en" ? `${deletedIds.length} draft(s) removed.` : `${deletedIds.length} taslak kaldırıldı.`);
      setSelected((current) => current.filter((id) => !deletedIds.includes(id)));
      await loadDrafts();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Entwürfe konnten nicht gelöscht werden.");
    } finally {
      setBusy(false);
    }
  }

  async function bulkMargin() {
    const value = window.prompt(locale === "de" ? "Neue Zielmarge für die ausgewählten Entwürfe in Prozent:" : locale === "en" ? "New target margin (%) for selected drafts:" : "Seçili taslaklar için yeni hedef kâr marjı (%):", "20");
    if (value === null) return;
    const margin = Number(value.replace(",", "."));
    if (!Number.isFinite(margin) || margin < 0 || margin > 300) {
      setError(locale === "de" ? "Die Zielmarge muss zwischen 0 und 300 % liegen." : locale === "en" ? "Target margin must be between 0 and 300%." : "Hedef marj %0 ile %300 arasında olmalıdır.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      let updatedCount = 0;
      for (let offset = 0; offset < selected.length; offset += 200) {
        const response = await fetch("/api/drafts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: selected.slice(offset, offset + 200), profit_margin_percent: margin }) });
        const body = await responseJson(response);
        if (!response.ok) throw new Error(body.error || "Zielmarge konnte nicht geändert werden.");
        updatedCount += (body.updatedIds || []).length;
      }
      setNotice(locale === "de" ? `Zielmarge für ${updatedCount} Entwurf/Entwürfe auf ${margin} % gesetzt.` : locale === "en" ? `Target margin set to ${margin}% for ${updatedCount} draft(s).` : `${updatedCount} taslak için hedef marj %${margin} olarak ayarlandı.`);
      await loadDrafts();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Zielmarge konnte nicht geändert werden.");
    } finally {
      setBusy(false);
    }
  }

  function updateSetting(key: keyof PublishSettings, value: string) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function settingSelect(label: string, key: keyof PublishSettings, options: Option[]) {
    const value = settings[key];
    return <label className="draftSelectLabel">{label}<select value={value} onChange={(event) => updateSetting(key, event.target.value)}>
      <option value="">{locale === "de" ? "Bitte auswählen" : locale === "en" ? "Please select" : "Lütfen seçin"}</option>
      {value && !options.some((option) => option.id === value) ? <option value={value}>{locale === "de" ? "Gespeicherte / manuelle ID" : locale === "en" ? "Saved / manual ID" : "Kaydedilmiş / manuel ID"} · {value}</option> : null}
      {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
    </select></label>;
  }

  function manualPolicyInput(label: string, key: "fulfillmentPolicyId" | "paymentPolicyId" | "returnPolicyId") {
    return <label className="draftSelectLabel">{label}<input inputMode="numeric" autoComplete="off" value={settings[key]} onChange={(event) => updateSetting(key, event.target.value.trim())} placeholder={locale === "de" ? "Policy-ID eingeben" : locale === "en" ? "Enter policy ID" : "Politika ID'si girin"} /></label>;
  }

  async function saveSettings() {
    if (!setup?.storeId || !settingsReady) return;
    setSavingSettings(true);
    setSetupError("");
    try {
      const response = await fetch("/api/drafts/ebay-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: setup.storeId, settings }),
      });
      const body = await responseJson(response);
      if (!response.ok) throw new Error(body.error || "eBay-Einstellungen konnten nicht gespeichert werden.");
      setNotice(locale === "de" ? "Standort und Richtlinien-IDs wurden für diesen Shop gespeichert." : locale === "en" ? "Location and policy IDs were saved for this store." : "Konum ve politika ID'leri bu mağaza için kaydedildi.");
    } catch (cause) {
      setSetupError(cause instanceof Error ? cause.message : "eBay-Einstellungen konnten nicht gespeichert werden.");
    } finally {
      setSavingSettings(false);
    }
  }

  return <section className="draftsModule">
    <header className="draftsHeader">
      <div>
        <span className="draftEyebrow">{locale === "de" ? "SOURCING · eBAY-ENTWÜRFE" : locale === "en" ? "SOURCING · eBAY DRAFTS" : "ÜRÜN HAVUZU · eBAY TASLAKLARI"}</span>
        <h2>{locale === "de" ? "Produktentwürfe" : locale === "en" ? "Product drafts" : "Ürün taslakları"}</h2>
        <p>{locale === "de" ? "Prüfe Titel, Bilder und Marge vor der Veröffentlichung. Live-Angebote werden anschließend direkt zur Preis- und Bestandsüberwachung verknüpft." : locale === "en" ? "Review title, images, and margin before publishing. Live listings are automatically linked for price and stock monitoring." : "Yayınlamadan önce başlığı, görselleri ve kâr marjını kontrol edin. Canlı ilanlar sonrasında fiyat ve stok takibine otomatik bağlanır."}</p>
      </div>
      <button type="button" className="draftSecondaryButton" disabled={loading || busy} onClick={() => { void loadDrafts(); void loadSetup(); }}><RefreshCw size={16} /> {locale === "de" ? "Aktualisieren" : locale === "en" ? "Refresh" : "Yenile"}</button>
    </header>

    <section className="draftSetupCard"><div className="draftSetupHeading"><div><h3>{locale === "de" ? "Produkt vom Lieferanten übernehmen" : locale === "en" ? "Import a supplier product" : "Tedarikçiden ürün çek"}</h3><p>Amazon.de (ASIN/URL) oder Joybuy.de Produktlink einfügen.</p></div></div><div className="draftSetupSaveRow"><input aria-label="Amazon ASIN/URL oder Joybuy.de Produktlink" className="proInput" value={supplierUrl} onChange={(event)=>setSupplierUrl(event.target.value)} placeholder="Amazon.de (ASIN/URL) veya Joybuy.de ürün linki yapıştırın..." /><button type="button" className="draftPrimaryButton" disabled={importingSupplier||!supplierUrl.trim()} onClick={()=>void importSupplierProduct()}>{importingSupplier?"…":"Ürünü taslağa aktar"}</button></div><p className="draftMutedText">Joybuy erişimi kapalıysa ürün sayfasını açıp AutoLister eklentisinden aktarın.</p></section>

    <section className="draftSetupCard">
      <div className="draftSetupHeading"><div className="draftSetupIcon"><Settings2 size={18} /></div><div><h3>{locale === "de" ? "eBay-Veröffentlichung" : locale === "en" ? "eBay Publishing Setup" : "eBay Yayınlama Ayarları"}</h3><p>{locale === "de" ? "Standort und Richtlinien werden direkt aus deinem verbundenen Verkäuferkonto geladen." : locale === "en" ? "Location and business policies are loaded directly from your connected seller account." : "Konum ve iş politikaları doğrudan bağlı satıcı hesabınızdan yüklenir."}</p></div><span className={settingsReady ? "draftReadyBadge" : "draftNeedsSetupBadge"}>{settingsReady ? (locale === "de" ? "Konto bereit" : locale === "en" ? "Account ready" : "Hesap hazır") : (locale === "de" ? "Einrichtung nötig" : locale === "en" ? "Setup needed" : "Kurulum gerekli")}</span></div>
      {setupError ? <p className="draftAlert" role="alert">{setupError}</p> : null}
      {setup ? <div className="draftSetupFields">
        {settingSelect(locale === "de" ? "Verkaufsstandort" : locale === "en" ? "Merchant location" : "Satış konumu", "merchantLocationKey", setup.merchantLocations)}
        {settingSelect(locale === "de" ? "Versandrichtlinie" : locale === "en" ? "Shipping policy" : "Kargo politikası", "fulfillmentPolicyId", setup.fulfillmentPolicies)}
        {settingSelect(locale === "de" ? "Zahlungsrichtlinie" : locale === "en" ? "Payment policy" : "Ödeme politikası", "paymentPolicyId", setup.paymentPolicies)}
        {settingSelect(locale === "de" ? "Rückgaberichtlinie" : locale === "en" ? "Return policy" : "İade politikası", "returnPolicyId", setup.returnPolicies)}
      </div> : <p className="draftMutedText">{locale === "de" ? "eBay-Einstellungen werden geladen …" : locale === "en" ? "Loading eBay settings …" : "eBay ayarları yükleniyor …"}</p>}
      {setup ? <>
        <div className="draftSetupFields draftPolicyManualFields">
          {manualPolicyInput(locale === "de" ? "Versandrichtlinie · ID manuell" : locale === "en" ? "Shipping policy · manual ID" : "Kargo politikası · manuel ID", "fulfillmentPolicyId")}
          {manualPolicyInput(locale === "de" ? "Zahlungsrichtlinie · ID manuell" : locale === "en" ? "Payment policy · manual ID" : "Ödeme politikası · manuel ID", "paymentPolicyId")}
          {manualPolicyInput(locale === "de" ? "Rückgaberichtlinie · ID manuell" : locale === "en" ? "Return policy · manual ID" : "İade politikası · manuel ID", "returnPolicyId")}
        </div>
        {!setup.merchantLocations.length ? <p className="draftHint">{locale === "de" ? "eBay hat noch keinen Versandstandort zurückgegeben. Verwende den tatsächlichen Versandort." : locale === "en" ? "eBay has not returned a shipping location yet. Use the actual dispatch location." : "eBay henüz satış konumu döndürmedi. Gerçek gönderim yerini kullanın."}</p> : null}
        {setup.storeId ? <div className="draftSetupSaveRow"><label className="proLabel">{locale === "de" ? "Stadt" : locale === "en" ? "City" : "Şehir"}<input className="proInput" value={locationCity} onChange={(event) => setLocationCity(event.target.value)} /></label><label className="proLabel">{locale === "de" ? "Postleitzahl" : locale === "en" ? "Postal code" : "Posta kodu"}<input className="proInput" value={locationPostalCode} onChange={(event) => setLocationPostalCode(event.target.value)} /></label><button type="button" className="draftSecondaryButton" disabled={creatingLocation} onClick={() => void createLocation()}>{creatingLocation ? "…" : (locale === "de" ? "+ Standardstandort DE erstellen" : locale === "en" ? "+ Create default DE location" : "+ Varsayılan Almanya Konumu Oluştur (DE)")}</button></div> : null}
        {(!setup.fulfillmentPolicies.length || !setup.paymentPolicies.length || !setup.returnPolicies.length) ? <p className="draftHint">{locale === "de" ? "Die eBay-Berechtigung für Business Policies wird beim Verbinden automatisch aktiviert. Fehlende Richtlinien enthalten deine Versand- und Rückgabebedingungen; lege sie einmal im verbundenen eBay-Konto an. Danach erscheinen sie hier automatisch." : locale === "en" ? "Business Policy access is enabled automatically when a store connects. Missing policies contain your own shipping and return terms; create them once in the connected eBay account and they will load here automatically." : "Business Policies izni mağaza bağlanırken otomatik açılır. Eksik politikalar senin kargo ve iade koşullarını içerir; bağlı eBay hesabında bir kez oluşturduğunda burada otomatik görünür."}</p> : null}
        <div className="draftSetupSaveRow"><button type="button" className="draftSecondaryButton" disabled={savingSettings || !settingsReady || !setup.storeId} onClick={() => void saveSettings()}>{savingSettings ? (locale === "de" ? "Wird gespeichert …" : locale === "en" ? "Saving …" : "Kaydediliyor …") : (locale === "de" ? "Richtlinien-IDs für diesen Shop speichern" : locale === "en" ? "Save policy IDs for this store" : "Politika ID'lerini bu mağazaya kaydet")}</button></div>
      </> : null}
    </section>

    {error ? <p className="draftAlert" role="alert">{error}</p> : null}
    {notice ? <p className={`draftNotice ${/Yayınlamadan önce|Vor dem Veröffentlichen|Complete these fields|ergänze die erforderlichen/i.test(notice) ? "draftNoticeWarning" : ""}`} role="status">{/Yayınlamadan önce|Vor dem Veröffentlichen|Complete these fields|ergänze die erforderlichen/i.test(notice) ? <AlertCircle size={16} /> : <Check size={16} />} {notice}</p> : null}

    <div className="draftBulkBar">
      <label className="draftSelectAll"><input type="checkbox" checked={allSelected} disabled={!selectableDrafts.length || busy} onChange={(event) => setSelected(event.target.checked ? selectableDrafts.map((draft) => draft.id) : [])} /> {locale === "de" ? "Alle auswählen" : locale === "en" ? "Select all" : "Tümünü seç"} <span>{selected.length} {locale === "de" ? "ausgewählt" : locale === "en" ? "selected" : "seçildi"}</span></label>
      {selected.length ? <div className="draftBulkActions">
        <button type="button" className="draftPublishButton" disabled={busy || !settingsReady} onClick={() => { void requestPublish(selected).catch(() => undefined); }}><Rocket size={16} /> {busy ? (locale === "de" ? "Wird veröffentlicht …" : locale === "en" ? "Publishing …" : "Yayınlanıyor …") : (locale === "de" ? `Ausgewählte veröffentlichen (${selected.length})` : locale === "en" ? `Publish selected (${selected.length})` : `Seçilenleri yayınla (${selected.length})`)}</button>
        <button type="button" className="draftSecondaryButton" disabled={busy} onClick={() => void bulkMargin()}>{locale === "de" ? "Marge ändern" : locale === "en" ? "Change margin" : "Marjı değiştir"}</button>
        <button type="button" className="draftDangerButton" disabled={busy || !canDeleteSelection} onClick={() => void deleteDrafts(selected)}><Trash2 size={16} /> {locale === "de" ? "Ausgewählte löschen" : locale === "en" ? "Delete selected" : "Seçilenleri sil"}</button>
      </div> : null}
    </div>
    {selected.length && !canDeleteSelection ? <p className="draftHint">{locale === "de" ? "Ein ausgewählter Artikel ist bereits live. Verknüpfe zuerst die Überwachung; Live-Angebote lassen sich hier nicht als Entwurf löschen." : locale === "en" ? "A selected item is already live. Link monitoring first; live listings cannot be deleted as drafts here." : "Seçili bir ürün zaten yayında. Önce izlemeyi bağlayın; canlı ilanlar buradan taslak olarak silinemez."}</p> : null}

    {loading ? <div className="draftEmptyState"><LoaderCircle className="draftSpin" size={22} /> {locale === "de" ? "Entwürfe werden geladen …" : locale === "en" ? "Loading drafts …" : "Taslaklar yükleniyor …"}</div>
      : drafts.length === 0 ? <div className="draftEmptyState"><PackageCheck size={26} /><strong>{locale === "de" ? "Noch keine Produktentwürfe" : locale === "en" ? "No product drafts yet" : "Henüz ürün taslağı yok"}</strong><span>{locale === "de" ? "Übernimm Kandidaten aus deinem Favoritenpool oder sende Produkte an /api/drafts." : locale === "en" ? "Move candidates from your favorites pool or send products to /api/drafts." : "Favori havuzunuzdan ürün aktarın veya /api/drafts üzerinden gönderin."}</span></div>
      : <div className="draftProductGrid">{drafts.map((draft) => {
        const isSelectable = draft.status === "draft" || draft.status === "error";
        const listingJob = [...listingJobs].reverse().find((job) => job.draft_id === draft.id);
        const listingStatus = listingJob?.status === "queued" ? `Sırada (#${listingJob.queue_position || "…"})`
          : listingJob?.status === "processing" ? `Listeleniyor (%${listingJob.progress})`
            : listingJob?.status === "completed" ? "Yayında"
              : listingJob?.status === "failed" ? "Hatalı - Müdahale Gerekli"
                : draft.status === "draft" ? "Taslak" : draft.status === "publishing" ? "İşleniyor" : "Hata";
                const target = draft.manual_sale_price == null ? calculateDraftTargetPrice({ source_price: draft.source_price, shipping_cost: draft.shipping_cost, profit_margin_percent: draft.profit_margin_percent }) : Number(draft.manual_sale_price);
        const profit = estimateDraftNetProfit({ source_price: draft.source_price, shipping_cost: draft.shipping_cost, profit_margin_percent: draft.profit_margin_percent }, target);
        return <article className={`draftCard ${selected.includes(draft.id) ? "selected" : ""}`} key={draft.id}>
          <div className="draftCardTop"><label className="draftCheckbox"><input type="checkbox" checked={selected.includes(draft.id)} disabled={!isSelectable || busy} onChange={() => toggle(draft.id)} /><span className="sr-only">{locale === "de" ? "Entwurf auswählen" : locale === "en" ? "Select draft" : "Taslağı seç"}</span></label><span className={`draftStatus draftStatus-${listingJob?.status || draft.status}`}>{listingStatus}</span></div>
          {draft.images?.[0] ? <img className="draftCardImage" src={draft.images[0]} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className="draftCardImage draftCardNoImage">{locale === "de" ? "Bild fehlt" : locale === "en" ? "No image" : "Görsel yok"}</div>}
          <div className="draftCardContent"><div className="draftCardIdentity"><span>{draft.supplier === "joybuy_de" ? "Joybuy.de" : "Amazon.de"}</span><a href={draft.source_url || `https://www.amazon.de/dp/${draft.asin}`} target="_blank" rel="noopener noreferrer">Tedarikçide Aç ↗</a><span>{draft.title.length}/80</span></div><h3>{draft.title}</h3>
            <div className="draftPriceCompare"><div><small>{locale === "de" ? "Amazon Einkauf" : locale === "en" ? "Amazon cost" : "Amazon alış"}</small><strong>{draft.source_price == null ? (locale === "de" ? "Preis fehlt" : locale === "en" ? "Price missing" : "Fiyat eksik") : euro.format(Number(draft.source_price))}</strong></div><span aria-hidden="true">→</span><div><small>{locale === "de" ? "eBay Verkauf" : locale === "en" ? "eBay sale" : "eBay satış"}</small><strong>{target == null ? "—" : euro.format(target)}</strong></div></div>
            <div className="draftProfitLine"><span>{locale === "de" ? "Geschätzter Nettogewinn" : locale === "en" ? "Estimated net profit" : "Tahmini net kâr"}</span><strong className={profit != null && profit < 0 ? "draftDangerText" : ""}>{profit == null ? "—" : euro.format(profit)}</strong></div>
            <div className="draftCardMeta"><span>{locale === "de" ? "Marge" : locale === "en" ? "Margin" : "Marj"} {Number(draft.profit_margin_percent)} %</span><span>{locale === "de" ? "Versand" : locale === "en" ? "Shipping" : "Kargo"} {euro.format(Number(draft.shipping_cost))}</span><span>{draft.apply_custom_frame === false ? (locale === "de" ? "Originalcover" : locale === "en" ? "Original cover" : "Orijinal kapak") : (locale === "de" ? "Cover mit Rahmen" : locale === "en" ? "Framed cover" : "Çerçeveli kapak")}</span></div>
            {!draft.selected_category_id && !setup?.defaults.categoryId ? <p className="draftHint">{locale === "de" ? "eBay-Kategorie wird beim Bearbeiten vorgeschlagen." : locale === "en" ? "eBay category will be suggested when you edit." : "Düzenle ekranında eBay kategori önerileri gösterilecek."}</p> : null}
            {listingJob?.status === "processing" || listingJob?.status === "queued" ? <div className="draftListingProgress" aria-label={`Listeleme ${listingJob.progress}%`}><span style={{ width: `${Math.max(0, Math.min(100, listingJob.progress))}%` }} /><small>{listingJob.current_step}</small></div> : null}
            {(listingJob?.last_error || draft.last_error) ? <p className="draftCardError">{listingJob?.last_error || draft.last_error}</p> : null}
          </div>
          <footer className="draftCardActions">
            <button type="button" className="draftSecondaryButton" disabled={busy || !isSelectable || Boolean(draft.ebay_item_id)} onClick={() => setEditing(draft)}><Pencil size={15} /> {locale === "de" ? "Bearbeiten & prüfen" : locale === "en" ? "Edit & review" : "Düzenle ve kontrol et"}</button>
            {listingJob?.status === "failed" ? <button type="button" className="draftSecondaryButton" disabled={busy} onClick={() => void retryListing(draft.id)}><RefreshCw size={15} /> Tekrar dene</button> : null}
            <button type="button" className="draftPublishButton" disabled={busy || !isSelectable || !settingsReady || target == null || !draft.images?.length} onClick={() => { if (!draft.selected_category_id && !setup?.defaults.categoryId) { setEditing(draft); return; } void requestPublish([draft.id]).catch(() => undefined); }}><Rocket size={15} /> {!draft.selected_category_id && !setup?.defaults.categoryId ? (locale === "de" ? "Kategorie auswählen" : locale === "en" ? "Choose category" : "Kategori seç") : (locale === "de" ? "Jetzt veröffentlichen" : locale === "en" ? "Publish now" : "Şimdi yayınla")}</button>
            <button type="button" className="draftDangerLink" disabled={busy || !isSelectable || Boolean(draft.ebay_item_id)} onClick={() => void deleteDrafts([draft.id])}><Trash2 size={15} /> {locale === "de" ? "Entfernen" : locale === "en" ? "Remove" : "Kaldır"}</button>
          </footer>
        </article>;
      })}</div>}
    <ProductEditModal draft={editing} defaultCategoryId={setup?.defaults.categoryId} storeId={setup?.storeId || undefined} onClose={() => setEditing(null)} onSave={saveDraft} />
  </section>;
}
