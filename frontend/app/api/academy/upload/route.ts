import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, isAutolisterAdmin } from "../../../../lib/dashboard/server-auth";
import { repricerAdmin } from "../../../../lib/repricer/admin";

export const runtime = "nodejs";

const extensions: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };

export async function POST(request: NextRequest) {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  if (!isAutolisterAdmin(user.id)) return NextResponse.json({ error: "Video yükleme AutoLister yöneticilerine açıktır." }, { status: 403 });
  try {
    const body = await request.json() as { contentType?: unknown; size?: unknown };
    const contentType = String(body.contentType || "");
    const size = Number(body.size);
    const extension = extensions[contentType];
    if (!extension || !Number.isFinite(size) || size <= 0 || size > 500 * 1024 * 1024) throw new Error("MP4, WebM veya MOV video dosyası 500 MB'ı aşmamalı.");
    const path = `${user.id}/${randomUUID()}.${extension}`;
    const { data, error } = await repricerAdmin().storage.from("academy-media").createSignedUploadUrl(path, { upsert: false });
    if (error || !data) throw error || new Error("Yükleme bağlantısı oluşturulamadı.");
    return NextResponse.json({ path, token: data.token, videoUrl: `storage://academy-media/${path}` });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Video yüklemesi başlatılamadı." }, { status: 400 });
  }
}
