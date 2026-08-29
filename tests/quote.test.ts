import { describe, expect, it } from "vitest";
import { messages } from "@/lib/i18n/messages";
import { buildQuoteEmail, isValidEmail } from "@/lib/quote/email";
import {
  detectSmtpPreset,
  encodeMimeWord,
  formatFromAddress,
  mailboxAsUserSender,
  isCompleteSmtpReply,
  isSmtpReady,
  parseMailboxPayload,
  presetFromEmail,
  smtpPreset,
  stuffDots,
} from "@/lib/quote/smtp";
import { buildQuotePdf } from "@/lib/quote/pdf";
import { allPricesFilled, formatMoney, lineAmount, quoteTotal } from "@/lib/quote/totals";
import { extractBuyerEmail, extractFromRows, extractFromText } from "@/lib/rfq/extract";

function keyPaths(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return prefix ? [prefix] : [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => keyPaths(child, prefix ? `${prefix}.${key}` : key));
}

describe("quotation helpers", () => {
  const items = [
    { sku: "VLV-002", name: "Ball Valve", quantity: 10, unit: "pcs", unit_price: 18.9, lead_time_days: 12 },
    { sku: "PMP-001", name: "Pump", quantity: 2, unit: "unit", unit_price: 285, lead_time_days: 35 },
  ];

  it("totals line amounts and the quote", () => {
    expect(lineAmount(10, 18.9)).toBe(189);
    expect(quoteTotal(items)).toBe(759);
    expect(allPricesFilled(items)).toBe(true);
    expect(allPricesFilled([{ quantity: 1, unit_price: null }])).toBe(false);
    expect(formatMoney(759, "USD")).toContain("759");
  });

  it("builds a reviewed quotation email", () => {
    const email = buildQuoteEmail({
      locale: "en",
      buyerName: "Pacific Motion Systems",
      reference: "RFQ-2026-001",
      companyName: "Hengda",
      contactName: "Sales Desk",
      currency: "USD",
      items,
    });
    expect(email.subject).toContain("RFQ-2026-001");
    expect(email.body).toContain("VLV-002");
    expect(email.body).toContain("Pacific Motion");
    expect(email.body).toContain("Sales Desk");
    expect(isValidEmail("buyer@customer.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
  });

  it("extracts a buyer email from RFQ text", () => {
    const text = "From: Alex Chen <alex@pacific-motion.com>\nPlease quote 12 units of centrifugal pump 40mm cast iron";
    expect(extractBuyerEmail(text)).toBe("alex@pacific-motion.com");
    expect(extractFromText(text).buyer_email).toBe("alex@pacific-motion.com");
    const rows = extractFromRows([{ item: "Ball Valve DN25", quantity: "500", unit: "pcs", customer: "Northstar Industrial GmbH", email: "buyer@northstar.test" }]);
    expect(rows.buyer).toBe("Northstar Industrial GmbH");
    expect(rows.buyer_email).toBe("buyer@northstar.test");
  });

  it("builds a downloadable PDF quotation", () => {
    const pdf = buildQuotePdf({
      title: "Quotation",
      companyName: "Hengda",
      contactLine: "sales@hengda.test",
      reference: "RFQ-2026-001",
      date: "Date: 2026-08-29",
      currency: "USD",
      status: "Ready",
      buyerName: "Pacific Motion Systems",
      buyerEmail: "alex@pacific-motion.com",
      items,
      notes: "Reviewed prices",
      validity: "Valid 14 days",
      disclaimer: "Human review required",
    });
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    expect(new TextDecoder().decode(pdf)).toContain("RFQ-2026-001");
    expect(new TextDecoder().decode(pdf)).toContain("VLV-002");
  });

  it("prepares a free mailbox from common providers", () => {
    expect(smtpPreset("gmail")).toEqual({ host: "smtp.gmail.com", port: 587, secure: false });
    expect(presetFromEmail("sales@gmail.com")).toBe("gmail");
    expect(detectSmtpPreset("smtp.qq.com")).toBe("qq");
    expect(formatFromAddress("Hengda", "quotes@hengda.test")).toBe("Hengda <quotes@hengda.test>");
    expect(encodeMimeWord("报价")).toContain("UTF-8");
    expect(stuffDots(".hidden\nline")).toBe("..hidden\nline");
    expect(isCompleteSmtpReply("250 OK\r\n")).toBe(true);
    expect(isCompleteSmtpReply("250-PIPELINING\r\n250 AUTH\r\n")).toBe(true);
    expect(isCompleteSmtpReply("250-PIPELINING\r\n")).toBe(false);
    expect(isSmtpReady(parseMailboxPayload({
      host: "smtp.gmail.com",
      port: 587,
      username: "sales@gmail.com",
      password: "abcd efgh ijkl mnop",
      from: "sales@gmail.com",
    }))).toBe(true);
    expect(parseMailboxPayload({ host: "smtp.gmail.com", username: "sales@gmail.com" })).toBeNull();
    expect(mailboxAsUserSender({
      host: "smtp.gmail.com",
      port: 587,
      username: "sales@gmail.com",
      password: "app-pass",
      secure: false,
      from: "RFQ Copilot <noreply@example.com>",
    }, "Hengda Sales").from).toBe("Hengda Sales <sales@gmail.com>");
  });

  it("keeps English and Chinese dictionaries in sync", () => {
    expect(keyPaths(messages.zh).sort()).toEqual(keyPaths(messages.en).sort());
  });
});
