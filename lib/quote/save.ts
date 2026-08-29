import { createClient } from "@/lib/supabase/client";
import type { Company, Quotation, QuotationItem, Rfq } from "@/types/database";
import type { Messages } from "@/lib/i18n/messages";
import { buildQuotePdf, downloadBlob } from "./pdf";

export async function downloadAndStoreQuotePdf(input: {
  rfq: Rfq;
  quote: Quotation;
  items: QuotationItem[];
  company: Company | null;
  copy: Messages["quoteDoc"];
}) {
  const bytes = buildQuotePdf({
    title: input.copy.quotation,
    companyName: input.company?.name ?? "RFQ Copilot",
    contactLine: [input.company?.contact_name, input.company?.contact_email, input.company?.website].filter(Boolean).join(" · "),
    reference: input.rfq.reference,
    date: `${input.copy.date}: ${new Date(input.quote.updated_at || input.quote.created_at).toLocaleDateString()}`,
    currency: input.quote.currency,
    status: input.quote.status === "sent" ? input.copy.sent : input.quote.status === "ready" ? input.copy.ready : input.copy.draft,
    buyerName: input.rfq.buyer_name,
    buyerEmail: input.rfq.buyer_email ?? "",
    items: input.items,
    notes: input.quote.notes ?? "",
    validity: input.copy.validity,
    disclaimer: input.copy.disclaimer,
  });
  const blob = new Blob([bytes], { type: "application/pdf" });
  const filename = `${input.rfq.reference}-quotation.pdf`;
  downloadBlob(blob, filename);
  const supabase = createClient();
  const path = `${input.rfq.company_id}/quotations/${crypto.randomUUID()}/${filename}`;
  const upload = await supabase.storage.from("company-documents").upload(path, blob, { contentType: "application/pdf", upsert: false });
  if (upload.error) return;
  const { data: doc } = await supabase.from("documents").insert({
    company_id: input.rfq.company_id,
    storage_path: path,
    original_filename: filename,
    mime_type: "application/pdf",
    size_bytes: blob.size,
    document_type: "quotation",
  }).select("id").single();
  if (doc) await supabase.from("quotations").update({ pdf_document_id: doc.id, updated_at: new Date().toISOString() }).eq("id", input.quote.id);
}
