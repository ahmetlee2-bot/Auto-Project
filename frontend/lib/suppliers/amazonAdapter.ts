import "server-only";
import { fetchAmazonProductDetails, parseAsin } from "../repricer/amazon";
import type { SupplierAdapter } from "./types";
export const amazonAdapter: SupplierAdapter = {
  id: "amazon_de",
  canHandle(input) { try { if (/^[A-Z0-9]{10}$/i.test(input.trim())) return true; return new URL(input).hostname.toLowerCase().replace(/^www\./, "") === "amazon.de"; } catch { return false; } },
  async fetchProduct(input) {
    const asin = parseAsin(input);
    const product = await fetchAmazonProductDetails(asin, "AMZ_DE");
    return { supplier:"amazon_de", supplierProductId:asin, sourceUrl:`https://www.amazon.de/dp/${asin}`, rawTitle:product.title, priceEur:product.price, inStock:product.inStock, images:product.images, bulletPoints:product.description.split(/\n/).filter(Boolean), specifications:Object.fromEntries(Object.entries(product.itemSpecifics).map(([k,v])=>[k,v.join(", ")])), rawDescription:product.description };
  },
};
