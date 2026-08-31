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

export type ExtractedField = {
  value: string | null;
  confidence: number;
  source: string | null;
};

export type ExtractedHeader = {
  phone: ExtractedField;
  rfq_number: ExtractedField;
  request_date: ExtractedField;
  currency: ExtractedField;
  incoterm: ExtractedField;
  delivery_location: ExtractedField;
  deadline: ExtractedField;
  payment_terms: ExtractedField;
  certification: ExtractedField;
  notes: ExtractedField;
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
  requested_sku?: string | null;
  target_price?: number | null;
  requested_delivery?: string | null;
  certification?: string | null;
  notes?: string | null;
  extract_confidence?: number | null;
};

export type ExtractionStatus = "heuristic" | "ai" | "failed";

export type ExtractedRfq = {
  buyer: string;
  buyer_email?: string;
  header: ExtractedHeader;
  extraction_status: ExtractionStatus;
  items: ExtractedItem[];
};

export type MatchMemory = {
  requirement: string;
  sku: string;
};

export type MatchCandidate = {
  product_id: string;
  sku: string;
  name: string;
  model: string | null;
  material: string | null;
  size: string | null;
  cost: number | null;
  currency: string;
  moq: number | null;
  lead_time_days: number | null;
  confidence: number;
  reasons: string[];
};

export type MatchedItem = ExtractedItem & {
  matched_product_id: string | null;
  matched_sku: string | null;
  confidence: number;
  missing: string[];
  match_reasons?: string[];
  candidates?: MatchCandidate[];
};

export type SourceType = "pdf" | "excel" | "csv" | "email" | "text" | "image";
