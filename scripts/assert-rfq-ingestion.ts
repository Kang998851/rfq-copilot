import { sha256Hex } from "../lib/rfq/checksum.ts";
import { extractFromRows, extractFromText, keepSourceTraces, parseExtracted } from "../lib/rfq/extract.ts";
import { requiredMissing } from "../lib/rfq/missing.ts";
import { rankCandidates } from "../lib/rfq/match.ts";
import { emptyHeader, extractHeader, parseTargetPrice } from "../lib/rfq/header.ts";
import { askBuyerQuestion, needsLineReview, visibleMissing } from "../lib/rfq/review.ts";
import { messages } from "../lib/i18n/messages.ts";
import { extractPdfText } from "../lib/rfq/pdf-text.ts";
import { fileToContent, sourceTypeFromName } from "../lib/rfq/parse.ts";
import { saleFromMargin, saleFromMarkup, quoteCurrency, suggestUnitPrice } from "../lib/quote/pricing.ts";
import { buildQuotePdf } from "../lib/quote/pdf.ts";
import { quoteNumberFromRfq } from "../lib/quote/document.ts";
import { buildQuoteEmail, listUnresolvedGaps } from "../lib/quote/email.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function keyPaths(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return prefix ? [prefix] : [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    keyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

const stream = "BT /F1 12 Tf 72 720 Td (Ball Valve DN25 500 pcs) Tj ET";
const pdf = `%PDF-1.1
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>endobj
4 0 obj<< /Length ${stream.length} >>stream
${stream}
endstream
endobj
trailer<< /Root 1 0 R >>
%%EOF`;

const extracted = extractPdfText(new TextEncoder().encode(pdf));
assert(extracted.kind === "text", "text PDF should extract");
assert(extracted.text.includes("Ball Valve DN25"), "text PDF should contain literals");
assert(extractPdfText(new TextEncoder().encode("%PDF-1.1 empty scan")).kind === "empty", "scan PDF must stay empty");
assert(extractPdfText(new TextEncoder().encode("not a pdf")).kind === "invalid", "non-PDF is invalid");

const hex = await sha256Hex(new TextEncoder().encode("rfq"));
assert(hex.length === 64, "checksum length");
assert(hex === await sha256Hex(new TextEncoder().encode("rfq")), "checksum is stable");

const rows = extractFromRows([{ item: "Ball Valve DN25", quantity: "500", unit: "pcs" }]);
assert(rows.items[0].source_ref === "row 2", "spreadsheet source_ref");
assert(rows.items[0].source_text?.includes("Ball Valve"), "spreadsheet source_text");
assert(sourceTypeFromName("scan.png", "image/png") === "image", "image source type");

const text = extractFromText("From: Pacific Motion Systems\nPlease quote 12 units of centrifugal pump 40mm cast iron");
assert(text.items[0].quantity === 12, "text quantity");
assert(/^line /.test(text.items[0].source_ref ?? ""), "text source_ref");

const parsed = await fileToContent(new File([new Uint8Array([137, 80, 78, 71])], "scan.png", { type: "image/png" }));
assert(parsed.extractKind === "image", "image extractKind");
assert(parsed.text === "", "image must not invent text");

const merged = keepSourceTraces({
  buyer: "AI Buyer",
  header: emptyHeader(),
  extraction_status: "ai",
  items: [{ requirement: "centrifugal pump", quantity: 12, unit: "units", material: null, size: "40mm", model: null, category: null }],
}, text);
assert(merged.buyer === "AI Buyer", "AI buyer kept");
assert(/^line /.test(merged.items[0].source_ref ?? ""), "AI items keep heuristic source_ref");

const en = keyPaths(messages.en).join("\n");
const zh = keyPaths(messages.zh).join("\n");
assert(en === zh, "i18n keys must match");
assert(messages.en.rfqDetail.unresolvedWarn.includes("Unresolved RFQ fields remain"), "unresolved warn copy");

const header = extractHeader("Phone: +49 40 555 010\nIncoterm: FOB Shanghai\nCurrency: EUR\nPlease quote 12 units of pump, CE");
assert(header.incoterm.value === "FOB", "incoterm");
assert(header.currency.value === "EUR", "currency");
assert(parseTargetPrice("Please quote 12 units") === null, "do not invent price");
assert(parseTargetPrice("Target price: 18.5") === 18.5, "stated target price");
assert(parseExtracted({ buyer: "x" }).success === false, "invalid JSON rejected");
assert(visibleMissing(["Voltage", "CE"], { Voltage: "ignored" }).join() === "CE", "ignored missing hidden");
assert(needsLineReview(0.4, "pending"), "low confidence needs review");
assert(askBuyerQuestion(3, "pressure").includes("item 3"), "buyer question");

