export const CREDIT_PLANS = {
  tier_50: { id: "tier_50", credits: 50, amountCents: 850, name: "Starter" },
  tier_100: { id: "tier_100", credits: 100, amountCents: 1500, name: "Popular" },
  tier_250: { id: "tier_250", credits: 250, amountCents: 3250, name: "Pro" },
} as const;

export type CreditPlanId = keyof typeof CREDIT_PLANS;

export function getCreditPlan(value: unknown) {
  return typeof value === "string" && value in CREDIT_PLANS
    ? CREDIT_PLANS[value as CreditPlanId]
    : null;
}
