export type CatalogProduct = {
  id: string;
  sku: string;
  name: string;
  model: string | null;
  material: string | null;
  size: string | null;
  category: string | null;
  cost: number | null;
  currency: string;
  moq: number | null;
  lead_time_days: number | null;
  unit: string | null;
  specifications: Record<string, string>;
  active?: boolean;
};

export type ExtractedItem = {
  requirement: string;
  quantity: number | null;
  unit: string | null;
  material: string | null;
  size: string | null;
  model: string | null;
  category: string | null;
  source_text?: string | null;
  source_ref?: string | null;
};

export type ExtractedRfq = {
  buyer: string;
  buyer_email?: string;
  items: ExtractedItem[];
};

export type MatchedItem = ExtractedItem & {
  matched_product_id: string | null;
  matched_sku: string | null;
  confidence: number;
  missing: string[];
};

export type SourceType = "pdf" | "excel" | "csv" | "email" | "text" | "image";
