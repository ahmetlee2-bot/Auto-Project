export function stripeConfigurationError(key: string | undefined, nodeEnv: string | undefined): string | null {
  const normalized = key?.trim() || "";
  if (!normalized) return "Stripe ist noch nicht konfiguriert.";
  if (!/^(?:sk|rk)_(?:test|live)_[A-Za-z0-9]+$/.test(normalized)) {
    return "Der Stripe-API-Schlüssel hat ein ungültiges Format.";
  }
  if (nodeEnv === "production" && normalized.includes("_test_")) {
    return "Stripe ist in der Produktionsumgebung nicht konfiguriert: Ein Live-Schlüssel ist erforderlich.";
  }
  return null;
}
