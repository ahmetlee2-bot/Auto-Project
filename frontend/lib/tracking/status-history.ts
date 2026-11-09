export const DELIVERY_STATUSES = ["ORDER_RECEIVED", "SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "EXCEPTION"] as const;
export type DeliveryStatus = typeof DELIVERY_STATUSES[number];
export const STATUS_LABELS: Record<DeliveryStatus, string> = {
  ORDER_RECEIVED: "Bestelldaten wurden übernommen.", SHIPPED: "Die Lieferanteninformation meldet den Versand.",
  IN_TRANSIT: "Die Sendung ist laut Lieferanteninformation unterwegs.", OUT_FOR_DELIVERY: "Die Sendung ist laut Lieferanteninformation in Zustellung.",
  DELIVERED: "Die Lieferanteninformation meldet die Zustellung.", EXCEPTION: "Die Lieferanteninformation meldet eine Verzögerung oder Ausnahme.",
};

export function isDeliveryStatus(value: unknown): value is DeliveryStatus {
  return DELIVERY_STATUSES.includes(String(value || "") as DeliveryStatus);
}

export function nextDeliveryStatus(current: DeliveryStatus, incoming: DeliveryStatus): DeliveryStatus {
  if (current === "DELIVERED") return current;
  if (incoming === "EXCEPTION") return incoming;
  if (current === "EXCEPTION") return incoming;
  const rank: Record<DeliveryStatus, number> = { ORDER_RECEIVED: 0, SHIPPED: 1, IN_TRANSIT: 2, OUT_FOR_DELIVERY: 3, DELIVERED: 4, EXCEPTION: -1 };
  return rank[incoming] >= rank[current] ? incoming : current;
}

export function appendDeliveryStatus(historyValue: unknown, current: DeliveryStatus, next: DeliveryStatus, at = new Date().toISOString()) {
  const history = Array.isArray(historyValue) ? historyValue.filter(item => item && typeof item === "object").slice(-49) as Array<Record<string, unknown>> : [];
  if (current === next) return history.length ? history : [{ at, status: next, description: STATUS_LABELS[next] }];
  return [...history, { at, status: next, description: STATUS_LABELS[next] }];
}
