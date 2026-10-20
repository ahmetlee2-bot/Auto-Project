export type DraftPriceInput = {
  source_price: number | string | null;
  shipping_cost: number | string;
  profit_margin_percent: number | string;
};

export const DRAFT_EBAY_FEE_PERCENT = 13;
export const DRAFT_PAYMENT_FEE_PERCENT = 2;

export function calculateDraftTargetPrice(input: DraftPriceInput): number | null {
  const sourcePrice = Number(input.source_price);
  const shipping = Number(input.shipping_cost);
  const margin = Number(input.profit_margin_percent);
  const feeRate = (DRAFT_EBAY_FEE_PERCENT + DRAFT_PAYMENT_FEE_PERCENT) / 100;
  if (
    !Number.isFinite(sourcePrice) || sourcePrice <= 0 ||
    !Number.isFinite(shipping) || shipping < 0 ||
    !Number.isFinite(margin) || margin < 0 || margin > 300
  ) return null;
  return Math.ceil((((sourcePrice + shipping) * (1 + margin / 100)) / (1 - feeRate)) * 100 - 1e-8) / 100;
}

export function estimateDraftNetProfit(input: DraftPriceInput, salePrice?: number | string | null): number | null {
  const price = Number(salePrice ?? calculateDraftTargetPrice(input));
  const sourcePrice = Number(input.source_price);
  const shipping = Number(input.shipping_cost);
  if (![price, sourcePrice, shipping].every(Number.isFinite) || price <= 0 || sourcePrice < 0 || shipping < 0) return null;
  return Math.round((price * (1 - (DRAFT_EBAY_FEE_PERCENT + DRAFT_PAYMENT_FEE_PERCENT) / 100) - sourcePrice - shipping) * 100) / 100;
}
