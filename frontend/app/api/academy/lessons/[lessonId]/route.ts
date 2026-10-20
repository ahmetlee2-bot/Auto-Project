import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, isAutolisterAdmin } from "../../../../../lib/dashboard/server-auth";
import { repricerAdmin } from "../../../../../lib/repricer/admin";

export async function DELETE(request: NextRequest, context: { params: Promise<{ lessonId: string }> }) {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  if (!isAutolisterAdmin(user.id)) return NextResponse.json({ error: "Bu işlem AutoLister yöneticilerine açıktır." }, { status: 403 });
  const { lessonId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(lessonId)) return NextResponse.json({ error: "Ders kimliği geçersiz." }, { status: 400 });
  const { data, error } = await repricerAdmin().from("academy_lessons").delete().eq("id", lessonId).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Ders silinemedi." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Ders bulunamadı." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
