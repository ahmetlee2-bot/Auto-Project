import { NextResponse } from "next/server";
import { getRequestUser, isAutolisterAdmin } from "../../../lib/dashboard/server-auth";
import { repricerAdmin } from "../../../lib/repricer/admin";

export const runtime = "nodejs";

export async function GET() {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  try {
    const admin = repricerAdmin();
    const unlimited = isAutolisterAdmin(user.id);
    const { error: insertError } = await admin.from("user_wallets")
      .insert({ user_id: user.id, credit_balance: 0, is_unlimited: unlimited });
    if (insertError && insertError.code !== "23505") throw new Error(insertError.message);
    const { error: updateError } = await admin.from("user_wallets")
      .update({ is_unlimited: unlimited, updated_at: new Date().toISOString() }).eq("user_id", user.id);
    if (updateError) throw new Error(updateError.message);
    const { data, error } = await admin.from("user_wallets")
      .select("credit_balance,is_unlimited").eq("user_id", user.id).single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ creditBalance: data.credit_balance, isUnlimited: data.is_unlimited }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Cüzdan yüklenemedi." }, { status: 500 });
  }
}
