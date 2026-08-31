import { createClient } from "@/lib/supabase/client";
import type { Company, Quotation, QuotationItem, Rfq, RfqItem } from "@/types/database";
import type { Messages } from "@/lib/i18n/messages";
import { jpegFromDataUrl, readStoredBranding } from "./branding";
import { headerValue, lineSpecification, quoteNumberFromRfq, validUntil } from "./document";
import { buildQuotePdf, downloadBlob } from "./pdf";

export async function downloadAndStoreQuotePdf(input: {
  rfq: Rfq;
  quote: Quotation;
  items: QuotationItem[];
  rfqItems?: RfqItem[];
  company: Company | null;
  copy: Messages["quoteDoc"];
}) {
  const branding = input.company ? readStoredBranding(input.company.id) : { logoDataUrl: null, accent: "#26448c", footer: "", terms: "" };
  const issued = new Date(input.quote.updated_at || input.quote.created_at);
  const until = validUntil(input.rfq.extracted_header, issued);
  const specs = new Map((input.rfqItems ?? []).map((row) => [row.id, lineSpecification(row.specs)]));
  const bytes = buildQuotePdf({
    title: input.copy.quotation,
    companyName: input.company?.name ?? "RFQ Copilot",
    contactLine: [input.company?.contact_name, input.company?.contact_email, input.company?.website].filter(Boolean).join(" · "),
    reference: input.rfq.reference,
    quoteNumber: quoteNumberFromRfq(input.rfq.reference),
    date: `${input.copy.date}: ${issued.toLocaleDateString()}`,
    validUntil: until.value,
    currency: input.quote.currency,
    status: input.quote.status === "sent" ? input.copy.sent : input.quote.status === "ready" ? input.copy.ready : input.copy.draft,
    buyerName: input.rfq.buyer_name,
    buyerEmail: input.rfq.buyer_email ?? "",
    incoterm: headerValue(input.rfq.extracted_header, "incoterm"),
    payment: headerValue(input.rfq.extracted_header, "payment_terms"),
    delivery: headerValue(input.rfq.extracted_header, "delivery_location"),
    items: input.items.map((item) => ({ ...item, spec: specs.get(item.rfq_item_id ?? "") || "" })),
    notes: input.quote.notes ?? "",
    validity: until.source === "customer" ? input.copy.validUntilCustomer : input.copy.validity,
    disclaimer: input.copy.disclaimer,
    footer: branding.footer,
    terms: branding.terms,
    accent: branding.accent,
    logoJpeg: branding.logoDataUrl ? jpegFromDataUrl(branding.logoDataUrl) : null,
    notProvided: input.copy.notProvided,
    signature: input.copy.signature,
  });
  const blob = new Blob([bytes], { type: "application/pdf" });
  const filename = `${quoteNumberFromRfq(input.rfq.reference)}-quotation.pdf`;
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
