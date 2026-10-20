import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, isAutolisterAdmin } from "../../../../lib/dashboard/server-auth";
import { repricerAdmin } from "../../../../lib/repricer/admin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  const path = request.nextUrl.searchParams.get("path") || "";
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(mp4|webm|mov)$/i.test(path)) return NextResponse.json({ error: "Video yolu geçersiz." }, { status: 400 });
  const admin = repricerAdmin();
  let query = admin.from("academy_lessons").select("id,course_id,is_published").eq("video_url", `storage://academy-media/${path}`);
  if (!isAutolisterAdmin(user.id)) query = query.eq("is_published", true);
  const { data: lessons, error } = await query.limit(1);
  if (error) return NextResponse.json({ error: "Video kaydı doğrulanamadı." }, { status: 500 });
  if (!lessons?.length) return NextResponse.json({ error: "Video bulunamadı." }, { status: 404 });
  const { data: course, error: courseError } = await admin.from("academy_courses").select("is_published").eq("id", lessons[0].course_id).maybeSingle();
  if (courseError || !course || (!isAutolisterAdmin(user.id) && !course.is_published)) return NextResponse.json({ error: "Video şu anda kullanılamıyor." }, { status: 404 });
  const { data: signed, error: signedError } = await admin.storage.from("academy-media").createSignedUrl(path, 60 * 60);
  if (signedError || !signed?.signedUrl) return NextResponse.json({ error: "Video bağlantısı oluşturulamadı." }, { status: 502 });
  return NextResponse.redirect(signed.signedUrl, { headers: { "Cache-Control": "private, no-store" } });
}
