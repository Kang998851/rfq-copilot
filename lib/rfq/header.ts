import type { ExtractedField, ExtractedHeader } from "./types";

export function emptyField(): ExtractedField {
  return { value: null, confidence: 0, source: null };
}

export function emptyHeader(): ExtractedHeader {
  return {
    phone: emptyField(),
    rfq_number: emptyField(),
    request_date: emptyField(),
    currency: emptyField(),
    incoterm: emptyField(),
    delivery_location: emptyField(),
    deadline: emptyField(),
    payment_terms: emptyField(),
    certification: emptyField(),
    notes: emptyField(),
  };
}

export function asField(value: unknown, fallbackSource: string | null = null): ExtractedField {
  if (value && typeof value === "object" && "value" in value) {
    const record = value as { value?: unknown; confidence?: unknown; source?: unknown };
    const text = record.value == null ? null : String(record.value).trim() || null;
    const confidence = typeof record.confidence === "number" ? Math.min(1, Math.max(0, record.confidence)) : text ? 0.6 : 0;
    const source = record.source == null ? fallbackSource : String(record.source);
    return { value: text, confidence, source: text ? source : null };
  }
  const text = value == null ? null : String(value).trim() || null;
  return { value: text, confidence: text ? 0.6 : 0, source: text ? fallbackSource : null };
}

function labeled(text: string, keys: string): { value: string; source: string } | null {
  const match = new RegExp(`(?:${keys})[:：]\\s*([^\\n]+)`, "i").exec(text);
  if (!match) return null;
  const value = match[1].replace(/\s+/g, " ").trim();
  return value ? { value, source: match[0].slice(0, 120) } : null;
}

export function extractHeader(text: string): ExtractedHeader {
  const header = emptyHeader();
  const phone = labeled(text, "phone|tel|telephone|mobile|电话");
  const rfqNumber = labeled(text, "rfq(?:\\s*(?:no|number|#))?|询盘编号")
    ?? (/RFQ[- ]?(\d{4}[-/]\d{2,}|[A-Z0-9]{4,})/i.exec(text) && { value: /RFQ[- ]?\d{4}[-/]\d{2,}|RFQ[- ]?[A-Z0-9]{4,}/i.exec(text)![0], source: "RFQ number" });
  const date = labeled(text, "date|request date|询盘日期");
  const currency = /\b(USD|EUR|GBP|CNY|RMB)\b/i.exec(text);
  const incoterm = /\b(FOB|CIF|EXW|CFR|DDP|DAP|FCA)\b/i.exec(text);
  const delivery = labeled(text, "deliver(?:y|ed)?(?:\\s+to)?|destination|目的地|交货");
  const deadline = labeled(text, "deadline|needed by|valid until|截止日期");
  const payment = labeled(text, "payment(?:\\s+terms)?|付款");
  const certification = /\b(CE|ISO\s?\d+|EN\s?10204(?:\s*3\.1)?)\b/i.exec(text);

  if (phone) header.phone = { value: phone.value, confidence: 0.75, source: phone.source };
  if (rfqNumber) header.rfq_number = { value: rfqNumber.value, confidence: 0.7, source: rfqNumber.source };
  if (date) header.request_date = { value: date.value, confidence: 0.65, source: date.source };
  if (currency) header.currency = { value: currency[1].toUpperCase().replace("RMB", "CNY"), confidence: 0.8, source: currency[0] };
  if (incoterm) header.incoterm = { value: incoterm[1].toUpperCase(), confidence: 0.85, source: incoterm[0] };
  if (delivery) header.delivery_location = { value: delivery.value, confidence: 0.7, source: delivery.source };
  if (deadline) header.deadline = { value: deadline.value, confidence: 0.7, source: deadline.source };
  if (payment) header.payment_terms = { value: payment.value, confidence: 0.7, source: payment.source };
  if (certification) header.certification = { value: certification[0], confidence: 0.75, source: certification[0] };
  return header;
}

export function mergeHeader(primary: ExtractedHeader | undefined, fallback: ExtractedHeader): ExtractedHeader {
  const next = emptyHeader();
  (Object.keys(next) as (keyof ExtractedHeader)[]).forEach((key) => {
    const left = primary?.[key];
    next[key] = left?.value ? left : fallback[key];
  });
  return next;
}

export function parseTargetPrice(line: string): number | null {
  const match = /(?:target|budget|offer)\s*(?:price|unit)?[:\s]*[$€£]?\s*(\d+(?:\.\d+)?)/i.exec(line);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}
