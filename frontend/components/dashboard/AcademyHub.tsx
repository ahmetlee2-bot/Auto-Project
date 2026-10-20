"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Course = { id: string; slug: string; title: string; description: string; sort_order: number; is_published: boolean };
type Resource = { title: string; url: string };
type Lesson = {
  id: string; course_id: string; module_title: string; lesson_title: string; description: string; video_url: string | null;
  thumbnail_url: string | null; duration_minutes: number; sort_order: number; resources_json: Resource[]; is_published: boolean;
};
type Progress = { lesson_id: string; completed: boolean };
type AcademyData = { courses: Course[]; lessons: Lesson[]; progress: Progress[]; canManage: boolean; error?: string };

function mediaSource(value: string | null): { kind: "video" | "embed"; src: string } | null {
  if (!value) return null;
  if (value.startsWith("storage://academy-media/")) {
    const path = value.slice("storage://academy-media/".length);
    return { kind: "video", src: `/api/academy/media?path=${encodeURIComponent(path)}` };
  }
  try {
    const url = new URL(value);
    if (["youtu.be", "www.youtube.com", "youtube.com"].includes(url.hostname)) {
      const id = url.hostname === "youtu.be" ? url.pathname.slice(1) : url.searchParams.get("v") || url.pathname.split("/").filter(Boolean).at(-1) || "";
      return id ? { kind: "embed", src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` } : null;
    }
    if (["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(url.hostname)) {
      const id = url.pathname.split("/").filter(Boolean).at(-1);
      return id ? { kind: "embed", src: `https://player.vimeo.com/video/${encodeURIComponent(id)}` } : null;
    }
    return { kind: "video", src: value };
  } catch { return null; }
}

export function AcademyHub() {
  const [data, setData] = useState<AcademyData>({ courses: [], lessons: [], progress: [], canManage: false });
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/academy", { cache: "no-store" });
      const body = await response.json() as AcademyData;
      if (!response.ok) throw new Error(body.error || "Academy-Inhalte konnten nicht geladen werden.");
      setData(body);
      setSelectedId((current) => body.lessons.some((lesson) => lesson.id === current) ? current : body.lessons[0]?.id || "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Academy-Inhalte konnten nicht geladen werden."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const selected = data.lessons.find((lesson) => lesson.id === selectedId) || null;
  const completed = useMemo(() => new Set(data.progress.filter((item) => item.completed).map((item) => item.lesson_id)), [data.progress]);
  const doneCount = data.lessons.filter((lesson) => completed.has(lesson.id)).length;
  const progressPercent = data.lessons.length ? Math.round(doneCount * 100 / data.lessons.length) : 0;

  const toggleComplete = async () => {
    if (!selected) return;
    const next = !completed.has(selected.id);
    setSaving(true); setNotice(""); setError("");
    try {
      const response = await fetch("/api/academy/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lessonId: selected.id, completed: next }) });
      const body = await response.json() as { progress?: Progress; error?: string };
      if (!response.ok || !body.progress) throw new Error(body.error || "Fortschritt konnte nicht gespeichert werden.");
      setData((current) => ({ ...current, progress: [...current.progress.filter((item) => item.lesson_id !== body.progress?.lesson_id), body.progress as Progress] }));
      setNotice(next ? "Lektion als abgeschlossen markiert." : "Lektionsstatus zurückgesetzt.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Fortschritt konnte nicht gespeichert werden."); }
    finally { setSaving(false); }
  };

  const currentCourse = selected ? data.courses.find((course) => course.id === selected.course_id) : null;
  const currentMedia = mediaSource(selected?.video_url || null);

  return <main className="proWorkspace">
    <div className="proPageHeading"><div><span className="proEyebrow">Wissen &amp; Praxis</span><h1>AutoLister Academy</h1><p>eBay-Integration, Produktprüfung, Queue-Konfiguration und Versand im Dashboard sicher bedienen.</p></div>{data.canManage && <Link className="proButton" href="/dashboard/academy/manage">Lektionen verwalten</Link>}</div>
    <section className="proPanel proAcademyProgress"><div><b>{progressPercent}%</b><span>Gesamtfortschritt · {doneCount} von {data.lessons.length} Lektionen</span></div><div className="proProgressTrack"><span style={{ width: `${progressPercent}%` }} /></div></section>
    {notice && <p className="proNotice" role="status">{notice}</p>}{error && <p className="proNotice proNoticeError" role="alert">{error}</p>}
    {loading ? <section className="proPanel proEmpty">Academy wird geladen…</section> : !data.lessons.length ? <section className="proPanel proEmpty">Noch keine veröffentlichten Lektionen vorhanden.</section> : <div className="proAcademyLayout">
      <section className="proPanel proLessonContent">
        <div className="proVideoStage">{currentMedia?.kind === "video" ? <video className="proVideo" controls playsInline preload="metadata" poster={selected?.thumbnail_url || undefined}><source src={currentMedia.src} /></video> : currentMedia?.kind === "embed" ? <iframe className="proVideo proVideoEmbed" src={currentMedia.src} title={selected?.lesson_title || "Academy video"} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /> : <div className="proVideoPlaceholder"><span>🎓</span><strong>Videolektion</strong><small>Diese Lektion enthält derzeit kein Video. Lesen Sie die Anleitung und nutzen Sie die verlinkten Ressourcen.</small></div>}</div>
        {selected && <div className="proLessonDetails"><span className="proEyebrow">{selected.module_title}{currentCourse ? ` · ${currentCourse.title}` : ""} · {selected.duration_minutes} Min.</span><h2>{selected.lesson_title}</h2><p>{selected.description || "Für diese Lektion gibt es noch keine Beschreibung."}</p>{Array.isArray(selected.resources_json) && selected.resources_json.length > 0 && <div className="proLessonResources"><h3>Materialien</h3>{selected.resources_json.map((resource) => <a key={`${resource.title}:${resource.url}`} href={resource.url} target="_blank" rel="noreferrer">{resource.title} ↗</a>)}</div>}<button className={`proButton ${completed.has(selected.id) ? "" : "proButtonPrimary"}`} type="button" disabled={saving} onClick={() => void toggleComplete()}>{saving ? "Wird gespeichert…" : completed.has(selected.id) ? "✓ Abgeschlossen — zurücksetzen" : "Als abgeschlossen markieren"}</button></div>}
      </section>
      <aside className="proPanel proAcademySidebar"><div className="proToolbar"><h2>Lernpfad</h2><span className="proTag">{data.lessons.length} Lektionen</span></div>{data.courses.map((course) => {
        const courseLessons = data.lessons.filter((lesson) => lesson.course_id === course.id);
        const courseDone = courseLessons.filter((lesson) => completed.has(lesson.id)).length;
        return <details className="proCourseGroup" key={course.id} open={course.id === currentCourse?.id}><summary><span>{course.title}</span><small>{courseDone}/{courseLessons.length}</small></summary><p className="proMuted">{course.description}</p>{courseLessons.map((lesson) => <button className={`proLessonLink ${lesson.id === selectedId ? "isSelected" : ""}`} key={lesson.id} type="button" onClick={() => setSelectedId(lesson.id)}><span className="proLessonCheck">{completed.has(lesson.id) ? "✓" : "▶"}</span><span><b>{lesson.lesson_title}</b><small>{lesson.module_title} · {lesson.duration_minutes} Min.{!lesson.is_published ? " · Entwurf" : ""}</small></span></button>)}</details>;
      })}</aside>
    </div>}
  </main>;
}
