const marketingScope = "https://api.ebay.com/oauth/api_scope/sell.marketing";

async function activatePromotion(draft, { accessToken, request }) {
  if (!draft.promotion) return draft;
  if (draft.promotion.status === "ACTIVE") return draft;
  if (draft.status !== "PUBLISHED" || !draft.listingId) throw new Error("Reklam icin yayinlanmis ilan gerekli.");
  const rate = Number(draft.promotion.bidPercentage);
  if (!Number.isFinite(rate) || rate < 2 || rate > 100) throw new Error("Reklam orani gecersiz.");
  const token = await accessToken([marketingScope]);
  const result = await request(token, "GET", "/sell/marketing/v1/ad_campaign?limit=100");
  const campaigns = (result.campaigns || []).filter(c => c.marketplaceId === (draft.marketplaceId || "EBAY_DE")
    && c.campaignStatus === "RUNNING" && c.fundingStrategy?.fundingModel === "COST_PER_SALE"
    && c.fundingStrategy?.adRateStrategy !== "DYNAMIC");
  if (campaigns.length !== 1) throw new Error("Tek bir aktif sabit oranli Basic kampanya secilmeli.");
  const campaignId = campaigns[0].campaignId;
  // The ad-level bid overrides the campaign default without changing other listings.
  await request(token, "POST", `/sell/marketing/v1/ad_campaign/${encodeURIComponent(campaignId)}/ad`, {
    listingId: draft.listingId, bidPercentage: rate.toFixed(1),
  });
  return { ...draft, promotion: { ...draft.promotion, campaignId, status: "ACTIVE", activatedAt: new Date().toISOString() } };
}

module.exports = { activatePromotion };
