import assert from "node:assert/strict";
import test from "node:test";
import { CREDIT_PLANS, getCreditPlan } from "../lib/stripe/plans";
import { stripeConfigurationError } from "../lib/stripe/config";

test("wallet checkout accepts only the three server-priced credit packages", () => {
  assert.deepEqual(Object.values(CREDIT_PLANS).map((plan) => [plan.credits, plan.amountCents]), [
    [50, 850], [100, 1500], [250, 3250],
  ]);
  assert.equal(getCreditPlan("tier_100")?.credits, 100);
  assert.equal(getCreditPlan("tier_1000"), null);
  assert.equal(getCreditPlan({ packageId: "tier_50" }), null);
});

test("production Stripe configuration rejects test keys and accepts a live key", () => {
  assert.match(stripeConfigurationError("sk_test_example123", "production") || "", /Live/);
  assert.equal(stripeConfigurationError("sk_live_example123", "production"), null);
  assert.equal(stripeConfigurationError(undefined, "development"), "Stripe ist noch nicht konfiguriert.");
});
