export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Product = {
  id: string; company_id: string; sku: string; name: string; description: string | null;
  category: string | null; model: string | null; material: string | null; size: string | null;
  specifications: Record<string, string>; cost: number | null; currency: string; moq: number | null;
  lead_time_days: number | null; unit: string | null; active: boolean; source_import_id: string | null;
  created_at: string; updated_at: string;
};
export type Company = {
  id: string; name: string; country: string; industry: string; website: string | null;
  default_currency: string; contact_email: string | null; contact_name: string | null;
};
export type Rfq = {
  id: string; company_id: string; reference: string; buyer_name: string; buyer_email: string | null;
  source_type: string; source_filename: string | null; document_id: string | null; status: string;
  notes: string | null; created_by: string | null; created_at: string; updated_at: string;
};
export type RfqItem = {
  id: string; company_id: string; rfq_id: string; line_no: number; requirement: string;
  quantity: number | null; unit: string | null; specs: Record<string, string>;
  matched_product_id: string | null; matched_sku: string | null; confidence: number;
  missing: string[]; review_status: string; created_at: string;
};
export type Quotation = {
  id: string; company_id: string; rfq_id: string; status: string; currency: string;
  notes: string | null; sent_at: string | null; pdf_document_id: string | null;
  outcome: "open" | "won" | "lost"; outcome_note: string | null;
  follow_up_due: string | null; last_followed_up_at: string | null;
  created_at: string; updated_at: string;
};
export type QuotationSend = {
  id: string; company_id: string; quotation_id: string; rfq_id: string; to_email: string;
  subject: string; body: string; status: string; provider: string; error: string | null;
  created_by: string | null; created_at: string;
};
export type QuotationItem = {
  id: string; company_id: string; quotation_id: string; rfq_item_id: string | null;
  sku: string | null; name: string; quantity: number | null; unit: string | null;
  unit_price: number | null; lead_time_days: number | null; notes: string | null;
};

type Table<Row, Insert, Update> = { Row: Row; Insert: Insert; Update: Update };

export type Database = {
  public: {
    Tables: {
      companies: Table<Company, Omit<Company, "id" | "contact_email" | "contact_name"> & { id?: string; contact_email?: string | null; contact_name?: string | null }, Partial<Company>>;
      products: Table<Product, Omit<Product, "id" | "created_at" | "updated_at"> & { id?: string }, Partial<Product>>;
      profiles: Table<{ id: string; email: string; full_name: string | null; created_at: string; updated_at: string }, { id: string; email: string; full_name?: string | null }, Partial<{ email: string; full_name: string | null }>>;
      company_members: Table<{ id: string; company_id: string; user_id: string; role: string; created_at: string }, { company_id: string; user_id: string; role: string }, Partial<{ role: string }>>;
      product_imports: Table<{ id: string; company_id: string; filename: string; status: string; total_rows: number; imported_rows: number; failed_rows: number; mapping: Json; created_at: string; completed_at: string | null }, { company_id: string; filename: string; status: string; total_rows: number; imported_rows: number; failed_rows: number; mapping: Json }, Partial<{ status: string; completed_at: string | null }>>;
      documents: Table<{ id: string; company_id: string; storage_path: string; original_filename: string; mime_type: string; size_bytes: number; document_type: string; created_at: string }, { company_id: string; storage_path: string; original_filename: string; mime_type: string; size_bytes: number; document_type: string }, Partial<{ original_filename: string }>>;
      rfqs: Table<Rfq, Omit<Rfq, "id" | "created_at" | "updated_at" | "buyer_email"> & { id?: string; created_at?: string; updated_at?: string; buyer_email?: string | null }, Partial<Rfq>>;
      rfq_items: Table<RfqItem, Omit<RfqItem, "id" | "created_at"> & { id?: string; created_at?: string }, Partial<RfqItem>>;
      quotations: Table<Quotation, Omit<Quotation, "id" | "created_at" | "updated_at" | "sent_at" | "pdf_document_id" | "outcome" | "outcome_note" | "follow_up_due" | "last_followed_up_at"> & { id?: string; sent_at?: string | null; pdf_document_id?: string | null; outcome?: Quotation["outcome"]; outcome_note?: string | null; follow_up_due?: string | null; last_followed_up_at?: string | null }, Partial<Quotation>>;
      quotation_items: Table<QuotationItem, Omit<QuotationItem, "id"> & { id?: string }, Partial<QuotationItem>>;
      quotation_sends: Table<QuotationSend, Omit<QuotationSend, "id" | "created_at"> & { id?: string; created_at?: string }, Partial<QuotationSend>>;
    };
  };
};
