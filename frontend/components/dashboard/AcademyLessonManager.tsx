"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { createClient } from "../../lib/supabase/client";

type Course = { id: string; title: string };
type Lesson = { id: string; course_id: string; module_title: string; lesson_title: string; description: string; video_url: string | null; thumbnail_url: string | null; duration_minutes: number; sort_order: number; resources_json: Array<{ title: string; url: string }>; is_published: boolean };
type FormState = { id: string; course_id: string; module_title: string; lesson_title: string; description: string; video_url: string; thumbnail_url: string; duration_minutes: number; sort_order: number; resources_text: string; is_published: boolean };

const blankForm = (courseId = ""): FormState => ({ id: "", course_id: courseId, module_title: "", lesson_title: "", description: "", video_url: "", thumbnail_url: "", duration_minutes: 0, sort_order: 10, resources_text: "[]", is_published: false });

export function AcademyLessonManager() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [form, setForm] = useState<FormState>(blankForm());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/academy", { cache: "no-store" });
      const body = await response.json() as { courses?: Course[]; lessons?: Lesson[]; canManage?: boolean; error?: string };
      if (!response.ok) throw new Error(body.error || "Academy-Daten konnten nicht geladen werden.");
      if (!body.canManage) throw new Error("Dieser Bereich ist nur für AutoLister-Administratoren verfügbar.");
      setCourses(body.courses || []); setLessons(body.lessons || []);
      setForm((current) => current.course_id ? current : blankForm(body.courses?.[0]?.id || ""));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Academy-Daten konnten nicht geladen werden."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const edit = (lesson: Lesson) => setForm({ id: lesson.id, course_id: lesson.course_id, module_title: lesson.module_title, lesson_title: lesson.lesson_title, description: lesson.description, video_url: lesson.video_url || "", thumbnail_url: lesson.thumbnail_url || "", duration_minutes: lesson.duration_minutes, sort_order: lesson.sort_order, resources_text: JSON.stringify(lesson.resources_json || [], null, 2), is_published: lesson.is_published });
  const update = (key: keyof FormState, value: string | number | boolean) => setForm((current) => ({ ...current, [key]: value }));

  const uploadVideo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const initResponse = await fetch("/api/academy/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contentType: file.type, size: file.size }) });
      const init = await initResponse.json() as { path?: string; token?: string; videoUrl?: string; error?: string };
      if (!initResponse.ok || !init.path || !init.token || !init.videoUrl) throw new Error(init.error || "Video-Upload konnte nicht vorbereitet werden.");
      const { error: uploadError } = await createClient().storage.from("academy-media").uploadToSignedUrl(init.path, init.token, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      update("video_url", init.videoUrl);
      setNotice("Video in den privaten Academy-Speicher hochgeladen. Speichern Sie anschließend die Lektion.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Video-Upload fehlgeschlagen."); }
    finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      let resources: unknown;
      try { resources = JSON.parse(form.resources_text); } catch { throw new Error("Materialien müssen gültiges JSON sein, z. B. [{\"title\":\"Checkliste\",\"url\":\"https://…\"}]."); }
      if (!Array.isArray(resources)) throw new Error("Materialien als JSON-Liste angeben.");
      const response = await fetch("/api/academy/lessons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: form.id || undefined, course_id: form.course_id, module_title: form.module_title, lesson_title: form.lesson_title, description: form.description, video_url: form.video_url, thumbnail_url: form.thumbnail_url, duration_minutes: form.duration_minutes, sort_order: form.sort_order, resources_json: resources, is_published: form.is_published }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Lektion konnte nicht gespeichert werden.");
      setNotice("Lektion gespeichert.");
      await load();
      setForm((current) => blankForm(current.course_id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Lektion konnte nicht gespeichert werden."); }
    finally { setBusy(false); }
  };

  const remove = async (lesson: Lesson) => {
    if (!window.confirm(`Lektion „${lesson.lesson_title}“ endgültig löschen?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/academy/lessons/${lesson.id}`, { method: "DELETE" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Lektion konnte nicht gelöscht werden.");
      setNotice("Lektion gelöscht.");
      if (form.id === lesson.id) setForm(blankForm(lesson.course_id));
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Lektion konnte nicht gelöscht werden."); }
    finally { setBusy(false); }
  };

  return <main className="proWorkspace">
    <div className="proPageHeading"><div><span className="proEyebrow">Administration</span><h1>Academy-Lektionen verwalten</h1><p>Videos in den privaten Supabase-Speicher hochladen oder sichere externe Video-URLs verwenden. Entwürfe bleiben für Lernende verborgen.</p></div><Link className="proButton" href="/dashboard/academy">Zur Academy</Link></div>
    {notice && <p className="proNotice" role="status">{notice}</p>}{error && <p className="proNotice proNoticeError" role="alert">{error}</p>}
    <div className="proAcademyAdminLayout"><section className="proPanel"><h2>{form.id ? "Lektion bearbeiten" : "Neue Lektion"}</h2><div className="proFormGrid">
      <label className="proLabel">Academy-Modul<select className="proSelect" value={form.course_id} onChange={(event) => update("course_id", event.target.value)}>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
      <label className="proLabel">Abschnitt / Module title<input className="proInput" value={form.module_title} onChange={(event) => update("module_title", event.target.value)} maxLength={160} /></label>
      <label className="proLabel">Lektionstitel<input className="proInput" value={form.lesson_title} onChange={(event) => update("lesson_title", event.target.value)} maxLength={200} /></label>
      <label className="proLabel">Videodauer (Minuten)<input className="proInput" type="number" min={0} value={form.duration_minutes} onChange={(event) => update("duration_minutes", Number(event.target.value))} /></label>
      <label className="proLabel">Sortierreihenfolge<input className="proInput" type="number" min={0} value={form.sort_order} onChange={(event) => update("sort_order", Number(event.target.value))} /></label>
      <label className="proLabel">Video-URL (MP4/WebM, YouTube oder Vimeo)<input className="proInput" value={form.video_url} onChange={(event) => update("video_url", event.target.value)} placeholder="https://…" /></label>
      <label className="proLabel">Vorschaubild-URL<input className="proInput" value={form.thumbnail_url} onChange={(event) => update("thumbnail_url", event.target.value)} placeholder="https://…" /></label>
    </div>
    <label className="proLabel proUploadField">Videodatei (MP4/WebM/MOV, maximal 500 MB)<input className="proInput" type="file" accept="video/mp4,video/webm,video/quicktime" disabled={busy} onChange={(event) => void uploadVideo(event)} /></label>
    <label className="proLabel">Beschreibung<textarea className="proTextarea" value={form.description} onChange={(event) => update("description", event.target.value)} maxLength={20000} /></label>
    <label className="proLabel">Materialien als JSON-Liste<textarea className="proTextarea proResourcesEditor" value={form.resources_text} onChange={(event) => update("resources_text", event.target.value)} /></label>
    <label className="proCheckbox"><input type="checkbox" checked={form.is_published} onChange={(event) => update("is_published", event.target.checked)} />Lektion veröffentlichen</label>
    <div className="proToolbarControls"><button className="proButton proButtonPrimary" type="button" disabled={busy || !form.course_id} onClick={() => void save()}>{busy ? "Wird gespeichert…" : "Lektion speichern"}</button>{form.id && <button className="proButton" type="button" onClick={() => setForm(blankForm(form.course_id))}>Neue Lektion</button>}</div></section>
    <aside className="proPanel"><h2>Vorhandene Lektionen</h2>{loading ? <div className="proEmpty">Laden…</div> : <div className="proLessonAdminList">{lessons.map((lesson) => <article key={lesson.id} className="proLessonAdminItem"><div><b>{lesson.lesson_title}</b><small>{courses.find((course) => course.id === lesson.course_id)?.title || "Modul"} · {lesson.is_published ? "Veröffentlicht" : "Entwurf"} · Sortierung {lesson.sort_order}</small></div><div className="proToolbarControls"><button className="proButton" type="button" onClick={() => edit(lesson)}>Bearbeiten</button><button className="proButton proButtonDanger" disabled={busy} type="button" onClick={() => void remove(lesson)}>Löschen</button></div></article>)}</div>}</aside></div>
  </main>;
}
