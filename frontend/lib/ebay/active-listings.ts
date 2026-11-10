import "server-only";
import { load } from "cheerio";
import { repricerAdmin } from "../repricer/admin";
import { ebayApiOrigin, validEbayToken } from "./multi-store";

export type ActiveListing = { listingId: string; storeId?: string; title: string; price: string; quantity: number; imageUrls: string[]; status?: string };

export async function activeListingsForUser(userId: string): Promise<{ listings: ActiveListing[]; connected: boolean }> {
  const { data: stores, error } = await repricerAdmin().from("ebay_stores").select("id,marketplace_id").eq("user_id", userId).neq("status", "paused");
  if (error) throw new Error(error.message);
  if (stores?.length) {
    const results = await Promise.all(stores.map(async store => {
      const token = await validEbayToken(store.id, userId);
      const listings: ActiveListing[] = [];
      const site: Record<string, string> = { EBAY_DE: "77", EBAY_US: "0", EBAY_GB: "3", EBAY_CA: "2", EBAY_AU: "15", EBAY_FR: "71", EBAY_IT: "101", EBAY_ES: "186" };
      for (let page = 1; page <= 50; page++) {
        const response = await fetch(`${ebayApiOrigin()}/ws/api.dll`, {
          method: "POST", cache: "no-store", signal: AbortSignal.timeout(25000),
          headers: { "Content-Type": "text/xml", "X-EBAY-API-CALL-NAME": "GetMyeBaySelling", "X-EBAY-API-SITEID": site[store.marketplace_id] || "77", "X-EBAY-API-COMPATIBILITY-LEVEL": "1423", "X-EBAY-API-IAF-TOKEN": token },
          body: `<?xml version="1.0" encoding="utf-8"?><GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination></ActiveList></GetMyeBaySellingRequest>`,
        });
        const $ = load(await response.text(), { xmlMode: true });
        if (!response.ok || !["Success", "Warning"].includes($("Ack").first().text())) throw new Error($("Errors LongMessage").first().text() || `eBay HTTP ${response.status}`);
        $("ActiveList ItemArray > Item").each((_index, element) => {
          const item = $(element), id = item.find("ItemID").first().text();
          if (!id) return;
          listings.push({ listingId: id, storeId: store.id, title: item.find("Title").first().text(),
            price: item.find("SellingStatus CurrentPrice").first().text(),
            quantity: Math.max(0, Number(item.find("Quantity").first().text() || 0) - Number(item.find("SellingStatus QuantitySold").first().text() || 0)),
            imageUrls: item.find("PictureDetails PictureURL, PictureDetails GalleryURL").toArray().map(image => $(image).text()).filter(Boolean), status: "ACTIVE" });
        });
        const pages = Number($("ActiveList PaginationResult TotalNumberOfPages").first().text() || 1);
        if (page >= pages) break;
        if (page === 50) throw new Error("Mağazada 10.000’den fazla aktif ilan var; daha dar bir mağaza seçimi gerekli.");
      }
      return listings;
    }));
    return { listings: results.flat(), connected: true };
  }
  if (userId !== process.env.EBAY_LEGACY_OWNER_USER_ID) return { listings: [], connected: false };
  const bridge = process.env.EBAY_BRIDGE_URL, secret = process.env.EBAY_BRIDGE_SHARED_SECRET;
  if (!bridge || !secret) return { listings: [], connected: false };
  const response = await fetch(`${bridge.replace(/\/$/, "")}/ebay/active-listings`, { headers: { "x-autolister-bridge-key": secret }, cache: "no-store", signal: AbortSignal.timeout(30000) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || body.error || "eBay ilanları okunamadı.");
  return { listings: body.listings || [], connected: true };
}
