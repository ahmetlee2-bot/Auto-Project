import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getRequestUser } from "../../../../lib/dashboard/server-auth";
import { appUrl } from "../../../../lib/app-url";
import { getCreditPlan } from "../../../../lib/stripe/plans";
import { stripeClient } from "../../../../lib/stripe/stripeClient";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getRequestUser();
  if (!user) return NextResponse.json({ error: "Oturum açmanız gerekiyor." }, { status: 401 });
  const origin = request.headers.get("origin");
  let validOrigin = false;
  try { validOrigin = Boolean(origin) && new URL(origin as string).origin === request.nextUrl.origin; } catch {}
  if (!validOrigin) {
    return NextResponse.json({ error: "Ungültige Anfragequelle." }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => null) as { packageId?: unknown } | null;
    const plan = getCreditPlan(body?.packageId);
    if (!plan) return NextResponse.json({ error: "Bitte wähle ein gültiges Guthabenpaket." }, { status: 400 });

    const originUrl = appUrl();
    const identifierSuffix = [...randomBytes(8)].map((byte) => "abcdefghijklmnopqrstuvwxyz"[byte % 26]).join("");
    const session = await stripeClient().checkout.sessions.create({
      mode: "payment",
      integration_identifier: `autolister-wallet-${identifierSuffix}`,
      customer_email: user.email || undefined,
      client_reference_id: user.id,
      metadata: { user_id: user.id, package_id: plan.id, credits_to_add: String(plan.credits) },
      payment_intent_data: { metadata: { user_id: user.id, package_id: plan.id, credits_to_add: String(plan.credits) } },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: plan.amountCents,
          product_data: { name: `${plan.credits} AutoLister Tracking-Credits`, description: `Guthabenpaket ${plan.name}` },
        },
      }],
      success_url: `${originUrl}/dashboard/orders?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${originUrl}/dashboard/orders?payment=cancelled`,
    });
    if (!session.url) throw new Error("Stripe Checkout hat keine Weiterleitungsadresse zurückgegeben.");
    return NextResponse.json({ url: session.url }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Checkout konnte nicht erstellt werden.";
    const status = message.includes("Stripe ist") || message.includes("Stripe-API-Schlüssel") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
