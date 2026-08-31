"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { buildQuoteEmail, composeHref, isValidEmail } from "@/lib/quote/email";
import { buildFollowUpEmail, followUpDueFrom, isFollowUpOverdue } from "@/lib/quote/followup";
import { COMPANY_PUBLIC_COLUMNS, readStoredMailbox } from "@/lib/quote/smtp";
import { downloadAndStoreQuotePdf } from "@/lib/quote/save";
import { formatMoney, quoteTotal } from "@/lib/quote/totals";
import {
  belowMinimumMargin,
  encodeLineNotes,
  parseLineNotes,
  quoteCurrency,
  readStoredPricing,
  realizedMargin,
  suggestUnitPrice,
} from "@/lib/quote/pricing";
import type { Company, Product, Quotation, QuotationItem, QuotationSend, Rfq, RfqItem } from "@/types/database";
import type { CatalogProduct, ExtractedField, ExtractedHeader } from "@/lib/rfq/types";
import { filledSpecsFrom, liveMissing } from "@/lib/rfq/missing";
import { candidatesFromSpecs } from "@/lib/rfq/match";
import { activityFromHeader, appendActivity, askBuyerQuestion, fieldStatus, headerWithActivity, needsLineReview, reviewsFromSpecs, setFieldStatus, specsWithReviews, visibleMissing } from "@/lib/rfq/review";
import { useI18n } from "@/lib/i18n/provider";
import { translateRequirement, translateUnit } from "@/lib/i18n/requirement";

function headerField(header: ExtractedHeader | null | undefined, key: keyof ExtractedHeader): ExtractedField | null {
  const field = header?.[key];
  return field?.value ? field : null;
}