const ranked = rankCandidates(
  { requirement: "SKU VLV-002 ball valve DN25 SS304", quantity: 10, unit: "pcs", material: "SS304", size: "DN25", model: null, category: "Valve", requested_sku: "VLV-002" },
  [{ id: "1", sku: "VLV-002", name: "Ball Valve", model: "BV220-25", material: "SS304", size: "DN25", category: "Valve", cost: 18.9, currency: "USD", moq: 20, lead_time_days: 12, unit: "pcs", specifications: { pressure: "PN16" }, active: true }],
);
assert(ranked[0]?.sku === "VLV-002", "exact SKU ranks first");
assert(ranked[0]?.reasons.includes("skuExact"), "SKU reason");
assert(requiredMissing({ requirement: "Ball Valve", quantity: 1, unit: "pcs", material: null, size: null, model: null, category: "Valve" }, null).includes("Seat"), "valve seat missing");
assert(!requiredMissing({ requirement: "Ball Valve", quantity: 1, unit: "pcs", material: null, size: null, model: null, category: "Valve" }, null, { Seat: "PTFE" }).includes("Seat"), "filled seat is not missing");
assert(saleFromMargin(18.9, 0.2) === 23.63, "margin sale");
assert(saleFromMarkup(18.9, 0.25) === 23.63, "markup sale");
assert(quoteCurrency(null, "CNY").source === "company_default", "suggested default currency");
assert(suggestUnitPrice({
  cost: 18.9,
  cost_currency: "USD",
  quote_currency: "EUR",
  rules: { method: "margin", default_margin: 0.2, default_markup: 0, minimum_margin: 0, category_margins: {} },
  product: { category: "Valve", specifications: {} },
}).unit_price === null, "do not invent FX");
assert(quoteNumberFromRfq("RFQ-2026-001") === "QT-2026-001", "quote number from RFQ");
const quotePdf = buildQuotePdf({
  title: "Quotation",
  companyName: "Hengda",
  contactLine: "sales",
  reference: "RFQ-2026-001",
  quoteNumber: "QT-2026-001",
  date: "Date",
  validUntil: "2026-09-12",
  currency: "USD",
  status: "Ready",
  buyerName: "Buyer",
  buyerEmail: "",
  incoterm: null,
  items: [{ sku: "VLV-002", name: "Ball Valve", quantity: 10, unit: "pcs", unit_price: 18.9, lead_time_days: 12, spec: "DN25" }],
  notes: "",
  validity: "Valid 14 days",
  disclaimer: "Human review",
  signature: "Authorized signature / Date",
  notProvided: "Not provided",
});
const pdfText = new TextDecoder("latin1").decode(quotePdf);
assert(pdfText.startsWith("%PDF-"), "pdf header");
assert(pdfText.includes("QT-2026-001"), "quote number in pdf");
assert(pdfText.includes("Incoterm: Not provided"), "do not invent incoterm");
assert(pdfText.includes("Authorized signature"), "signature area");

const emailItems = [{ sku: "VLV-002", name: "Ball Valve", quantity: 10, unit: "pcs", unit_price: 18.9, lead_time_days: 12 }];
const unresolved = listUnresolvedGaps([{
  line_no: 1,
  review_status: "pending",
  missing: ["Seat"],
  requirement: "Ball Valve",
  quantity: 10,
  unit: "pcs",
}]);
const draftEmail = buildQuoteEmail({
  locale: "en",
  buyerName: "Buyer",
  reference: "RFQ-2026-001",
  quoteNumber: "QT-2026-001",
  companyName: "Hengda",
  currency: "USD",
  items: emailItems,
  unresolved,
});
assert(draftEmail.body.includes("Unresolved RFQ fields remain"), "unresolved warning in draft");
assert(!draftEmail.body.includes("reviewed by our team"), "unresolved draft is not a confirmed offer");
const firmEmail = buildQuoteEmail({
  locale: "en",
  buyerName: "Buyer",
  reference: "RFQ-2026-001",
  companyName: "Hengda",
  currency: "USD",
  items: emailItems,
});
assert(!firmEmail.body.includes("Unresolved RFQ fields remain"), "confirmed path has no unresolved warning");
assert(firmEmail.body.includes("reviewed by our team"), "confirmed path keeps reviewed wording");

console.log("rfq ingestion asserts: PASS");
