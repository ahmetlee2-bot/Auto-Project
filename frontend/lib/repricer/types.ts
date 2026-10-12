export type SyncStatus = "synced" | "price_changed" | "out_of_stock" | "error";

export type TrackedProduct = {
  id: string;
  user_id: string;
  title: string;
  image_url: string | null;
  amazon_asin: string;
  amazon_url: string;
  amazon_price: number | null;
  amazon_stock_status: boolean | null;
  ebay_item_id: string;
  ebay_url: string;
  ebay_price: number | null;
  ebay_quantity: number;
  target_margin_percent: number;
  estimated_shipping: number;
  ebay_fee_percent: number;
  payment_fee_percent: number;
  desired_quantity: number;
  amazon_price_delta: number | null;
  last_checked_at: string | null;
  sync_status: SyncStatus;
  last_error: string | null;
  active: boolean;
};
