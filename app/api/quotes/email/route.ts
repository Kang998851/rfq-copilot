import { NextResponse } from "next/server";
import { isValidEmail, mailtoHref } from "@/lib/quote/email";
import { allPricesFilled } from "@/lib/quote/totals";
import { createUserClient } from "@/lib/supabase/route";
import type { Quotation } from "@/types/database";

export const maxDuration = 20;

type Action = "send" | "prepare" | "mark_sent";

export async function POST(request: Request) {
  const supabase = createUserClient(request.headers.get("authorization"));
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const quotationId = typeof body.quotationId === "string" ? body.quotationId : "";
  const to = typeof body.to === "string" ? body.to.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const text = typeof body.body === "string" ? body.body : "";
  const action = (typeof body.action === "string" ? body.action : "send") as Action;

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

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
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
    return NextResponse.json({ ok: true, mode: "manual", mailto, message: "No email provider configured. Open your mail app or mark as sent after you send it." });
  }

  const from = process.env.RESEND_FROM
    || (company?.contact_email ? `${company.contact_name || company.name} <${company.contact_email}>` : "RFQ Copilot <beth.t@example.com>");

  const sent = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text }),
  });
  const payload = await sent.json().catch(() => ({}));
  if (!sent.ok) {
    await supabase.from("quotation_sends").insert({
      company_id: quote.company_id,
      quotation_id: quote.id,
      rfq_id: quote.rfq_id,
      to_email: to,
      subject,
      body: text,
      status: "failed",
      provider: "resend",
      error: typeof payload.message === "string" ? payload.message : "Email provider rejected the message",
      created_by: user.id,
    });
    return NextResponse.json({ error: payload.message ?? "Email send failed" }, { status: 502 });
  }

  return markSent(supabase, quote, user.id, to, subject, text, "resend");
}

async function markSent(
  supabase: ReturnType<typeof createUserClient>,
  quote: { id: string; company_id: string; rfq_id: string },
  userId: string,
  to: string,
  subject: string,
  text: string,
  provider: "resend" | "mailto",
) {
  const now = new Date().toISOString();
  const { error } = await supabase.from("quotation_sends").insert({
    company_id: quote.company_id,
    quotation_id: quote.id,
    rfq_id: quote.rfq_id,
    to_email: to,
    subject,
    body: text,
    status: "sent",
    provider,
    created_by: userId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await supabase.from("quotations").update({ status: "sent", sent_at: now, updated_at: now }).eq("id", quote.id);
  await supabase.from("rfqs").update({ status: "sent", updated_at: now }).eq("id", quote.rfq_id);
  return NextResponse.json({ ok: true, mode: provider, sent: true });
}
