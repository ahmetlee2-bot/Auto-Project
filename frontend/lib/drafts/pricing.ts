export type DraftPriceInput = {
  source_price: number | string | null;
  shipping_cost: number | string;
  profit_margin_percent: number | string;
};

export const DRAFT_EBAY_FEE_PERCENT = 0;
export const DRAFT_PAYMENT_FEE_PERCENT = 0;
export const DRAFT_TOTAL_FEE_RATE = 0;

export function calculateDraftTargetPrice(input: DraftPriceInput): number | null {
  const sourcePrice = Number(input.source_price);
  const shipping = Number(input.shipping_cost ?? 0);
  const margin = Number(input.profit_margin_percent ?? 20);
  if (
    !Number.isFinite(sourcePrice) || sourcePrice <= 0 ||
    !Number.isFinite(shipping) || shipping < 0 ||
    !Number.isFinite(margin) || margin < 0 || margin > 300
  ) return null;
  return Math.ceil((((sourcePrice + shipping) * (1 + margin / 100)) / (1 - DRAFT_TOTAL_FEE_RATE)) * 100 - 1e-8) / 100;
}

export function calculateDraftEbayFee(salePrice: number | string | null | undefined): number | null {
  const price = Number(salePrice);
  if (!Number.isFinite(price) || price <= 0) return null;
  return Math.round(price * DRAFT_TOTAL_FEE_RATE * 100) / 100;
}

export function estimateDraftNetProfit(input: DraftPriceInput, salePrice?: number | string | null): number | null {
  const price = Number(salePrice ?? calculateDraftTargetPrice(input));
  const sourcePrice = Number(input.source_price);
  const shipping = Number(input.shipping_cost ?? 0);
  if (![price, sourcePrice, shipping].every(Number.isFinite) || price <= 0 || sourcePrice < 0 || shipping < 0) return null;
  const ebayFee = Math.round(price * DRAFT_TOTAL_FEE_RATE * 100) / 100;
  return Math.round((price - ebayFee - sourcePrice - shipping) * 100) / 100;
}

export function calculateEffectiveMarginPercent(
  input: { source_price: number | string | null; shipping_cost: number | string },
  salePrice: number | string | null | undefined,
): number | null {
  const sourcePrice = Number(input.source_price);
  const shipping = Number(input.shipping_cost ?? 0);
  const totalCost = sourcePrice + shipping;
  if (!Number.isFinite(totalCost) || totalCost <= 0) return null;
  const profit = estimateDraftNetProfit({ source_price: sourcePrice, shipping_cost: shipping, profit_margin_percent: 0 }, salePrice);
  if (profit === null) return null;
  return Math.round((profit / totalCost) * 1000) / 10;
}

export function resolveEffectiveDraftPrice(
  draft: DraftPriceInput & {
    manual_sale_price?: number | string | null;
    target_price?: number | string | null;
  },
): number | null {
  const calculated = calculateDraftTargetPrice(draft);
  const rawManual = draft.manual_sale_price == null || draft.manual_sale_price === "" ? null : Number(draft.manual_sale_price);
  if (rawManual !== null && Number.isFinite(rawManual) && rawManual > 0) {
    const manualProfit = estimateDraftNetProfit(draft, rawManual);
    const margin = Number(draft.profit_margin_percent ?? 0);
    // Never allow a stale or under-calculated manual_sale_price to produce a loss when target margin > 0
    if (manualProfit !== null && manualProfit < 0 && margin > 0 && calculated !== null) {
      return calculated;
    }
    return Math.round(rawManual * 100) / 100;
  }
  if (calculated !== null) return calculated;
  const fallbackTarget = draft.target_price == null || draft.target_price === "" ? null : Number(draft.target_price);
  return fallbackTarget !== null && Number.isFinite(fallbackTarget) && fallbackTarget > 0
    ? Math.round(fallbackTarget * 100) / 100
    : null;
}
