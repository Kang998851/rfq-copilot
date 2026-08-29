"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Product, Quotation, QuotationItem, Rfq, RfqItem } from "@/types/database";
import { useI18n } from "@/lib/i18n/provider";

export default function RfqDetail() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const [rfq, setRfq] = useState<Rfq | null>(null);
  const [items, setItems] = useState<RfqItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [quote, setQuote] = useState<Quotation | null>(null);
  const [quoteItems, setQuoteItems] = useState<QuotationItem[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const supabase = createClient();
    const [{ data: rfqData }, { data: itemData }, { data: productData }] = await Promise.all([
      supabase.from("rfqs").select("*").eq("id", id).single(),
      supabase.from("rfq_items").select("*").eq("rfq_id", id).order("line_no"),
      supabase.from("products").select("*").eq("active", true),
    ]);
    setRfq(rfqData as Rfq);
    setItems((itemData ?? []) as RfqItem[]);
    setProducts((productData ?? []) as Product[]);
    const { data: quoteData } = await supabase.from("quotations").select("*").eq("rfq_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    setQuote((quoteData ?? null) as Quotation | null);
    if (quoteData) {
      const { data: qItems } = await supabase.from("quotation_items").select("*").eq("quotation_id", quoteData.id);
      setQuoteItems((qItems ?? []) as QuotationItem[]);
    } else setQuoteItems([]);
  }

  useEffect(() => { load(); }, [id]);

  const statusLabel = (status: string) => t.rfqPage.status[status as keyof typeof t.rfqPage.status] ?? status;
  const missingLabel = (item: string) => t.rfqDetail.missingItems[item as keyof typeof t.rfqDetail.missingItems] ?? item;

  async function setReview(item: RfqItem, review_status: string) {
    await createClient().from("rfq_items").update({ review_status }).eq("id", item.id);
    setItems((rows) => rows.map((row) => row.id === item.id ? { ...row, review_status } : row));
  }

  async function setMatch(item: RfqItem, productId: string) {
    const product = products.find((p) => p.id === productId);
    await createClient().from("rfq_items").update({
      matched_product_id: product?.id ?? null,
      matched_sku: product?.sku ?? null,
      confidence: product ? 90 : 0,
      review_status: "pending",
    }).eq("id", item.id);
    await load();
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
    let current = quote;
    if (!current) {
      const { data, error } = await supabase.from("quotations").insert({
        company_id: rfq.company_id,
        rfq_id: rfq.id,
        status: "draft",
        currency: products.find((p) => p.id === usable[0].matched_product_id)?.currency || "USD",
        notes: t.rfqDetail.humanNote,
      }).select().single();
      if (error || !data) {
        setMessage(error?.message ?? t.rfqDetail.saveFail);
        setBusy(false);
        return;
      }
      current = data as Quotation;
    }
    await supabase.from("quotation_items").delete().eq("quotation_id", current.id);
    const rows = usable.map((item) => {
      const product = products.find((p) => p.id === item.matched_product_id);
      return {
        company_id: rfq.company_id,
        quotation_id: current!.id,
        rfq_item_id: item.id,
        sku: product?.sku ?? item.matched_sku,
        name: product?.name ?? item.requirement,
        quantity: item.quantity,
        unit: item.unit ?? product?.unit,
        unit_price: product?.cost ?? null,
        lead_time_days: product?.lead_time_days ?? null,
        notes: product?.cost == null ? t.rfqDetail.noPrice : null,
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
    await createClient().from("quotation_items").update({ unit_price, notes: unit_price == null ? t.rfqDetail.noPrice : null }).eq("id", item.id);
    setQuoteItems((rows) => rows.map((row) => row.id === item.id ? { ...row, unit_price } : row));
  }

  async function markReady() {
    if (!quote) return;
    if (quoteItems.some((item) => item.unit_price == null)) {
      setMessage(t.rfqDetail.needPrices);
      return;
    }
    await createClient().from("quotations").update({ status: "ready", updated_at: new Date().toISOString() }).eq("id", quote.id);
    setQuote({ ...quote, status: "ready" });
    setMessage(t.rfqDetail.ready);
  }

  function emailDraft() {
    if (!rfq) return "";
    const lines = quoteItems.map((item) => `- ${item.sku ?? ""} ${item.name} × ${item.quantity ?? "?"} ${item.unit ?? ""} @ ${item.unit_price ?? "TBD"}`).join("\n");
    return `Dear ${rfq.buyer_name},\n\nThank you for RFQ ${rfq.reference}. Please find our quotation draft below for your review.\n\n${lines}\n\nThis quotation is pending human confirmation and is not a final commercial offer.\n\nBest regards`;
  }

  async function copyEmail() {
    await navigator.clipboard.writeText(emailDraft());
    setMessage(t.rfqDetail.copied);
  }

  if (!rfq) return <div className="text-sm text-slate-500">{t.rfqDetail.loading}</div>;

  return (
    <div className="max-w-5xl">
      <Link href="/rfqs" className="text-sm text-blue-600">← {t.rfqPage.title}</Link>
      <div className="mb-7 mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="label">{rfq.reference} · {rfq.source_filename || rfq.source_type}</p>
          <h1 className="mt-2 text-3xl font-bold">{rfq.buyer_name}</h1>
          <p className="mt-2 text-sm text-slate-500">{new Date(rfq.created_at).toLocaleString()}</p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{statusLabel(rfq.status)}</span>
      </div>

      <div className="space-y-6">
        {items.map((item) => {
          const product = products.find((p) => p.id === item.matched_product_id);
          return (
            <div key={item.id} className="grid gap-6 border border-slate-200 bg-white p-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div>
                <p className="label">{t.rfqDetail.line} {item.line_no}</p>
                <h2 className="mt-3 text-lg font-bold">{t.rfqDetail.customerReq}</h2>
                <div className="mt-4 rounded-md bg-slate-50 p-4 text-sm font-medium leading-7">
                  {item.requirement}
                  <br />{t.rfqDetail.quantity}: {item.quantity ?? "—"} {item.unit ?? ""}
                </div>
                <h2 className="mt-7 text-lg font-bold">{t.rfqDetail.matchedProduct}</h2>
                <div className={`mt-4 rounded-md border p-4 ${product ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold">{product ? `${product.sku} · ${product.name}` : t.rfqDetail.noMatch}</p>
                      <p className="mt-1 text-xs">{t.rfqDetail.confidenceScore} {item.confidence}%</p>
                    </div>
                    {product && <CheckCircle2 className="text-green-700" size={20} />}
                  </div>
                  <select className="field mt-3" value={item.matched_product_id ?? ""} onChange={(e) => setMatch(item, e.target.value)}>
                    <option value="">{t.rfqDetail.changeMatch}</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}
                  </select>
                  <div className="mt-3 flex gap-2">
                    <button className="btn-primary" onClick={() => setReview(item, "accepted")}>{t.rfqDetail.accept}</button>
                    <button className="btn-secondary" onClick={() => setReview(item, "rejected")}>{t.rfqDetail.reject}</button>
                    <span className="self-center text-xs text-slate-500">{t.rfqDetail.review[item.review_status as keyof typeof t.rfqDetail.review] ?? item.review_status}</span>
                  </div>
                </div>
              </div>
              <div>
                <p className="label">{t.rfqDetail.reviewQueue}</p>
                <h2 className="mt-3 text-lg font-bold">{t.rfqDetail.missing}</h2>
                <div className="mt-4 space-y-3">
                  {item.missing.length === 0 ? <p className="text-sm text-slate-500">{t.rfqDetail.noneMissing}</p> : item.missing.map((m) => (
                    <div key={m} className="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertCircle size={17} />{missingLabel(m)}</div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
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
            {quote && <button className="btn-secondary" onClick={copyEmail}>{t.rfqDetail.copyEmail}</button>}
            {quote && <button className="btn-secondary" onClick={() => window.print()}>{t.rfqDetail.print}</button>}
          </div>
        </div>
        {message && <p className="mt-3 text-sm text-slate-600">{message}</p>}
        {quote && (
          <div className="mt-5 overflow-x-auto">
            <p className="mb-3 text-xs font-semibold uppercase text-slate-500">{quote.status === "ready" ? t.rfqDetail.ready : t.rfqDetail.draft} · {quote.currency}</p>
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-2">SKU</th>
                  <th className="px-2 py-2">{t.rfqDetail.name}</th>
                  <th className="px-2 py-2">{t.rfqDetail.quantity}</th>
                  <th className="px-2 py-2">{t.rfqDetail.unitPrice}</th>
                  <th className="px-2 py-2">{t.rfqDetail.lead}</th>
                </tr>
              </thead>
              <tbody>{quoteItems.map((item) => (
                <tr key={item.id} className="border-b">
                  <td className="px-2 py-2 font-mono text-xs">{item.sku}</td>
                  <td className="px-2 py-2">{item.name}</td>
                  <td className="px-2 py-2">{item.quantity} {item.unit}</td>
                  <td className="px-2 py-2">
                    <input className="field w-28" type="number" value={item.unit_price ?? ""} onChange={(e) => savePrice(item, e.target.value === "" ? null : Number(e.target.value))} />
                  </td>
                  <td className="px-2 py-2">{item.lead_time_days ?? "—"}</td>
                </tr>
              ))}</tbody>
            </table>
            <p className="mt-4 text-xs text-slate-500">{t.rfqDetail.humanNote}</p>
          </div>
        )}
      </div>
    </div>
  );
}
