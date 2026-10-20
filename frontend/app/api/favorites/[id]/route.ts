import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { repricerAdmin } from "../../../../lib/repricer/admin";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Context) {
  const { id } = await params;
  const client = await createClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await repricerAdmin().from("favorite_products").delete().eq("id", id).eq("user_id", auth.user.id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Favori bulunamadı." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
