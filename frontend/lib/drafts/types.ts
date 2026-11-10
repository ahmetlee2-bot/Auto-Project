export type DraftStatus = "draft" | "publishing" | "published" | "error";

export type DraftProduct = {
  id: string;
  user_id: string;
  asin: string;
  source_url: string;
  supplier?: "amazon_de" | "joybuy_de";
  source_price: number | string | null;
  target_price: number | string | null;
  manual_sale_price: number | string | null;
  profit_margin_percent: number | string;
  shipping_cost: number | string;
  title: string;
  description_html: string;
  quantity?: number;
  images: string[];
  apply_custom_frame: boolean;
  cover_image_url?: string | null;
  cover_source_url?: string | null;
  published_images?: string[];
  selected_category_id: string | null;
  item_specifics?: Record<string, string[]>;
  status: DraftStatus;
  ebay_item_id?: string | null;
  ebay_offer_id?: string | null;
  last_error?: string | null;
  created_at: string;
  updated_at?: string;
};

export type DraftEditInput = Pick<DraftProduct,
  "title" | "description_html" | "images" | "selected_category_id" | "item_specifics" | "profit_margin_percent" | "shipping_cost" | "apply_custom_frame" | "manual_sale_price"
>;
