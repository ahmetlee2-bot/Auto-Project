import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "../../../../lib/dashboard/server-auth";
import { repricerAdmin } from "../../../../lib/repricer/admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Kuyruk kimliği geçersiz." }, { status: 400 });
  const body = await request.json().catch(() => ({})) as { action?: string };
  const admin = repricerAdmin();
  if (body.action === "retry") {
    const { data, error } = await admin.from("listing_queue").update({ status: "pending", scheduled_for: new Date().toISOString(), error_message: null }).eq("id", id).eq("user_id", user.id).eq("status", "failed").select("id,store_listing_id").maybeSingle();
    if (error) return NextResponse.json({ error: "Kuyruk öğesi yeniden başlatılamadı." }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Yalnızca başarısız kuyruk öğeleri yeniden denenebilir." }, { status: 409 });
    if (data.store_listing_id) await admin.from("store_listings").update({ status: "queued", error_message: null }).eq("id", data.store_listing_id).eq("user_id", user.id);
    return NextResponse.json({ retried: true });
  }
  return NextResponse.json({ error: "Desteklenmeyen kuyruk işlemi." }, { status: 400 });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  const { id } = await context.params;
  const admin = repricerAdmin();
  const { data, error } = await admin.from("listing_queue").delete().eq("id", id).eq("user_id", user.id).eq("status", "pending").select("store_listing_id").maybeSingle();
  if (error) return NextResponse.json({ error: "Kuyruk öğesi kaldırılamadı." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Yalnızca bekleyen kuyruğu iptal edebilirsiniz." }, { status: 409 });
  if (data.store_listing_id) await admin.from("store_listings").delete().eq("id", data.store_listing_id).eq("user_id", user.id).eq("status", "queued");
  return NextResponse.json({ deleted: true });
}
