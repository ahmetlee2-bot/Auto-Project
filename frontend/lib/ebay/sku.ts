import { createHash } from "node:crypto";

export type GenerateSkuInput = {
  storeId?: string | null;
  userId: string;
  listingId: string;
  storeName?: string | null;
  sellerUsername?: string | null;
  skuPrefix?: string | null;
};

function normalizedPrefix(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
}

export function generateSku(input: GenerateSkuInput): string {
  const customPrefix = normalizedPrefix(String(input.skuPrefix || ""));
  const storeLabel = String(input.storeName || input.sellerUsername || "").trim();
  const prefix = (customPrefix || normalizedPrefix(storeLabel).slice(0, 3) || "INV");
  const namespace = String(input.storeId || input.userId).trim();
  const digest = createHash("sha256").update(`${namespace}:${input.listingId}`).digest("hex");
  const suffix = (BigInt(`0x${digest}`) % (36n ** 6n)).toString(36).toUpperCase().padStart(6, "0");
  return `${prefix}-${suffix}`;
}
