import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isValidEmail, mailtoHref, textToHtml } from "@/lib/quote/email";
import { sendSmtpMail } from "@/lib/quote/smtp-send";
import { extractEmailAddress, mailboxAsUserSender, parseMailboxPayload } from "@/lib/quote/smtp";
import { allPricesFilled } from "@/lib/quote/totals";
import type { Quotation } from "@/types/database";

export const maxDuration = 20;

export async function GET(request: Request) {
  const supabase = client(request.headers.get("authorization"));
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ configured: Boolean(process.env.RESEND_API_KEY), provider: process.env.RESEND_API_KEY ? "resend" : null });
}

type Action = "send" | "prepare" | "mark_sent" | "test";

function client(authorization: string | null) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { global: { headers: authorization ? { Authorization: authorization } : {} } },
  );
}

export async function POST(request: Request) {
  const supabase = client(request.headers.get("authorization"));
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const action = (typeof body.action === "string" ? body.action : "send") as Action;
  const smtpRaw = parseMailboxPayload(body.smtp);
  const displayName = typeof body.fromName === "string" ? body.fromName.trim() : "";

  if (action === "test") {
    if (!smtpRaw) return NextResponse.json({ error: "Connect a mailbox first" }, { status: 400 });
    const smtp = mailboxAsUserSender(smtpRaw, displayName || undefined);
    try {
      await sendSmtpMail(smtp, {
        to: extractEmailAddress(smtp.from) || smtp.username,
        subject: "RFQ Copilot mailbox test",
        text: "Your mailbox is connected. RFQ Copilot can send quotation emails from this address.",
        html: textToHtml("Your mailbox is connected. RFQ Copilot can send quotation emails from this address."),
      });
      return NextResponse.json({ ok: true, mode: "smtp", sent: true });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Mailbox test failed" }, { status: 502 });
    }
  }

  const quotationId = typeof body.quotationId === "string" ? body.quotationId : "";
  const to = typeof body.to === "string" ? body.to.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const text = typeof body.body === "string" ? body.body : "";

  if (!quotationId || !subject || !text) return NextResponse.json({ error: "Missing quotation fields" }, { status: 400 });
  if (!isValidEmail(to)) return NextResponse.json({ error: "Invalid recipient email" }, { status: 400 });
  if (!["send", "prepare", "mark_sent"].includes(action)) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const { data: quoteData, error: quoteError } = await supabase.from("quotations").select("*").eq("id", quotationId).single();
  const quote = quoteData as Quotation | null;
  if (quoteError || !quote) return NextResponse.json({ error: "Quotation not found" }, { status: 404 });

  const { data: items } = await supabase.from("quotation_items").select("quantity, unit_price").eq("quotation_id", quotationId);
  if (action !== "prepare" && (quote.status === "draft" || !allPricesFilled((items ?? []) as Array<{ quantity: number | null; unit_price: number | null }>))) {
    return NextResponse.json({ error: "Quote must be ready with every unit price filled" }, { status: 400 });
  }

  const { data: company } = await supabase.from("companies").select("name, contact_email, contact_name").eq("id", quote.company_id).single();
  const mailto = mailtoHref(to, subject, text);
  const companyRow = company as { name?: string; contact_email?: string | null; contact_name?: string | null } | null;

  if (action === "prepare") {
    const { error } = await supabase.from("quotation_sends").insert({
      company_id: quote.company_id,
      quotation_id: quote.id,
      rfq_id: quote.rfq_id,
      to_email: to,
      subject,
      body: text,
      status: "prepared",
      provider: "manual",
      created_by: user.id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, mode: "manual", mailto });
  }

  if (action === "mark_sent") {
    return markSent(supabase, quote, user.id, to, subject, text, "mailto");
  }

  const smtp = smtpRaw
    ? mailboxAsUserSender(smtpRaw, displayName || companyRow?.contact_name || companyRow?.name)
    : null;

  if (smtp) {
    try {
      await sendSmtpMail(smtp, {
        to,
        subject,
        text,
        html: textToHtml(text),
        replyTo: smtp.username,
      });
      return markSent(supabase, quote, user.id, to, subject, text, "smtp");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Mailbox rejected the message";
      const failed = {
        company_id: quote.company_id,
        quotation_id: quote.id,
        rfq_id: quote.rfq_id,
        to_email: to,
        subject,
        body: text,
        status: "failed",
        provider: "smtp",
        error: message,
        created_by: user.id,
      };
      const inserted = await supabase.from("quotation_sends").insert(failed);
      if (inserted.error) await supabase.from("quotation_sends").insert({ ...failed, provider: "manual" });
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  const { error } = await supabase.from("quotation_sends").insert({
    company_id: quote.company_id,
    quotation_id: quote.id,
    rfq_id: quote.rfq_id,
    to_email: to,
    subject,
    body: text,
    status: "prepared",
    provider: "manual",
    created_by: user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, mode: "manual", mailto, message: "Connect your mailbox in Settings to send from your address to the customer." });
}

async function markSent(
  supabase: ReturnType<typeof client>,
  quote: { id: string; company_id: string; rfq_id: string },
  userId: string,
  to: string,
  subject: string,
  text: string,
  provider: "resend" | "mailto" | "smtp",
) {
  const now = new Date().toISOString();
  const row = {
    company_id: quote.company_id,
    quotation_id: quote.id,
    rfq_id: quote.rfq_id,
    to_email: to,
    subject,
    body: text,
    status: "sent",
    provider,
    created_by: userId,
  };
  let { error } = await supabase.from("quotation_sends").insert(row);
  if (error && provider === "smtp") {
    ({ error } = await supabase.from("quotation_sends").insert({ ...row, provider: "manual" }));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await supabase.from("quotations").update({ status: "sent", sent_at: now, updated_at: now }).eq("id", quote.id);
  await supabase.from("rfqs").update({ status: "sent", updated_at: now }).eq("id", quote.rfq_id);
  return NextResponse.json({ ok: true, mode: provider, sent: true });
}
