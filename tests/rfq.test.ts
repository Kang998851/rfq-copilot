import { describe, expect, it } from "vitest";
import { extractFromRows, extractFromText } from "@/lib/rfq/extract";
import { matchItems, rfqStatus, scoreProduct } from "@/lib/rfq/match";
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
  });

  it("increments RFQ references", () => {
    expect(nextReference(["RFQ-2026-001", "RFQ-2026-003"], 2026)).toBe("RFQ-2026-004");
  });
});
