export const FOLLOW_UP_DAYS = 3;

export type QuoteOutcome = "open" | "won" | "lost";

export function followUpDueFrom(sentAt: string | Date, days = FOLLOW_UP_DAYS): string {
  const date = new Date(sentAt);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function daysSince(from: string | Date | null | undefined, now = new Date()): number | null {
  if (!from) return null;
  const start = new Date(from).getTime();
  if (!Number.isFinite(start)) return null;
  return Math.max(0, Math.floor((now.getTime() - start) / 86400000));
}

export function isFollowUpOverdue(input: {
  outcome?: string | null;
  follow_up_due?: string | null;
  sent_at?: string | null;
}, now = new Date()): boolean {
  if (input.outcome && input.outcome !== "open") return false;
  const due = input.follow_up_due || (input.sent_at ? followUpDueFrom(input.sent_at) : null);
  if (!due) return false;
  return new Date(due).getTime() <= now.getTime();
}

export function pipelineBucket(input: {
  outcome?: string | null;
  follow_up_due?: string | null;
  sent_at?: string | null;
}, now = new Date()): "overdue" | "awaiting" | "won" | "lost" {
  if (input.outcome === "won") return "won";
  if (input.outcome === "lost") return "lost";
  if (isFollowUpOverdue(input, now)) return "overdue";
  return "awaiting";
}

export function buildFollowUpEmail(input: {
  locale: "en" | "zh";
  buyerName: string;
  reference: string;
  companyName: string;
  contactName?: string | null;
}): { subject: string; body: string } {
  const buyer = input.buyerName.trim() || (input.locale === "zh" ? "客户" : "Customer");
  const signoff = input.contactName?.trim() || input.companyName;
  if (input.locale === "zh") {
    return {
      subject: `跟进 ${input.reference} 报价 — ${input.companyName}`,
      body: `${buyer} 您好，\n\n想确认贵司是否已收到询盘 ${input.reference} 的报价。如需调整规格、数量或交期，请直接回复本邮件，我们会人工核对后再更新报价。\n\n此致\n${signoff}`,
    };
  }
  return {
    subject: `Following up on quotation ${input.reference} — ${input.companyName}`,
    body: `Dear ${buyer},\n\nI am following up on quotation ${input.reference}. Please let us know if you received it, or if any specification, quantity or lead time should be revised. We will review any change before updating the quote.\n\nBest regards,\n${signoff}`,
  };
}
