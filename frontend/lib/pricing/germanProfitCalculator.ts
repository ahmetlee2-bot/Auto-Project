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

  // eBay.de standard commercial seller fee: ~12% + €0.35 fixed + 2% return/ad buffer = 14% effective + €0.35
  const ebayFeePercent = 12;
  const returnBufferPercent = 2;
  const ebayFixedFeeEur = 0.35;
  const totalFeeRate = (ebayFeePercent + returnBufferPercent) / 100;

  const targetMargin = Number.isFinite(Number(input.targetMarginPercent))
    ? Number(input.targetMarginPercent)
    : 22;

  let salePrice = Number(input.salePriceEur);
  if (!Number.isFinite(salePrice) || salePrice <= 0) {
    const rawTarget = ((cost + shipping) * (1 + targetMargin / 100) + ebayFixedFeeEur) / (1 - totalFeeRate);
    salePrice = Number((Math.ceil(rawTarget) - 0.1).toFixed(2));
  }

  const ebayTotalFeeEur = Number(((salePrice * ebayFeePercent) / 100 + ebayFixedFeeEur).toFixed(2));
  const returnBufferEur = Number(((salePrice * returnBufferPercent) / 100).toFixed(2));
  const netProfitEur = Number((salePrice - cost - shipping - ebayTotalFeeEur - returnBufferEur).toFixed(2));
  const netMarginPercent = salePrice > 0 ? Number(((netProfitEur / salePrice) * 100).toFixed(1)) : 0;
  const roiPercent = cost > 0 ? Number(((netProfitEur / cost) * 100).toFixed(1)) : 0;

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