export default function RfqDetail() {
  const { t, locale } = useI18n();
  const { id } = useParams<{ id: string }>();
  const [rfq, setRfq] = useState<Rfq | null>(null);
  const [items, setItems] = useState<RfqItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [quote, setQuote] = useState<Quotation | null>(null);
  const [quoteItems, setQuoteItems] = useState<QuotationItem[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [sends, setSends] = useState<QuotationSend[]>([]);
  const [buyerEmail, setBuyerEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [followSubject, setFollowSubject] = useState("");
  const [followBody, setFollowBody] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState("");
  const [mailboxReady, setMailboxReady] = useState(false);
  const [mailboxEmail, setMailboxEmail] = useState("");
  const [replies, setReplies] = useState<Array<{ id: string; from: string; date: string; snippet: string }>>([]);
  const [fillDraft, setFillDraft] = useState<Record<string, string>>({});

  async function load() {
    const supabase = createClient();
    const [{ data: rfqData }, { data: itemData }, { data: productData }] = await Promise.all([
      supabase.from("rfqs").select("*").eq("id", id).single(),
      supabase.from("rfq_items").select("*").eq("rfq_id", id).order("line_no"),
      supabase.from("products").select("*").eq("active", true),
    ]);
    const nextRfq = rfqData as Rfq;
    setRfq(nextRfq);
    setItems((itemData ?? []) as RfqItem[]);
    setProducts((productData ?? []) as Product[]);
    setBuyerEmail(nextRfq?.buyer_email ?? "");
    if (nextRfq) {
      const { data: companyData } = await supabase.from("companies").select(COMPANY_PUBLIC_COLUMNS).eq("id", nextRfq.company_id).single();
      setCompany(companyData as Company | null);
    }
    const { data: quoteData } = await supabase.from("quotations").select("*").eq("rfq_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    setQuote((quoteData ?? null) as Quotation | null);
    if (quoteData) {
      const [{ data: qItems }, { data: sendData }] = await Promise.all([
        supabase.from("quotation_items").select("*").eq("quotation_id", quoteData.id),
        supabase.from("quotation_sends").select("*").eq("quotation_id", quoteData.id).order("created_at", { ascending: false }),
      ]);
      setQuoteItems((qItems ?? []) as QuotationItem[]);
      setSends((sendData ?? []) as QuotationSend[]);
    } else {
      setQuoteItems([]);
      setSends([]);
    }
    const { data: { session } } = await supabase.auth.getSession();
    setUserEmail(session?.user?.email ?? "");
    const mailbox = readStoredMailbox();
    setMailboxReady(Boolean(mailbox));
    setMailboxEmail(mailbox?.username || mailbox?.from || "");
    const status = await fetch("/api/mailbox/google/status");
    const payload = await status.json().catch(() => ({}));
    const connected = Boolean(payload.connected);
    setGmailConnected(connected);
    setGmailEmail(typeof payload.email === "string" ? payload.email : "");
    if ((mailbox || connected) && nextRfq && session) {
      const inbox = await fetch("/api/mailbox/replies", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          mailbox,
          reference: nextRfq.reference,
          from: nextRfq.buyer_email || buyerEmail || "",
        }),
      });
      const inboxPayload = await inbox.json().catch(() => ({}));
      setReplies(Array.isArray(inboxPayload.replies) ? inboxPayload.replies : []);
    } else {
      setReplies([]);
    }
  }

  useEffect(() => { load(); }, [id]);

  const draft = useMemo(() => {
    if (!rfq || !quote) return { subject: "", body: "" };
    return buildQuoteEmail({
      locale,
      buyerName: rfq.buyer_name,
      reference: rfq.reference,
      companyName: company?.name ?? "RFQ Copilot",
      contactName: company?.contact_name,
      currency: quote.currency,
      items: quoteItems,
    });
  }, [rfq, quote, quoteItems, company, locale]);

  useEffect(() => {
    setSubject(draft.subject);
    setBody(draft.body);
  }, [draft.subject, draft.body]);

  const followDraft = useMemo(() => {
    if (!rfq) return { subject: "", body: "" };
    return buildFollowUpEmail({
      locale,
      buyerName: rfq.buyer_name,
      reference: rfq.reference,
      companyName: company?.name ?? "RFQ Copilot",
      contactName: company?.contact_name,
    });
  }, [rfq, company, locale]);

  useEffect(() => {
    setFollowSubject(followDraft.subject);
    setFollowBody(followDraft.body);
  }, [followDraft.subject, followDraft.body]);

  const statusLabel = (status: string) => t.rfqPage.status[status as keyof typeof t.rfqPage.status] ?? status;
  const missingLabel = (item: string) => t.rfqDetail.missingItems[item as keyof typeof t.rfqDetail.missingItems] ?? item;
  const total = quote ? quoteTotal(quoteItems) : null;

  async function logActivity(action: string, detail: string) {
    if (!rfq) return;
    const next = appendActivity(activityFromHeader(rfq.extracted_header), action, detail);
    const extracted_header = headerWithActivity(rfq.extracted_header, next);
    await createClient().from("rfqs").update({ extracted_header, updated_at: new Date().toISOString() }).eq("id", rfq.id);
    setRfq({ ...rfq, extracted_header });
  }

  async function setFieldReview(item: RfqItem, field: string, status: "approved" | "edited" | "missing" | "ignored") {
    const reviews = setFieldStatus(reviewsFromSpecs(item.specs), field, status);
    const specs = specsWithReviews(item.specs, reviews);
    await createClient().from("rfq_items").update({ specs }).eq("id", item.id);
    setItems((rows) => rows.map((row) => row.id === item.id ? { ...row, specs } : row));
    await logActivity(status, `${t.rfqDetail.line} ${item.line_no} · ${field}`);
  }

  async function fillMissing(item: RfqItem, label: string, value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    const filled = { ...filledSpecsFrom(item.specs), [label]: trimmed };
    const reviews = setFieldStatus(reviewsFromSpecs(item.specs), label, "approved");
    const specs: Record<string, unknown> = { ...specsWithReviews(item.specs, reviews), filled_specs: filled };
    if (label === "Size") specs.size = trimmed;
    if (label === "Material") specs.material = trimmed;
    const missing = item.missing.filter((entry) => entry !== label);
    await createClient().from("rfq_items").update({ specs, missing }).eq("id", item.id);
    setItems((rows) => rows.map((row) => row.id === item.id ? { ...row, specs, missing } : row));
    setFillDraft((draft) => {
      const next = { ...draft };
      delete next[`${item.id}:${label}`];
      return next;
    });
    setMessage(t.rfqDetail.fillSaved);
    await logActivity("filled", `${t.rfqDetail.line} ${item.line_no} · ${label}`);
  }

  async function saveLine(item: RfqItem, requirement: string, quantity: string, unit: string) {
    const qty = quantity.trim() === "" ? null : Number(quantity);
    const reviews = setFieldStatus(reviewsFromSpecs(item.specs), "requirement", "edited");
    const specs = specsWithReviews(item.specs, setFieldStatus(reviews, "quantity", "edited"));
    const patch = { requirement: requirement.trim() || item.requirement, quantity: Number.isFinite(qty as number) ? qty : item.quantity, unit: unit.trim() || null, specs };
    await createClient().from("rfq_items").update(patch).eq("id", item.id);
    setItems((rows) => rows.map((row) => row.id === item.id ? { ...row, ...patch } : row));
    await logActivity("edited", `${t.rfqDetail.line} ${item.line_no}`);
  }

  async function setReview(item: RfqItem, review_status: string) {
    await createClient().from("rfq_items").update({ review_status }).eq("id", item.id);
    setItems((rows) => rows.map((row) => row.id === item.id ? { ...row, review_status } : row));
    await logActivity(review_status, `${t.rfqDetail.line} ${item.line_no}`);
  }

  async function setMatch(item: RfqItem, productId: string) {
    const product = products.find((p) => p.id === productId);
    await createClient().from("rfq_items").update({
      matched_product_id: product?.id ?? null,
      matched_sku: product?.sku ?? null,
      confidence: product ? 90 : 0,
      review_status: "pending",
    }).eq("id", item.id);
    await logActivity("match", `${t.rfqDetail.line} ${item.line_no} · ${product?.sku ?? "none"}`);
    await load();
  }

  async function saveBuyerEmail() {
    if (!rfq) return;
    const value = buyerEmail.trim();
    await createClient().from("rfqs").update({ buyer_email: value || null, updated_at: new Date().toISOString() }).eq("id", rfq.id);
    setRfq({ ...rfq, buyer_email: value || null });
  }

  async function prepareQuote() {
    if (!rfq) return;
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const usable = items.filter((item) => item.review_status !== "rejected" && item.matched_product_id);
    if (!usable.length) {
      setMessage(t.rfqDetail.needMatches);
      setBusy(false);
      return;
    }
    const customerCurrency = headerField((rfq.extracted_header ?? {}) as ExtractedHeader, "currency")?.value ?? null;
    const money = quoteCurrency(customerCurrency, company?.default_currency);
    const rules = readStoredPricing(rfq.company_id);
    let current = quote;
    if (!current) {
      const { data, error } = await supabase.from("quotations").insert({
        company_id: rfq.company_id,
        rfq_id: rfq.id,
        status: "draft",
        currency: money.currency,
        notes: t.rfqDetail.humanNote,
      }).select().single();
      if (error || !data) {
        setMessage(error?.message ?? t.rfqDetail.saveFail);
        setBusy(false);
        return;
      }
      current = data as Quotation;
    } else if (current.status === "sent") {
      const nowIso = new Date().toISOString();
      await supabase.from("quotations").update({
        status: "draft",
        sent_at: null,
        outcome: "open",
        follow_up_due: null,
        last_followed_up_at: null,
        updated_at: nowIso,
      }).eq("id", current.id);
      current = { ...current, status: "draft", sent_at: null, outcome: "open", follow_up_due: null, last_followed_up_at: null };
    }
    if (current && current.currency !== money.currency) {
      await supabase.from("quotations").update({ currency: money.currency, updated_at: new Date().toISOString() }).eq("id", current.id);
      current = { ...current, currency: money.currency };
    }
    await supabase.from("quotation_items").delete().eq("quotation_id", current.id);
    const rows = usable.map((item) => {
      const product = products.find((p) => p.id === item.matched_product_id);
      const priced = suggestUnitPrice({
        cost: product?.cost ?? null,
        cost_currency: product?.currency ?? null,
        quote_currency: money.currency,
        rules,
        product: { category: product?.category, specifications: product?.specifications },
      });
      const pricing = { ...priced.pricing, moq: product?.moq ?? null };
      return {
        company_id: rfq.company_id,
        quotation_id: current!.id,
        rfq_item_id: item.id,
        sku: product?.sku ?? item.matched_sku,
        name: product?.name ?? item.requirement,
        quantity: item.quantity,
        unit: item.unit ?? product?.unit,
        unit_price: priced.unit_price,
        lead_time_days: product?.lead_time_days ?? null,
        notes: encodeLineNotes(pricing, priced.unit_price == null ? t.rfqDetail.noPrice : ""),
      };
    });
    const { error: itemError } = await supabase.from("quotation_items").insert(rows);
    if (itemError) setMessage(itemError.message);
    else {
      await supabase.from("rfqs").update({ status: "quoted", updated_at: new Date().toISOString() }).eq("id", rfq.id);
      setMessage(t.rfqDetail.saved);
      await load();
    }
    setBusy(false);
  }

  async function savePrice(item: QuotationItem, unit_price: number | null) {
    const parsed = parseLineNotes(item.notes);
    const pricing = {
      ...(parsed.pricing ?? { cost: null, cost_currency: null, moq: null, method: "manual" as const, rule: "manual" as const, suggested: null, fx_blocked: false }),
      method: "manual" as const,
      rule: "manual" as const,
    };
    const notes = encodeLineNotes(pricing, unit_price == null ? t.rfqDetail.noPrice : parsed.human);
    await createClient().from("quotation_items").update({ unit_price, notes }).eq("id", item.id);
    setQuoteItems((rows) => rows.map((row) => row.id === item.id ? { ...row, unit_price, notes } : row));
  }

  async function markReady() {
    if (!quote) return;
    if (quoteItems.some((item) => item.unit_price == null)) {
      setMessage(t.rfqDetail.needPrices);
      return;
    }
    const rules = readStoredPricing(rfq?.company_id ?? "");
    const low = quoteItems.some((item) => belowMinimumMargin(parseLineNotes(item.notes).pricing?.cost ?? null, item.unit_price, rules.minimum_margin));
    if (low) {
      setMessage(t.rfqDetail.needsApproval);
      return;
    }
    await createClient().from("quotations").update({ status: "ready", updated_at: new Date().toISOString() }).eq("id", quote.id);
    setQuote({ ...quote, status: "ready" });
    setMessage(t.rfqDetail.ready);
  }

  async function downloadPdf() {
    if (!rfq || !quote) return;
    setBusy(true);
    setMessage("");
    try {
      await downloadAndStoreQuotePdf({ rfq, quote, items: quoteItems, company, copy: t.quoteDoc });
      setMessage(t.rfqDetail.pdfSaved);
    } catch {
      setMessage(t.rfqDetail.pdfFail);
    }
    setBusy(false);
  }

  async function copyEmail() {
    await navigator.clipboard.writeText(body || draft.body);
    setMessage(t.rfqDetail.copied);
  }

  async function copyFollowUp() {
    await navigator.clipboard.writeText(followBody || followDraft.body);
    setMessage(t.rfqDetail.followUpCopied);
  }

  async function setOutcome(outcome: "open" | "won" | "lost") {
    if (!quote || !rfq) return;
    const now = new Date();
    const nowIso = now.toISOString();
    await createClient().from("quotations").update({
      outcome,
      follow_up_due: outcome === "open" ? followUpDueFrom(now) : quote.follow_up_due,
      updated_at: nowIso,
    }).eq("id", quote.id);
    await createClient().from("rfqs").update({
      status: outcome === "open" ? "sent" : outcome,
      updated_at: nowIso,
    }).eq("id", rfq.id);
    setQuote({ ...quote, outcome, follow_up_due: outcome === "open" ? followUpDueFrom(now) : quote.follow_up_due });
    setRfq({ ...rfq, status: outcome === "open" ? "sent" : outcome });
    setMessage(outcome === "won" ? t.rfqDetail.outcomeWon : outcome === "lost" ? t.rfqDetail.outcomeLost : t.rfqDetail.outcomeOpen);
  }

  async function emailAction(action: "send" | "prepare" | "mark_sent" | "follow_up" | "mark_followed_up", draftOverride?: { subject: string; body: string }) {
    if (!quote) return;
    if (action !== "prepare" && quote.status === "draft") {
      setMessage(t.rfqDetail.needReady);
      return;
    }
    if (!isValidEmail(buyerEmail)) {
      setMessage(t.rfqDetail.needEmail);
      return;
    }
    setBusy(true);
    setMessage("");
    await saveBuyerEmail();
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setMessage(t.rfqPage.session);
      setBusy(false);
      return;
    }
    const res = await fetch("/api/quotes/email", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        quotationId: quote.id,
        to: buyerEmail,
        subject: draftOverride?.subject ?? subject,
        body: draftOverride?.body ?? body,
        action,
        fromName: company?.contact_name,
        smtp: readStoredMailbox(),
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(payload.error ?? t.rfqDetail.sendFail);
      setBusy(false);
      return;
    }
    if (payload.mode === "manual" && action === "send") {
      setMessage(t.rfqDetail.mailtoManual);
    } else if (payload.followUp || action === "follow_up" || action === "mark_followed_up") {
      setMessage(t.rfqDetail.followUpSent);
    } else if (payload.sent) {
      setMessage(t.rfqDetail.sent);
    } else {
      setMessage(t.rfqDetail.prepared);
    }
    await load();
    setBusy(false);
  }

  function openCompose(event: MouseEvent<HTMLAnchorElement>) {
    if (!isValidEmail(senderEmail)) {
      event.preventDefault();
      setMessage(t.rfqDetail.mailtoManual);
      return;
    }
    if (!isValidEmail(buyerEmail)) {
      event.preventDefault();
      setMessage(t.rfqDetail.needEmail);
      return;
    }
    if (quote?.status === "draft") {
      event.preventDefault();
      setMessage(t.rfqDetail.needReady);
      return;
    }
    setMessage(t.rfqDetail.webmailOpened);
    void emailAction("prepare");
  }

  if (!rfq) return <div className="text-sm text-slate-500">{t.rfqDetail.loading}</div>;

  const rfqStatusTone = rfq.status === "needs_review"
    ? "bg-amber-500 text-white"
    : rfq.status === "won"
      ? "bg-emerald-700 text-white"
      : rfq.status === "lost"
        ? "bg-slate-500 text-white"
        : rfq.status === "sent"
          ? "bg-green-600 text-white"
          : rfq.status === "quoted" || rfq.status === "matched"
            ? "bg-blue-600 text-white"
            : "bg-slate-700 text-white";
  const quoteStatus = quote?.status === "sent" ? t.rfqDetail.sentLabel : quote?.status === "ready" ? t.rfqDetail.ready : t.rfqDetail.draft;
  const money = quoteCurrency(headerField((rfq.extracted_header ?? {}) as ExtractedHeader, "currency")?.value, company?.default_currency);
  const senderEmail = gmailEmail || mailboxEmail || company?.contact_email || userEmail;
  const mailboxConnected = mailboxReady || gmailConnected;
  const canSend = mailboxConnected || isValidEmail(senderEmail);
  const composeUrl = !mailboxConnected && canSend && isValidEmail(buyerEmail) ? composeHref(senderEmail, buyerEmail, subject, body) : undefined;

  return (
    <div className="max-w-5xl">
      <Link href="/rfqs" className="text-sm text-blue-600">← {t.rfqPage.title}</Link>
      <div className="mb-7 mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="label">{rfq.reference} · {rfq.source_filename || rfq.source_type}</p>
          <h1 className="mt-2 text-3xl font-bold">{rfq.buyer_name}</h1>
          <p className="mt-2 text-sm text-slate-500">{new Date(rfq.created_at).toLocaleString()}</p>
        </div>
        <span className={`rounded-full px-4 py-1.5 text-sm font-bold ${rfqStatusTone}`}>{statusLabel(rfq.status)}</span>
      </div>
      {rfq.possible_duplicate_of && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {t.rfqPage.duplicateHint}{" "}
          <Link href={`/rfqs/${rfq.possible_duplicate_of}`} className="font-semibold text-blue-700">{rfq.possible_duplicate_of.slice(0, 8)}</Link>
        </div>
      )}
      {rfq.extraction_status === "failed" && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{t.rfqDetail.extractFailed}</div>
      )}

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-bold">{t.rfqDetail.buyerSummary}</h2>
        <p className="mt-2 text-sm font-medium">{rfq.buyer_name}</p>
        <label className="label mt-4">{t.rfqDetail.buyerEmail}</label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input className="field" type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} onBlur={saveBuyerEmail} placeholder={t.rfqDetail.buyerEmailPlaceholder} />
          <button className="btn-secondary shrink-0" onClick={saveBuyerEmail}>{t.rfqDetail.saveEmail}</button>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-bold">{t.rfqDetail.document}</h2>
        {rfq.source_filename ? (
          <p className="mt-2 text-sm">{rfq.source_filename} · {rfq.source_type}{rfq.source_checksum ? ` · ${rfq.source_checksum.slice(0, 10)}` : ""}</p>
        ) : (
          <p className="mt-2 text-sm text-slate-500">{t.rfqDetail.noDocument}</p>
        )}
      </div>

      {(() => {
        const header = (rfq.extracted_header ?? {}) as ExtractedHeader;
        const rows: [keyof ExtractedHeader, string][] = [
          ["phone", t.rfqDetail.phone],
          ["rfq_number", t.rfqDetail.rfqNumber],
          ["request_date", t.rfqDetail.requestDate],
          ["currency", t.rfqDetail.currency],
          ["incoterm", t.rfqDetail.incoterm],
          ["delivery_location", t.rfqDetail.delivery],
          ["deadline", t.rfqDetail.deadline],
          ["payment_terms", t.rfqDetail.payment],
          ["certification", t.rfqDetail.certification],
          ["notes", t.rfqDetail.notes],
        ];
        const visible = rows.flatMap(([key, label]) => {
          const field = headerField(header, key);
          return field ? [[label, field] as const] : [];
        });
        if (!visible.length && rfq.extraction_status !== "ai") return null;
        return (
          <div className="mb-6 rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold">{t.rfqDetail.headerTitle}</h2>
              <span className="text-xs font-semibold uppercase text-slate-500">
                {rfq.extraction_status === "ai" ? t.rfqDetail.extractAi : t.rfqDetail.extractHeuristic}
              </span>
            </div>
            {visible.length ? (
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                {visible.map(([label, field]) => (
                  <div key={label}>
                    <dt className="label">{label}</dt>
                    <dd className="mt-1 text-sm font-medium">{field.value}</dd>
                    {field.source && <p className="mt-1 text-xs text-slate-500">{t.rfqDetail.source}: {field.source}</p>}
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-3 text-sm text-slate-500">{t.rfqDetail.noneMissing}</p>
            )}
          </div>
        );
      })()}

      <h2 className="mb-4 text-lg font-bold">{t.rfqDetail.lineItems}</h2>
      <div className="space-y-6">
        {items.map((item) => {
          const product = products.find((p) => p.id === item.matched_product_id);
          const review = item.review_status;
          const requirement = translateRequirement(item.requirement, locale);
          const reviews = reviewsFromSpecs(item.specs);
          const storedMissing = review === "accepted"
            ? item.missing.filter((m) => m !== "Match confirmation")
            : item.missing;
          const visibleMissingItems = visibleMissing(liveMissing({
            requirement: item.requirement,
            quantity: item.quantity,
            unit: item.unit,
            specs: item.specs,
            requested_sku: item.requested_sku,
            missing: storedMissing,
          }, (product as CatalogProduct | undefined) ?? null), reviews);
          const lowExtract = needsLineReview(item.extract_confidence, review);
          const lineTone = review === "accepted"
            ? "border-green-500 bg-white ring-2 ring-green-100"
            : review === "rejected"
              ? "border-red-400 bg-white ring-2 ring-red-100"
              : "border-amber-400 bg-amber-50/70 ring-2 ring-amber-200";
          const matchTone = review === "accepted"
            ? "border-green-400 bg-green-50"
            : review === "rejected"
              ? "border-red-300 bg-red-50"
              : "border-amber-300 bg-amber-50";
          const badgeTone = review === "accepted"
            ? "bg-green-600 text-white"
            : review === "rejected"
              ? "bg-red-600 text-white"
              : "bg-amber-500 text-white";
          return (
            <div key={item.id} className={`grid gap-6 border p-6 lg:grid-cols-[1.1fr_0.9fr] ${lineTone}`}>
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="label">{t.rfqDetail.line} {item.line_no}</p>
                  <span className={`rounded-full px-3 py-1 text-sm font-bold ${badgeTone}`}>
                    {t.rfqDetail.review[review as keyof typeof t.rfqDetail.review] ?? review}
                  </span>
                </div>
                <h2 className="mt-3 text-lg font-bold">{t.rfqDetail.customerReq}</h2>
                <div className={`mt-4 rounded-md bg-white/80 p-4 text-sm font-medium leading-7 ${lowExtract ? "ring-2 ring-amber-300" : ""}`}>
                  <textarea className="field min-h-20" defaultValue={item.requirement} id={`${item.id}-req`} />
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input className="field" defaultValue={item.quantity ?? ""} id={`${item.id}-qty`} placeholder={t.rfqDetail.quantity} />
                    <input className="field" defaultValue={item.unit ?? ""} id={`${item.id}-unit`} placeholder={t.rfqDetail.unit} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="btn-secondary" onClick={() => {
                      const requirementValue = (document.getElementById(`${item.id}-req`) as HTMLTextAreaElement | null)?.value ?? item.requirement;
                      const quantityValue = (document.getElementById(`${item.id}-qty`) as HTMLInputElement | null)?.value ?? "";
                      const unitValue = (document.getElementById(`${item.id}-unit`) as HTMLInputElement | null)?.value ?? "";
                      void saveLine(item, requirementValue, quantityValue, unitValue);
                    }}>{t.rfqDetail.saveEdit}</button>
                    <button className="btn-secondary" onClick={() => setFieldReview(item, "requirement", "approved")}>{t.rfqDetail.approveField}</button>
                    <button className="btn-secondary" onClick={() => setFieldReview(item, "requirement", "missing")}>{t.rfqDetail.markMissing}</button>
                    <button className="btn-secondary" onClick={() => setFieldReview(item, "requirement", "ignored")}>{t.rfqDetail.ignoreField}</button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{
                    ({ pending: t.rfqDetail.fieldPending, approved: t.rfqDetail.fieldApproved, edited: t.rfqDetail.fieldEdited, missing: t.rfqDetail.fieldMissing, ignored: t.rfqDetail.fieldIgnored })[fieldStatus(reviews, "requirement")]
                  }</p>
                  {requirement.changed && (
                    <p className="mt-3 text-xs font-normal leading-6 text-slate-500">{t.rfqDetail.original}: {requirement.original}</p>
                  )}
                  {item.source_ref && (
                    <p className="mt-3 text-xs font-normal leading-6 text-slate-500">{t.rfqDetail.source}: {item.source_ref}{item.source_text && item.source_text !== requirement.text ? ` · ${item.source_text}` : ""}</p>
                  )}
                  {item.target_price != null && (
                    <p className="mt-3 text-xs font-normal leading-6 text-slate-500">{t.rfqDetail.askedPrice}: {item.target_price}</p>
                  )}
                  {item.extract_confidence != null && item.extract_confidence < 0.7 && (
                    <p className="mt-3 text-xs font-semibold text-amber-800">{t.rfqDetail.lowExtract} ({Math.round(item.extract_confidence * 100)}%)</p>
                  )}
                </div>
                <h2 className="mt-7 text-lg font-bold">{t.rfqDetail.matchedProduct}</h2>
                <div className={`mt-4 rounded-md border p-4 ${matchTone}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold">{product ? `${product.sku} · ${product.name}` : t.rfqDetail.noMatch}</p>
                      <p className="mt-1 text-xs">{t.rfqDetail.confidenceScore} {item.confidence}%</p>
                      {product && (
                        <p className="mt-1 text-xs text-slate-600">
                          {[product.model, product.material, product.size, product.cost != null ? `${product.cost} ${product.currency}` : null, product.moq != null ? `${t.rfqDetail.moq} ${product.moq}` : null, product.lead_time_days != null ? `${t.rfqDetail.lead} ${product.lead_time_days}` : null].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    {review === "accepted" && product && <CheckCircle2 className="text-green-700" size={20} />}
                  </div>
                  {review !== "accepted" && <p className="mt-2 text-xs font-semibold text-amber-800">{t.rfqDetail.confirmNeeded}</p>}
                  {candidatesFromSpecs(item.specs).length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="label">{t.rfqDetail.topMatches}</p>
                      {candidatesFromSpecs(item.specs).map((candidate) => (
                        <button
                          key={candidate.product_id}
                          className={`w-full rounded-md border p-3 text-left text-sm ${item.matched_product_id === candidate.product_id ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"}`}
                          onClick={() => setMatch(item, candidate.product_id)}
                        >
                          <p className="font-semibold">{candidate.sku} · {candidate.name} · {candidate.confidence}%</p>
                          <p className="mt-1 text-xs text-slate-600">{[candidate.model, candidate.material, candidate.size, candidate.cost != null ? `${candidate.cost} ${candidate.currency}` : null].filter(Boolean).join(" · ")}</p>
                          <p className="mt-1 text-xs text-slate-500">{candidate.reasons.map((reason) => t.rfqDetail.matchReasons[reason as keyof typeof t.rfqDetail.matchReasons] ?? reason).join(" · ")}</p>
                        </button>
                      ))}
                    </div>
                  )}
                  <select className="field mt-3" value={item.matched_product_id ?? ""} onChange={(e) => setMatch(item, e.target.value)}>
                    <option value="">{t.rfqDetail.changeMatch}</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}
                  </select>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className={review === "accepted" ? "btn-secondary" : "btn-primary"} onClick={() => setReview(item, "accepted")} disabled={!item.matched_product_id}>{t.rfqDetail.accept}</button>
                    <button className="btn-secondary" onClick={() => setReview(item, "rejected")}>{t.rfqDetail.reject}</button>
                    <button className="btn-secondary" onClick={() => setMatch(item, "")}>{t.rfqDetail.clearMatch}</button>
                    <Link href="/products/new" className="btn-secondary">{t.rfqDetail.createProduct}</Link>
                  </div>
                </div>
              </div>
              <div>
                <p className="label">{t.rfqDetail.reviewQueue}</p>
                <h2 className="mt-3 text-lg font-bold">{t.rfqDetail.missing}</h2>
                <div className="mt-4 space-y-3">
                  {visibleMissingItems.length === 0 ? <p className="text-sm text-slate-500">{t.rfqDetail.noneMissing}</p> : visibleMissingItems.map((m) => (
                    <div key={m} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <div className="flex items-center gap-3"><AlertCircle size={17} />{missingLabel(m)}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <input
                          className="field min-w-40 flex-1"
                          value={fillDraft[`${item.id}:${m}`] ?? filledSpecsFrom(item.specs)[m] ?? ""}
                          onChange={(e) => setFillDraft((draft) => ({ ...draft, [`${item.id}:${m}`]: e.target.value }))}
                          placeholder={t.rfqDetail.fillPlaceholder}
                        />
                        <button className="btn-secondary" onClick={() => {
                          void fillMissing(item, m, fillDraft[`${item.id}:${m}`] ?? filledSpecsFrom(item.specs)[m] ?? "");
                        }}>{t.rfqDetail.fillManually}</button>
                        <button className="btn-secondary" onClick={async () => {
                          await navigator.clipboard.writeText(askBuyerQuestion(item.line_no, missingLabel(m)));
                          setMessage(t.rfqDetail.askedCopied);
                          await logActivity("ask_buyer", `${t.rfqDetail.line} ${item.line_no} · ${m}`);
                        }}>{t.rfqDetail.askBuyer}</button>
                        <button className="btn-secondary" onClick={() => setFieldReview(item, m, "ignored")}>{t.rfqDetail.ignoreField}</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-bold">{t.rfqDetail.activity}</h2>
        <div className="mt-4 space-y-2">
          {activityFromHeader(rfq.extracted_header).length === 0 ? (
            <p className="text-sm text-slate-500">{t.rfqDetail.noActivity}</p>
          ) : activityFromHeader(rfq.extracted_header).map((entry) => (
            <p key={`${entry.at}-${entry.action}-${entry.detail}`} className="text-sm text-slate-600">
              {new Date(entry.at).toLocaleString()} · {entry.action} · {entry.detail}
            </p>
          ))}
        </div>
      </div>

      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6 print:border-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{t.rfqDetail.quoteTitle}</h2>
            <p className="mt-1 text-sm text-slate-500">{t.rfqDetail.quoteLead}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={prepareQuote} disabled={busy}>{busy ? t.rfqDetail.preparing : t.rfqDetail.prepareQuote}</button>
            {quote && <button className="btn-secondary" onClick={markReady}>{t.rfqDetail.markReady}</button>}
            {quote && <button className="btn-secondary" onClick={downloadPdf} disabled={busy}>{t.rfqDetail.downloadPdf}</button>}
            {quote && <Link href={`/rfqs/${rfq.id}/quote`} className="btn-secondary">{t.rfqDetail.openPdf}</Link>}
          </div>
        </div>
        {message && <p className="mt-3 text-sm text-slate-600">{message}</p>}
        {quote && (
          <div className="mt-5 overflow-x-auto">
            <p className="mb-3 text-xs font-semibold uppercase text-slate-500">
              {quoteStatus} · {quote.currency} · {money.source === "customer" ? t.rfqDetail.customerCurrency : t.rfqDetail.suggestedCurrency} · {t.rfqDetail.total} {formatMoney(total, quote.currency)}
            </p>
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-2">SKU</th>
                  <th className="px-2 py-2">{t.rfqDetail.name}</th>
                  <th className="px-2 py-2">{t.rfqDetail.quantity}</th>
                  <th className="px-2 py-2">{t.rfqDetail.moq}</th>
                  <th className="px-2 py-2">{t.rfqDetail.cost}</th>
                  <th className="px-2 py-2">{t.rfqDetail.unitPrice}</th>
                  <th className="px-2 py-2">{t.rfqDetail.margin}</th>
                  <th className="px-2 py-2">{t.rfqDetail.lead}</th>
                </tr>
              </thead>
              <tbody>{quoteItems.map((item) => {
                const rfqItem = items.find((row) => row.id === item.rfq_item_id);
                const pricing = parseLineNotes(item.notes).pricing;
                const margin = realizedMargin(pricing?.cost ?? null, item.unit_price);
                const moqWarn = pricing?.moq != null && item.quantity != null && item.quantity < pricing.moq;
                return (
                  <tr key={item.id} className="border-b align-top">
                    <td className="px-2 py-2 font-mono text-xs">{item.sku}</td>
                    <td className="px-2 py-2">
                      {item.name}
                      {rfqItem?.target_price != null && (
                        <p className="mt-1 text-xs text-slate-500">{t.rfqDetail.targetPriceRef} {formatMoney(rfqItem.target_price, quote.currency)}</p>
                      )}
                      {pricing?.fx_blocked && <p className="mt-1 text-xs text-amber-800">{t.rfqDetail.fxBlocked}</p>}
                    </td>
                    <td className="px-2 py-2">{item.quantity} {item.unit}</td>
                    <td className={`px-2 py-2 ${moqWarn ? "font-semibold text-amber-800" : ""}`}>{pricing?.moq ?? "—"}</td>
                    <td className="px-2 py-2">{pricing?.cost != null ? formatMoney(pricing.cost, pricing.cost_currency || quote.currency) : "—"}</td>
                    <td className="px-2 py-2">
                      <input className="field w-28" type="number" value={item.unit_price ?? ""} onChange={(e) => savePrice(item, e.target.value === "" ? null : Number(e.target.value))} />
                    </td>
                    <td className="px-2 py-2">{margin == null ? "—" : `${Math.round(margin * 1000) / 10}%`}</td>
                    <td className="px-2 py-2">{item.lead_time_days ?? "—"}</td>
                  </tr>
                );
              })}</tbody>
            </table>
            <p className="mt-4 text-xs text-slate-500">{t.rfqDetail.humanNote}</p>
          </div>
        )}
      </div>

      {quote && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold">{t.rfqDetail.emailTitle}</h2>
          <p className="mt-1 text-sm text-slate-500">{t.rfqDetail.emailLead}</p>
          <div className="mt-5 space-y-4">
            <div>
              <label className="label">{t.rfqDetail.emailFrom}</label>
              <input className="field bg-slate-50" value={senderEmail} readOnly />
              <p className="mt-2 text-xs text-slate-500">{t.rfqDetail.emailFromHint}</p>
            </div>
            <div>
              <label className="label">{t.rfqDetail.emailTo}</label>
              <input className="field" type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} placeholder={t.rfqDetail.buyerEmailPlaceholder} />
            </div>
            <div>
              <label className="label">{t.rfqDetail.emailSubject}</label>
              <input className="field" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <label className="label">{t.rfqDetail.emailBody}</label>
              <textarea className="field" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              {mailboxConnected ? (
                <button className="btn-primary" onClick={() => emailAction("send")} disabled={busy}>{busy ? t.rfqDetail.sending : t.rfqDetail.sendEmail}</button>
              ) : (
                <a className={`btn-primary ${busy ? "pointer-events-none opacity-50" : ""}`} href={composeUrl} target="_blank" rel="noreferrer" onClick={openCompose}>{t.rfqDetail.sendEmail}</a>
              )}
              <button className="btn-secondary" onClick={copyEmail}>{t.rfqDetail.copyEmail}</button>
              <button className="btn-secondary" onClick={() => emailAction("mark_sent")} disabled={busy}>{t.rfqDetail.markSent}</button>
            </div>
            <p className="text-xs text-slate-500">
              {mailboxConnected ? t.rfqDetail.gmailSendReady : canSend ? t.rfqDetail.sendReady : t.rfqDetail.emailHint}{" "}
              {!mailboxConnected && <Link href="/settings" className="text-blue-600">{t.rfqDetail.connectMailbox}</Link>}
            </p>
            {mailboxConnected && (
              <div className="border-t border-slate-100 pt-4">
                <p className="label">{t.rfqDetail.repliesTitle}</p>
                {replies.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">{t.rfqDetail.noReplies}</p>
                ) : (
                  <ul className="mt-3 space-y-3 text-sm text-slate-600">
                    {replies.map((reply) => (
                      <li key={reply.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                        <p className="font-medium">{reply.from}</p>
                        <p className="mt-1 text-xs text-slate-400">{reply.date}</p>
                        <p className="mt-2">{reply.snippet}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {sends.length > 0 && (
              <div className="border-t border-slate-100 pt-4">
                <p className="label">{t.rfqDetail.sendHistory}</p>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  {sends.slice(0, 5).map((send) => (
                    <li key={send.id}>{new Date(send.created_at).toLocaleString()} · {send.to_email} · {send.status} · {send.provider}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {quote?.status === "sent" && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{t.rfqDetail.outcomeTitle}</h2>
              <p className="mt-1 text-sm text-slate-500">{t.rfqDetail.outcomeLead}</p>
            </div>
            {isFollowUpOverdue(quote) && quote.outcome === "open" && (
              <span className="rounded-full bg-amber-500 px-3 py-1 text-sm font-bold text-white">{t.rfqDetail.overdueBadge}</span>
            )}
          </div>
          <p className="mt-4 text-sm text-slate-600">
            {quote.follow_up_due ? `${t.rfqDetail.dueOn} ${new Date(quote.follow_up_due).toLocaleString()}` : t.followUps.noDue}
            {quote.last_followed_up_at ? ` · ${t.rfqDetail.lastFollowed} ${new Date(quote.last_followed_up_at).toLocaleString()}` : ""}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {quote.outcome !== "won" && <button className="btn-primary" onClick={() => setOutcome("won")}>{t.rfqDetail.markWon}</button>}
            {quote.outcome !== "lost" && <button className="btn-secondary" onClick={() => setOutcome("lost")}>{t.rfqDetail.markLost}</button>}
            {quote.outcome !== "open" && <button className="btn-secondary" onClick={() => setOutcome("open")}>{t.rfqDetail.reopen}</button>}
          </div>
        </div>
      )}

      {quote?.status === "sent" && quote.outcome === "open" && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold">{t.rfqDetail.followUpTitle}</h2>
          <p className="mt-1 text-sm text-slate-500">{t.rfqDetail.followUpLead}</p>
          <div className="mt-5 space-y-4">
            <div>
              <label className="label">{t.rfqDetail.emailSubject}</label>
              <input className="field" value={followSubject} onChange={(e) => setFollowSubject(e.target.value)} />
            </div>
            <div>
              <label className="label">{t.rfqDetail.emailBody}</label>
              <textarea className="field" rows={8} value={followBody} onChange={(e) => setFollowBody(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              {mailboxConnected ? (
                <button className="btn-primary" onClick={() => emailAction("follow_up", { subject: followSubject, body: followBody })} disabled={busy}>
                  {busy ? t.rfqDetail.sending : t.rfqDetail.sendFollowUp}
                </button>
              ) : (
                <a
                  className={`btn-primary ${busy ? "pointer-events-none opacity-50" : ""}`}
                  href={isValidEmail(buyerEmail) ? composeHref(senderEmail, buyerEmail, followSubject, followBody) : undefined}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => {
                    if (!isValidEmail(buyerEmail)) {
                      event.preventDefault();
                      setMessage(t.rfqDetail.needEmail);
                      return;
                    }
                    setMessage(t.rfqDetail.webmailOpened);
                    void emailAction("prepare", { subject: followSubject, body: followBody });
                  }}
                >
                  {t.rfqDetail.sendFollowUp}
                </a>
              )}
              <button className="btn-secondary" onClick={copyFollowUp}>{t.rfqDetail.copyEmail}</button>
              <button className="btn-secondary" onClick={() => emailAction("mark_followed_up", { subject: followSubject, body: followBody })} disabled={busy}>
                {t.rfqDetail.markSent}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
