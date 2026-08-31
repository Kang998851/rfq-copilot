import { formatMoney, lineAmount, quoteTotal } from "./totals";
import { liveMissing } from "../rfq/missing";
import { reviewsFromSpecs, visibleMissing } from "../rfq/review";
import type { CatalogProduct } from "../rfq/types";

export type QuoteEmailItem = {
  sku: string | null;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  lead_time_days: number | null;
};

export type QuoteEmailInput = {
  locale: "en" | "zh";
  buyerName: string;
  reference: string;
  quoteNumber?: string;
  companyName: string;
  contactName?: string | null;
  currency: string;
  items: QuoteEmailItem[];
  unresolved?: string[];
};

export type GapLine = {
  line_no: number;
  review_status: string;
  missing: string[];
  requirement: string;
  quantity: number | null;
  unit: string | null;
  specs?: Record<string, unknown> | null;
  requested_sku?: string | null;
  product?: CatalogProduct | null;
};

export function listUnresolvedGaps(lines: GapLine[]): string[] {
  const gaps: string[] = [];
  for (const line of lines) {
    if (line.review_status === "rejected") continue;
    const stored = line.review_status === "accepted"
      ? line.missing.filter((item) => item !== "Match confirmation")
      : line.missing;
    const visible = visibleMissing(liveMissing({
      requirement: line.requirement,
      quantity: line.quantity,
      unit: line.unit,
      specs: line.specs,
      requested_sku: line.requested_sku,
      missing: stored,
    }, line.product ?? null), reviewsFromSpecs(line.specs));
    for (const label of visible) gaps.push(`item ${line.line_no}: ${label}`);
  }
  return gaps;
}

export function isValidEmail(value: string): boolean {
  return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value.trim());
}

export function mailtoHref(to: string, subject: string, body: string): string {
  return `mailto:${to.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function composeHref(from: string, to: string, subject: string, body: string): string {
  const domain = from.trim().split("@")[1]?.toLowerCase() ?? "";
  const recipient = to.trim();
  if (domain === "gmail.com" || domain === "googlemail.com") {
    const query = new URLSearchParams({ view: "cm", fs: "1", to: recipient, su: subject, body });
    return `https://mail.google.com/mail/?${query.toString()}`;
  }
  if (domain === "outlook.com" || domain === "hotmail.com" || domain === "live.com" || domain.endsWith(".onmicrosoft.com")) {
    const query = new URLSearchParams({ to: recipient, subject, body });
    return `https://outlook.live.com/mail/0/deeplink/compose?${query.toString()}`;
  }
  if (domain === "qq.com" || domain.endsWith(".qq.com")) {
    return mailtoHref(recipient, subject, body);
  }
  return mailtoHref(recipient, subject, body);
}

export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#172033;white-space:pre-wrap">${escaped}</div>`;
}

export function buildQuoteEmail(input: QuoteEmailInput): { subject: string; body: string } {
  const buyer = input.buyerName.trim() || (input.locale === "zh" ? "客户" : "Customer");
  const signoff = input.contactName?.trim() || input.companyName;
  const total = quoteTotal(input.items);
  const ref = input.quoteNumber ? `${input.quoteNumber} / ${input.reference}` : input.reference;
  const unresolved = (input.unresolved ?? []).filter(Boolean);
  const lines = input.items.map((item) => {
    const qty = `${item.quantity ?? "?"} ${item.unit ?? ""}`.trim();
    const amount = formatMoney(lineAmount(item.quantity, item.unit_price), input.currency);
    const lead = item.lead_time_days != null ? (input.locale === "zh" ? `，交期 ${item.lead_time_days} 天` : `, lead time ${item.lead_time_days} days`) : "";
    return `- ${item.sku ?? "—"} ${item.name} × ${qty} @ ${formatMoney(item.unit_price, input.currency)} = ${amount}${lead}`;
  }).join("\n");

  if (input.locale === "zh") {
    if (unresolved.length) {
      return {
        subject: `${input.reference} 报价草稿 — 仍有待确认事项`,
        body: `${buyer} 您好，\n\n感谢贵司询盘 ${ref}。这是一份待确认的报价草稿，不是最终确认函。\n\n仍有未解决的询盘字段：\n${unresolved.map((item) => `- ${item}`).join("\n")}\n\n当前价格草稿如下，供核对，请勿视为已全部确认：\n\n${lines}\n\n合计：${formatMoney(total, input.currency)}\n\n请回复确认上述缺失项后再作为正式报价。\n\n此致\n${signoff}`,
      };
    }
    return {
      subject: `${input.reference} 报价 — ${input.companyName}`,
      body: `${buyer} 您好，\n\n感谢贵司询盘 ${ref}。以下报价已由人工核对价格，请查阅。\n\n${lines}\n\n合计：${formatMoney(total, input.currency)}\n\n本报价需以双方确认的商务条款为准，有效期默认 14 天。\n\n此致\n${signoff}`,
    };
  }

  if (unresolved.length) {
    return {
      subject: `Quotation draft for RFQ ${input.reference} — open points remain`,
      body: `Dear ${buyer},\n\nThank you for RFQ ${ref}. This is a quotation draft, not a fully confirmed offer.\n\nUnresolved RFQ fields remain:\n${unresolved.map((item) => `- ${item}`).join("\n")}\n\nIndicative prices for review:\n\n${lines}\n\nTotal: ${formatMoney(total, input.currency)}\n\nPlease confirm the open points before this is treated as a firm quotation.\n\nBest regards,\n${signoff}`,
    };
  }

  return {
    subject: `Quotation for RFQ ${input.reference} — ${input.companyName}`,
    body: `Dear ${buyer},\n\nThank you for RFQ ${ref}. Please find our quotation below. Unit prices have been reviewed by our team.\n\n${lines}\n\nTotal: ${formatMoney(total, input.currency)}\n\nCommercial terms remain subject to confirmation. Prices are valid for 14 days unless otherwise agreed.\n\nBest regards,\n${signoff}`,
  };
}
