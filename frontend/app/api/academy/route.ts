import { NextResponse } from "next/server";
import { getRequestUser, isAutolisterAdmin } from "../../../lib/dashboard/server-auth";
import { repricerAdmin } from "../../../lib/repricer/admin";

export const runtime = "nodejs";

export async function GET() {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  const admin = repricerAdmin();
  const canManage = isAutolisterAdmin(user.id);
  let courseQuery = admin.from("academy_courses").select("id,slug,title,description,sort_order,is_published").order("sort_order").order("title");
  if (!canManage) courseQuery = courseQuery.eq("is_published", true);
  const { data: courses, error: courseError } = await courseQuery;
  if (courseError) return NextResponse.json({ error: "Academy modülleri yüklenemedi." }, { status: 500 });
  const courseIds = (courses || []).map((course) => course.id);
  const [lessonResult, progressResult] = await Promise.all([
    courseIds.length
      ? admin.from("academy_lessons").select("id,course_id,module_title,lesson_title,description,video_url,thumbnail_url,duration_minutes,sort_order,resources_json,is_published").in("course_id", courseIds).order("sort_order").order("lesson_title")
      : Promise.resolve({ data: [], error: null }),
    admin.from("user_lesson_progress").select("lesson_id,completed,updated_at").eq("user_id", user.id),
  ]);
  if (lessonResult.error || progressResult.error) return NextResponse.json({ error: "Academy dersleri yüklenemedi." }, { status: 500 });
  const lessons = canManage ? lessonResult.data || [] : (lessonResult.data || []).filter((lesson) => lesson.is_published);
  return NextResponse.json({ courses: courses || [], lessons, progress: progressResult.data || [], canManage }, { headers: { "Cache-Control": "no-store" } });
}
