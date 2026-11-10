"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Check, ChevronDown, ChevronUp, LoaderCircle, Pause, RotateCcw, Volume2, VolumeX, X } from "lucide-react";

type ListingJob = {
  id: string;
  draft_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  current_step: string;
  queue_position: number | null;
  last_error: string | null;
  product: { title: string; images: string[]; status: string; ebay_item_id: string | null; last_error: string | null } | null;
};

let sharedAudioContext: AudioContext | null = null;

export function DraftListingQueueWidget({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [jobs, setJobs] = useState<ListingJob[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [muted, setMuted] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [toast, setToast] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [retrying, setRetrying] = useState("");
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const previous = useRef<Map<string, string> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/drafts/jobs", { cache: "no-store" });
      if (!response.ok) return;
      const body = await response.json() as { jobs?: ListingJob[] };
      const nextJobs = body.jobs || [];
      const old = previous.current;
      if (old) {
        for (const job of nextJobs) {
          const oldStatus = old.get(job.id);
          if (oldStatus && oldStatus !== job.status && (job.status === "completed" || job.status === "failed")) {
            const title = job.product?.title || "Ürün";
            const success = job.status === "completed";
            setToast({ tone: success ? "success" : "error", text: success ? `✅ ${title} başarıyla listelendi${job.last_error ? ` · ${job.last_error}` : ""}` : `⚠️ ${title}: ${job.last_error || "Listeleme başarısız oldu"}` });
            if (!muted) playListingTone(success);
            if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification(success ? "AutoLister · Listeleme tamamlandı" : "AutoLister · Listeleme hatası", { body: success ? `${title} eBay’de yayında.${job.last_error ? ` ${job.last_error}` : ""}` : `${title}: ${job.last_error || "Tekrar deneyin veya taslağı düzenleyin."}` });
            }
          }
        }
      }
      previous.current = new Map(nextJobs.map((job) => [job.id, job.status]));
      setJobs(nextJobs);
    } catch { /* Keep last known queue; a later poll retries. */ }
  }, [muted]);

  useEffect(() => {
    try { setMuted(window.localStorage.getItem("autolister-listing-queue-muted") !== "false"); } catch { setMuted(true); }
    if (typeof Notification === "undefined") setNotificationPermission("unsupported");
    else setNotificationPermission(Notification.permission);
    const unlockAudio = () => {
      try {
        const AudioContextConstructor = window.AudioContext;
        if (!AudioContextConstructor) return;
        sharedAudioContext ||= new AudioContextConstructor();
        if (sharedAudioContext.state === "suspended") void sharedAudioContext.resume();
      } catch { /* Audio is optional and never blocks the queue. */ }
    };
    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("draft-listing-jobs-changed", refresh);
    void refresh();
    const timer = window.setInterval(refresh, 2500);
    return () => { window.removeEventListener("pointerdown", unlockAudio); window.removeEventListener("draft-listing-jobs-changed", refresh); window.clearInterval(timer); };
  }, [refresh]);

  const activeJobs = jobs.filter((job) => job.status === "queued" || job.status === "processing");
  const queuedCount = jobs.filter((job) => job.status === "queued").length;
  useEffect(() => { if (activeJobs.length) setDismissed(false); }, [activeJobs.length]);
  useEffect(() => {
    if (jobs.length && !activeJobs.length) {
      const timer = window.setTimeout(() => setCollapsed(true), 5000);
      return () => window.clearTimeout(timer);
    }
  }, [jobs.length, activeJobs.length]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function toggleMute() {
    const value = !muted;
    setMuted(value);
    window.localStorage.setItem("autolister-listing-queue-muted", String(value));
  }

  async function enableNotifications() {
    if (typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  }

  async function retry(job: ListingJob) {
    setRetrying(job.id);
    try {
      const response = await fetch("/api/drafts/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "retry", draftId: job.draft_id }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Listeauftrag konnte nicht erneut gestartet werden.");
      setToast({ tone: "success", text: "Listeauftrag wurde erneut eingereiht." });
      await refresh();
    } catch (error) { setToast({ tone: "error", text: error instanceof Error ? error.message : "Erneuter Versuch fehlgeschlagen." }); }
    finally { setRetrying(""); }
  }

  function edit(job: ListingJob) {
    window.sessionStorage.setItem("autolister-edit-draft-id", job.draft_id);
    onNavigate("drafts");
    window.setTimeout(() => window.dispatchEvent(new Event("draft-edit-request")), 50);
  }

  if (!jobs.length || dismissed) return toast ? <div className={`listingQueueToast listingQueueToast-${toast.tone}`} role="status">{toast.text}<button type="button" aria-label="Bildirimi kapat" onClick={() => setToast(null)}><X size={15} /></button></div> : null;

  return <>
    {toast ? <div className={`listingQueueToast listingQueueToast-${toast.tone}`} role="status">{toast.text}<button type="button" aria-label="Bildirimi kapat" onClick={() => setToast(null)}><X size={15} /></button></div> : null}
    <aside className={`listingQueueWidget ${collapsed ? "is-collapsed" : ""}`} aria-label="Listeleme kuyruğu">
      <header className="listingQueueHeader">
        <div><strong>Listeleme Kuyruğu</strong><small>{activeJobs.length} aktif · {queuedCount} sırada</small></div>
        <div className="listingQueueHeaderActions">
          <button type="button" title={muted ? "Sesi aç" : "Sesi kapat"} aria-label={muted ? "Sesi aç" : "Sesi kapat"} onClick={toggleMute}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
          {notificationPermission === "default" ? <button type="button" title="Masaüstü bildirimlerini aç" aria-label="Masaüstü bildirimlerini aç" onClick={() => void enableNotifications()}><Bell size={15} /></button> : null}
          {notificationPermission === "granted" ? <span title="Masaüstü bildirimleri açık" className="listingQueueBell"><Bell size={14} /></span> : null}
          <button type="button" title={collapsed ? "Kuyruğu genişlet" : "Kuyruğu daralt"} aria-label={collapsed ? "Kuyruğu genişlet" : "Kuyruğu daralt"} onClick={() => setCollapsed((value) => !value)}>{collapsed ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</button>
          {!activeJobs.length ? <button type="button" title="Kuyruğu kapat" aria-label="Kuyruğu kapat" onClick={() => setDismissed(true)}><X size={16} /></button> : null}
        </div>
      </header>
      {!collapsed ? <div className="listingQueueBody">
        {jobs.map((job) => {
          const title = job.product?.title || "Ürün taslağı";
          const image = job.product?.images?.[0];
          const queued = job.status === "queued";
          const processing = job.status === "processing";
          const failed = job.status === "failed";
          return <article className={`listingQueueJob listingQueueJob-${job.status}`} key={job.id}>
            {image ? <img src={image} alt="" /> : <div className="listingQueueImage"><Pause size={16} /></div>}
            <div className="listingQueueJobContent">
              <strong title={title}>{title}</strong>
              <small>{queued ? `Sırada #${job.queue_position || "…"}` : processing ? job.current_step : failed ? "Hata oluştu" : "Başarıyla listelendi"}</small>
              {queued || processing ? <div className="listingQueueProgress" role="progressbar" aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }} /></div> : null}
              {processing ? <small className="listingQueuePercent"><LoaderCircle size={12} className="listingQueueSpin" /> {job.progress}%</small> : null}
              {failed ? <><small className="listingQueueError">{job.last_error || job.product?.last_error || "Yayınlama başarısız oldu."}</small><div className="listingQueueQuickActions"><button type="button" disabled={retrying === job.id} onClick={() => void retry(job)}><RotateCcw size={13} /> Tekrar Dene</button><button type="button" onClick={() => edit(job)}>Düzenle</button></div></> : null}
              {job.status === "completed" ? <><small className="listingQueueCompleted"><Check size={13} /> Yayında</small>{job.last_error ? <small className="listingQueueError">{job.last_error}</small> : null}</> : null}
            </div>
          </article>;
        })}
      </div> : null}
    </aside>
  </>;
}

function playListingTone(success: boolean) {
  try {
    const Context = window.AudioContext;
    if (!Context) return;
    sharedAudioContext ||= new Context();
    const context = sharedAudioContext;
    if (context.state === "suspended") void context.resume();
    const now = context.currentTime;
    const notes = success ? [659.25, 783.99] : [392, 311.13];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.13);
      gain.gain.exponentialRampToValueAtTime(0.09, now + index * 0.13 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.13 + 0.22);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(now + index * 0.13); oscillator.stop(now + index * 0.13 + 0.24);
    });
  } catch { /* Browser audio support is optional. */ }
}
