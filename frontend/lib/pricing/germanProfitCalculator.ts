import {
  calculateDraftTargetPrice,
  DRAFT_EBAY_FEE_PERCENT,
  DRAFT_PAYMENT_FEE_PERCENT,
} from "../drafts/pricing";

export type GermanShippingTier = {
  code: "SUPPLIER_FREE" | "DHL_KLEINPAKET" | "DHL_PAKET";
  labelDe: string;
  labelTr: string;
  costEur: number;
};

export type GermanProfitBreakdown = {
  purchasePriceEur: number;
  recommendedEbayPriceEur: number;
  ebayFeePercent: number;
  ebayFixedFeeEur: number;
  ebayTotalFeeEur: number;
  returnBufferEur: number;
  shippingTier: GermanShippingTier;
  netProfitEur: number;
  netMarginPercent: number;
  roiPercent: number;
};

export function detectGermanShippingTier(input: {
  title?: string;
  supplier?: string | null;
  explicitShippingCost?: number | null;
}): GermanShippingTier {
  const explicit = Number(input.explicitShippingCost ?? 0);
  if (explicit <= 0) {
    return {
      code: "SUPPLIER_FREE",
      labelDe: "Direktversand DE (0,00 € Prime/Joybuy)",
      labelTr: "Ücretsiz Tedarikçi Kargosu (Prime/Joybuy 0€)",
      costEur: 0,
    };
  }
  if (explicit <= 4.2) {
    return {
      code: "DHL_KLEINPAKET",
      labelDe: "DHL Kleinpaket (bis 1 kg · 8 cm)",
      labelTr: "DHL Kleinpaket (3,99 €)",
      costEur: explicit,
    };
  }
  return {
    code: "DHL_PAKET",
    labelDe: "DHL Paket DE (versichert)",
    labelTr: "Standart DHL Paket",
    costEur: explicit,
  };
}

export function calculateGermanNetProfit(input: {
  purchasePriceEur: number;
  salePriceEur?: number | null;
  shippingCostEur?: number | null;
  targetMarginPercent?: number | null;
  categoryId?: string | null;
  title?: string;
  supplier?: string | null;
}): GermanProfitBreakdown {
  const cost = Math.max(0.01, Number(input.purchasePriceEur) || 0);
  const shippingTier = detectGermanShippingTier({
    title: input.title,
    supplier: input.supplier,
    explicitShippingCost: input.shippingCostEur,
  });
  const shipping = shippingTier.costEur;

  // Unified across AutoLister: 13% eBay commission + 2% payment/processing fee = 15% total fee
  const ebayFeePercent = DRAFT_EBAY_FEE_PERCENT;
  const returnBufferPercent = DRAFT_PAYMENT_FEE_PERCENT;
  const ebayFixedFeeEur = 0;

  const targetMargin = Number.isFinite(Number(input.targetMarginPercent))
    ? Number(input.targetMarginPercent)
    : 20;

  let salePrice = Number(input.salePriceEur);
  if (!Number.isFinite(salePrice) || salePrice <= 0) {
    salePrice =
      calculateDraftTargetPrice({
        source_price: cost,
        shipping_cost: shipping,
        profit_margin_percent: targetMargin,
      }) ?? Number(((cost + shipping) * 1.42).toFixed(2));
  }

  const combinedFeeEur = Math.round(salePrice * ((ebayFeePercent + returnBufferPercent) / 100) * 100) / 100;
  const ebayTotalFeeEur = Math.round(salePrice * (ebayFeePercent / 100) * 100) / 100;
  const returnBufferEur = Math.round((combinedFeeEur - ebayTotalFeeEur) * 100) / 100;
  const netProfitEur = Math.round((salePrice - combinedFeeEur - cost - shipping) * 100) / 100;
  const netMarginPercent = salePrice > 0 ? Number(((netProfitEur / salePrice) * 100).toFixed(1)) : 0;
  const totalCost = cost + shipping;
  const roiPercent = totalCost > 0 ? Number(((netProfitEur / totalCost) * 100).toFixed(1)) : 0;

  return {
    purchasePriceEur: cost,
    recommendedEbayPriceEur: salePrice,
    ebayFeePercent,
    ebayFixedFeeEur,
    ebayTotalFeeEur,
    returnBufferEur,
    shippingTier,
    netProfitEur,
    netMarginPercent,
    roiPercent,
  };
}
