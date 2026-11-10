import "server-only";

export type SupplierId = "amazon_de" | "joybuy_de";
export type NormalizedSupplierProduct = {
  supplier: SupplierId; supplierProductId: string; sourceUrl: string; rawTitle: string;
  priceEur: number; inStock: boolean; images: string[]; bulletPoints: string[];
  specifications: Record<string, string>; rawDescription: string;
};
export interface SupplierAdapter {
  id: SupplierId;
  canHandle(input: string): boolean;
  fetchProduct(input: string): Promise<NormalizedSupplierProduct>;
}
