import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, isAutolisterAdmin } from "../../../../lib/dashboard/server-auth";
import { repricerAdmin } from "../../../../lib/repricer/admin";

export const runtime = "nodejs";

type ResourceLink = { title: string; url: string };
function cleanResources(value: unknown): ResourceLink[] {
  if (!Array.isArray(value) || value.length > 30) throw new Error("En fazla 30 kaynak bağlantısı eklenebilir.");
  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null) throw new Error("Kaynak bağlantısı biçimi geçersiz.");
    const item = entry as Record<string, unknown>;
    const title = String(item.title || "").trim();
    const url = new URL(String(item.url || ""));
    if (!title || title.length > 120 || url.protocol !== "https:") throw new Error("Kaynaklarda başlık ve HTTPS bağlantısı gerekli.");
    return { title, url: url.toString() };
  });
}

export async function POST(request: NextRequest) {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  if (!isAutolisterAdmin(user.id)) return NextResponse.json({ error: "Bu işlem AutoLister yöneticilerine açıktır." }, { status: 403 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const courseId = String(body.course_id || "");
    const lessonTitle = String(body.lesson_title || "").trim();
    const moduleTitle = String(body.module_title || "").trim();
    const description = String(body.description || "").trim();
    const duration = Number(body.duration_minutes || 0);
    const sortOrder = Number(body.sort_order || 0);
    if (!/^[0-9a-f-]{36}$/i.test(courseId)) throw new Error("Academy modülü geçersiz.");
    if (!lessonTitle || lessonTitle.length > 200 || !moduleTitle || moduleTitle.length > 160) throw new Error("Ders ve bölüm başlıklarını doldurun.");
    if (description.length > 20_000 || !Number.isInteger(duration) || duration < 0 || duration > 1000 || !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100_000) throw new Error("Açıklama, süre veya sıralama değeri geçersiz.");
    const videoUrl = String(body.video_url || "").trim() || null;
    if (videoUrl && !videoUrl.startsWith("storage://academy-media/")) {
      const parsed = new URL(videoUrl);
      if (parsed.protocol !== "https:" || !["youtube.com", "www.youtube.com", "youtu.be", "vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(parsed.hostname) && !/\.(mp4|webm|mov)(\?|$)/i.test(parsed.pathname + parsed.search)) {
        throw new Error("Video bağlantısı HTTPS MP4/WebM/MOV, YouTube veya Vimeo olmalı.");
      }
    }
    const thumbnailUrl = String(body.thumbnail_url || "").trim() || null;
    if (thumbnailUrl && new URL(thumbnailUrl).protocol !== "https:") throw new Error("Kapak görseli HTTPS bağlantısı olmalı.");
    const resources = cleanResources(body.resources_json ?? []);
    const patch = {
      course_id: courseId,
      module_title: moduleTitle,
      lesson_title: lessonTitle,
      description,
      video_url: videoUrl,
      thumbnail_url: thumbnailUrl,
      duration_minutes: duration,
      sort_order: sortOrder,
      resources_json: resources,
      is_published: body.is_published === true,
    };
    const admin = repricerAdmin();
    const { data: course, error: courseError } = await admin.from("academy_courses").select("id").eq("id", courseId).maybeSingle();
    if (courseError) throw courseError;
    if (!course) throw new Error("Academy modülü bulunamadı.");
    const lessonId = String(body.id || "");
    const result = lessonId
      ? await admin.from("academy_lessons").update(patch).eq("id", lessonId).select("*").maybeSingle()
      : await admin.from("academy_lessons").insert(patch).select("*").single();
    if (result.error) throw result.error;
    if (!result.data) return NextResponse.json({ error: "Ders bulunamadı." }, { status: 404 });
    return NextResponse.json({ lesson: result.data }, { status: lessonId ? 200 : 201 });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Ders kaydedilemedi.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
