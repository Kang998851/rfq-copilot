import { formatMoney, lineAmount, quoteTotal } from "./totals";

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
  companyName: string;
  contactName?: string | null;
  currency: string;
  items: QuoteEmailItem[];
};

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
  const lines = input.items.map((item) => {
    const qty = `${item.quantity ?? "?"} ${item.unit ?? ""}`.trim();
    const amount = formatMoney(lineAmount(item.quantity, item.unit_price), input.currency);
    const lead = item.lead_time_days != null ? (input.locale === "zh" ? `，交期 ${item.lead_time_days} 天` : `, lead time ${item.lead_time_days} days`) : "";
    return `- ${item.sku ?? "—"} ${item.name} × ${qty} @ ${formatMoney(item.unit_price, input.currency)} = ${amount}${lead}`;
  }).join("\n");

  if (input.locale === "zh") {
    return {
      subject: `${input.reference} 报价 — ${input.companyName}`,
      body: `${buyer} 您好，\n\n感谢贵司询盘 ${input.reference}。以下报价已由人工核对价格，请查阅。\n\n${lines}\n\n合计：${formatMoney(total, input.currency)}\n\n本报价需以双方确认的商务条款为准，有效期默认 14 天。\n\n此致\n${signoff}`,
    };
  }

  return {
    subject: `Quotation ${input.reference} — ${input.companyName}`,
    body: `Dear ${buyer},\n\nThank you for RFQ ${input.reference}. Please find our quotation below. Unit prices have been reviewed by our team.\n\n${lines}\n\nTotal: ${formatMoney(total, input.currency)}\n\nCommercial terms remain subject to confirmation. Prices are valid for 14 days unless otherwise agreed.\n\nBest regards,\n${signoff}`,
  };
}
