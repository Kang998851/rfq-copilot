import { filledSpecsFrom } from "../rfq/missing";
import type { ExtractedHeader } from "../rfq/types";

export function quoteNumberFromRfq(reference: string): string {
  const match = /RFQ[- ]?(.+)/i.exec(reference.trim());
  return `QT-${(match?.[1] ?? reference).replace(/\s+/g, "")}`;
}

export function headerValue(header: unknown, key: keyof ExtractedHeader): string | null {
  if (!header || typeof header !== "object" || Array.isArray(header)) return null;
  const field = (header as ExtractedHeader)[key];
  const value = field?.value?.trim();
  return value || null;
}

export function defaultValidUntil(issued: Date): string {
  const next = new Date(issued.getTime());
  next.setDate(next.getDate() + 14);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

export function validUntil(header: unknown, issued: Date): { value: string; source: "customer" | "company_default" } {
  const customer = headerValue(header, "deadline");
  if (customer) return { value: customer, source: "customer" };
  return { value: defaultValidUntil(issued), source: "company_default" };
}

export function lineSpecification(specs: Record<string, unknown> | null | undefined): string {
  const filled = filledSpecsFrom(specs);
  const pick = (key: string) => {
    const value = specs?.[key];
    return typeof value === "string" && value.trim() ? value.trim() : (filled[key]?.trim() || "");
  };
  return [
    pick("size") || pick("Size"),
    pick("material") || pick("Material"),
    pick("Pressure Rating"),
    pick("Connection Type"),
    pick("Seat"),
    pick("Certificate Requirement"),
  ].filter(Boolean).join(" · ");
}
