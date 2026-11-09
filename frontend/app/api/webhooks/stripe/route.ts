import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { repricerAdmin } from "../../../../lib/repricer/admin";
import { getCreditPlan } from "../../../../lib/stripe/plans";
import { stripeClient } from "../../../../lib/stripe/stripeClient";

export const runtime = "nodejs";

async function fulfillPaidCheckout(session: Stripe.Checkout.Session) {
  if (session.mode !== "payment" || session.payment_status !== "paid") return { ignored: true };
  const userId = session.metadata?.user_id || session.client_reference_id;
  const plan = getCreditPlan(session.metadata?.package_id);
  const credits = Number(session.metadata?.credits_to_add);
  if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
    || !plan || credits !== plan.credits || session.amount_total !== plan.amountCents || session.currency !== "eur") {
    throw new Error("Stripe Checkout session metadata or amount did not match a credit package.");
  }

  const { data, error } = await repricerAdmin().rpc("add_wallet_credits_from_stripe", {
    p_user_id: userId,
    p_credits: plan.credits,
    p_session_id: session.id,
    p_description: `Stripe Payment - Session: ${session.id}`,
  });
  if (error) throw new Error(`Wallet top-up RPC failed: ${error.message}`);
  return data as { credited?: boolean; credit_balance?: number };
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 503 });

  let stripe: ReturnType<typeof stripeClient>;
  try {
    stripe = stripeClient();
  } catch {
    return NextResponse.json({ error: "Stripe is not configured for this environment." }, { status: 503 });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await request.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid Stripe webhook signature." }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const outcome = await fulfillPaidCheckout(event.data.object as Stripe.Checkout.Session);
      return NextResponse.json({ received: true, ...outcome });
    }
    return NextResponse.json({ received: true, ignored: true });
  } catch (cause) {
    // A non-2xx lets Stripe retry a temporary database failure. The database
    // session uniqueness constraint prevents a retry from crediting twice.
    console.error("Stripe wallet webhook processing failed:", cause instanceof Error ? cause.message : "unknown error");
    return NextResponse.json({ error: "Wallet top-up could not be applied." }, { status: 500 });
  }
}
