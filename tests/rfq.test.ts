import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "@/lib/rfq/checksum";
import { extractFromRows, extractFromText, keepSourceTraces, parseExtracted, toExtracted } from "@/lib/rfq/extract";
import { emptyHeader, extractHeader, parseTargetPrice } from "@/lib/rfq/header";
import { appendActivity, askBuyerQuestion, needsLineReview, setFieldStatus, visibleMissing } from "@/lib/rfq/review";
import { messages } from "@/lib/i18n/messages";
import { extractPdfText } from "@/lib/rfq/pdf-text";
import { fileToContent, sourceTypeFromName } from "@/lib/rfq/parse";
import { matchItems, rfqStatus, scoreProduct } from "@/lib/rfq/match";
import { looksEnglish, translateRequirement } from "@/lib/i18n/requirement";
import { nextReference } from "@/lib/rfq/reference";
import type { CatalogProduct } from "@/lib/rfq/types";

const catalog: CatalogProduct[] = [
  { id: "1", sku: "VLV-002", name: "Ball Valve", model: "BV220-25", material: "SS304", size: "DN25", category: "Valve", cost: 18.9, currency: "USD", moq: 20, lead_time_days: 12, unit: "pcs", specifications: { pressure: "PN16" }, active: true },
  { id: "2", sku: "PMP-001", name: "Horizontal Centrifugal Pump", model: "CP-40", material: "Cast Iron", size: "40mm", category: "Pump", cost: 285, currency: "USD", moq: 2, lead_time_days: 35, unit: "unit", specifications: {}, active: true },
];

