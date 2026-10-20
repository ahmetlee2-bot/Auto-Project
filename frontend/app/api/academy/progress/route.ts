import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "../../../../lib/dashboard/server-auth";
import { repricerAdmin } from "../../../../lib/repricer/admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  try {
    const body = await request.json() as { lessonId?: unknown; completed?: unknown };
    const lessonId = String(body.lessonId || "");
    if (!/^[0-9a-f-]{36}$/i.test(lessonId) || typeof body.completed !== "boolean") throw new Error("Ders ilerleme bilgisi geçersiz.");
    const admin = repricerAdmin();
    const { data: lesson, error: lessonError } = await admin.from("academy_lessons").select("id,course_id,is_published").eq("id", lessonId).eq("is_published", true).maybeSingle();
    if (lessonError) throw lessonError;
    if (!lesson) return NextResponse.json({ error: "Yayınlanmış ders bulunamadı." }, { status: 404 });
    const { data: course, error: courseError } = await admin.from("academy_courses").select("id").eq("id", lesson.course_id).eq("is_published", true).maybeSingle();
    if (courseError) throw courseError;
    if (!course) return NextResponse.json({ error: "Bu ders şu anda kullanılamıyor." }, { status: 404 });
    const { data, error } = await admin.from("user_lesson_progress").upsert({ user_id: user.id, lesson_id: lessonId, completed: body.completed }, { onConflict: "user_id,lesson_id" }).select("lesson_id,completed,updated_at").single();
    if (error) throw error;
    return NextResponse.json({ progress: data });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Ders ilerlemesi kaydedilemedi." }, { status: 400 });
  }
}
