"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { downloadAndStoreQuotePdf } from "@/lib/quote/save";
import { useI18n } from "@/lib/i18n/provider";
import type { Company, Quotation, QuotationItem, Rfq } from "@/types/database";
import QuotationDocument from "./QuotationDocument";

export default function QuoteDocumentPage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const [rfq, setRfq] = useState<Rfq | null>(null);
  const [quote, setQuote] = useState<Quotation | null>(null);
  const [items, setItems] = useState<QuotationItem[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const [{ data: rfqData }, { data: quoteData }] = await Promise.all([
        supabase.from("rfqs").select("*").eq("id", id).single(),
        supabase.from("quotations").select("*").eq("rfq_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      setRfq(rfqData as Rfq | null);
      setQuote((quoteData ?? null) as Quotation | null);
      if (rfqData) {
        const { data: companyData } = await supabase.from("companies").select("*").eq("id", rfqData.company_id).single();
        setCompany(companyData as Company | null);
      }
      if (quoteData) {
        const { data: qItems } = await supabase.from("quotation_items").select("*").eq("quotation_id", quoteData.id);
        setItems((qItems ?? []) as QuotationItem[]);
      }
    })();
  }, [id]);

  async function downloadPdf() {
    if (!rfq || !quote) return;
    setBusy(true);
    setMessage("");
    try {
      await downloadAndStoreQuotePdf({ rfq, quote, items, company, copy: t.quoteDoc });
      setMessage(t.rfqDetail.pdfSaved);
    } catch {
      setMessage(t.rfqDetail.pdfFail);
    }
    setBusy(false);
  }

  if (!rfq) return <div className="text-sm text-slate-500">{t.rfqDetail.loading}</div>;
  if (!quote) {
    return (
      <div>
        <Link href={`/rfqs/${id}`} className="text-sm text-blue-600">← {t.rfqDetail.backRfq}</Link>
        <p className="mt-6 text-sm text-slate-500">{t.rfqDetail.noQuoteYet}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/rfqs/${id}`} className="text-sm text-blue-600">← {t.rfqDetail.backRfq}</Link>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={downloadPdf} disabled={busy}>{busy ? t.rfqDetail.pdfPreparing : t.rfqDetail.downloadPdf}</button>
          <button className="btn-secondary" onClick={() => window.print()}>{t.rfqDetail.print}</button>
        </div>
      </div>
      {message && <p className="mb-4 text-sm text-slate-600 print:hidden">{message}</p>}
      <div className="overflow-auto border border-slate-200 bg-white shadow-sm print:border-0 print:shadow-none">
        <QuotationDocument company={company} rfq={rfq} quote={quote} items={items} copy={t.quoteDoc} />
      </div>
    </div>
  );
}