describe("rfq matching", () => {
  it("scores an exact-looking valve requirement highly", () => {
    const score = scoreProduct({ requirement: "Ball Valve · DN25 · PN16 · SS304", quantity: 500, unit: "pcs", material: "SS304", size: "DN25", model: null, category: "Valve" }, catalog[0]);
    expect(score).toBeGreaterThan(50);
  });

  it("matches extracted items to catalog products", () => {
    const extracted = extractFromRows([{ item: "Ball Valve DN25 PN16 SS304", quantity: "500", unit: "pcs", specification: "Need CE certificate" }]);
    const matched = matchItems(extracted.items, catalog);
    expect(matched[0].matched_sku).toBe("VLV-002");
    expect(matched[0].missing).toContain("Certificate Requirement");
    expect(rfqStatus(matched)).toBe("needs_review");
  });

  it("extracts quantity from free text", () => {
    const extracted = extractFromText("From: Pacific Motion Systems\nPlease quote 12 units of centrifugal pump 40mm cast iron");
    expect(extracted.buyer).toMatch(/Pacific Motion/);
    expect(extracted.items.length).toBeGreaterThan(0);
    expect(extracted.items[0].quantity).toBe(12);
    expect(extracted.items[0].source_ref).toMatch(/^line /);
    expect(extracted.items[0].source_text).toContain("centrifugal pump");
  });

  it("increments RFQ references", () => {
    expect(nextReference(["RFQ-2026-001", "RFQ-2026-003"], 2026)).toBe("RFQ-2026-004");
  });

  it("translates English customer requirements into the working language", () => {
    const source = "500 pcs Ball Valve DN25 PN16 SS304, CE certificate and EN 10204 3.1, flanged";
    expect(looksEnglish(source)).toBe(true);
    const zh = translateRequirement(source, "zh");
    expect(zh.changed).toBe(true);
    expect(zh.text).toContain("球阀");
    expect(zh.text).toContain("法兰连接");
    expect(zh.text).toContain("CE 认证");
    expect(zh.text).toContain("DN25");
    expect(zh.original).toBe(source);
    expect(translateRequirement(zh.text, "zh").changed).toBe(false);
    expect(translateRequirement(source, "en").changed).toBe(false);
  });

  it("extracts text from a text PDF and refuses to invent scan content", () => {
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
    expect(extracted.kind).toBe("text");
    expect(extracted.text).toContain("Ball Valve DN25");
    expect(extractPdfText(new TextEncoder().encode("%PDF-1.1 empty scan")).kind).toBe("empty");
    expect(extractPdfText(new TextEncoder().encode("not a pdf")).kind).toBe("invalid");
  });

  it("keeps a stable checksum and labels spreadsheet sources", async () => {
    const hex = await sha256Hex(new TextEncoder().encode("rfq"));
    expect(hex).toHaveLength(64);
    expect(hex).toBe(await sha256Hex(new TextEncoder().encode("rfq")));
    const rows = extractFromRows([{ item: "Ball Valve DN25", quantity: "500", unit: "pcs" }]);
    expect(rows.items[0].source_ref).toBe("row 2");
    expect(rows.items[0].source_text).toContain("Ball Valve");
    expect(sourceTypeFromName("scan.png", "image/png")).toBe("image");
  });

  it("does not invent text from images and keeps AI traces from the source file", async () => {
    const parsed = await fileToContent(new File([new Uint8Array([137, 80, 78, 71])], "scan.png", { type: "image/png" }));
    expect(parsed.extractKind).toBe("image");
    expect(parsed.text).toBe("");
    const heuristic = extractFromText("Please quote 12 units of centrifugal pump 40mm");
    const merged = keepSourceTraces({
      buyer: "AI Buyer",
      header: emptyHeader(),
      extraction_status: "ai",
      items: [{ requirement: "centrifugal pump", quantity: 12, unit: "units", material: null, size: "40mm", model: null, category: null }],
    }, heuristic);
    expect(merged.buyer).toBe("AI Buyer");
    expect(merged.items[0].source_ref).toMatch(/^line /);
    expect(merged.items[0].source_text).toContain("centrifugal pump");
  });

  it("filters ignored missing fields and writes review activity", () => {
    expect(visibleMissing(["Voltage", "Certificate Requirement"], { Voltage: "ignored" })).toEqual(["Certificate Requirement"]);
    expect(setFieldStatus({}, "quantity", "approved").quantity).toBe("approved");
    expect(askBuyerQuestion(3, "pressure rating")).toContain("item 3");
    expect(needsLineReview(0.4, "pending")).toBe(true);
    expect(needsLineReview(0.9, "accepted")).toBe(false);
    expect(appendActivity([], "approved", "line 1")[0].action).toBe("approved");
  });

  it("keeps English and Chinese message keys in sync", () => {
    const paths = (value: unknown, prefix = ""): string[] => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return prefix ? [prefix] : [];
      return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
        paths(child, prefix ? `${prefix}.${key}` : key),
      );
    };
    expect(paths(messages.zh)).toEqual(paths(messages.en));
  });

  it("extracts stated header fields and refuses invented prices", () => {
    const header = extractHeader("From: Nordland\nPhone: +49 40 555 010\nDelivery: Hamburg\nIncoterm: FOB Shanghai\nPayment: 30 days\nCurrency: EUR\nPlease quote 12 units of pump, CE certificate");
    expect(header.incoterm.value).toBe("FOB");
    expect(header.currency.value).toBe("EUR");
    expect(header.phone.value).toContain("+49");
    expect(header.certification.value).toMatch(/CE/i);
    expect(parseTargetPrice("Please quote 12 units of pump")).toBeNull();
    expect(parseTargetPrice("Target price: 18.5")).toBe(18.5);
    expect(parseExtracted({ buyer: "x", items: [] }).success).toBe(true);
    expect(parseExtracted({ buyer: "x" }).success).toBe(false);
    const parsed = parseExtracted({
      buyer: "Nordland",
      items: [{ requirement: "pump", quantity: 12, unit: "units", material: null, size: null, model: null, category: null, target_price: 18.5 }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(toExtracted(parsed.data, "ai").items[0].target_price).toBe(18.5);
  });

  it("extracts the Nordland customer RFQ email", () => {
    const text = readFileSync(resolve("sample-data/customer-rfq-nordland.txt"), "utf8");
    const extracted = extractFromText(text);
    expect(extracted.buyer).toMatch(/Nordland Process Equipment/);
    expect(extracted.buyer_email).toBe("purchasing@nordland-process.test");
    expect(extracted.items.length).toBeGreaterThanOrEqual(12);
    const ballValve = extracted.items.find((item) => /ball valve/i.test(item.requirement));
    expect(ballValve?.quantity).toBe(500);
    expect(ballValve?.unit).toMatch(/pcs/i);
  });
});
