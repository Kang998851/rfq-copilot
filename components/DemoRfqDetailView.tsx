"use client";

import Link from "next/link";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { DemoRfq } from "@/lib/demo/data";
import { useI18n } from "@/lib/i18n/provider";
import { translateRequirement } from "@/lib/i18n/requirement";
import type { Messages } from "@/lib/i18n/messages";

function statusLabel(t: Messages, status: string) {
  return t.demo.status[status as keyof typeof t.demo.status] ?? status;
}

function missingLabel(t: Messages, item: string) {
  return t.demo.missingItems[item as keyof typeof t.demo.missingItems] ?? item;
}

export default function DemoRfqDetailView({ rfq }: { rfq: DemoRfq }) {
  const { t, locale } = useI18n();
  const requirement = translateRequirement(rfq.requirement, locale);
  const reviewTone = rfq.status === "Needs Review" ? "bg-amber-500 text-white" : "bg-green-600 text-white";

  return (
    <div className="max-w-5xl">
      <Link href="/demo/rfqs" className="text-sm text-blue-600">← {t.demo.rfqsTitle}</Link>
      <div className="mb-7 mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="label">{t.demo.sampleRfq} · {rfq.id}</p>
          <h1 className="mt-2 text-3xl font-bold">{rfq.buyer}</h1>
          <p className="mt-2 text-sm text-slate-500">{t.demo.received} {rfq.received} · {t.demo.source} {rfq.source}</p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{t.demo.demoDataset}</span>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Metric label={t.demo.items} value={rfq.items} />
        <Metric label={t.demo.quantity} value={rfq.quantity} />
        <Metric label={t.demo.matchConfidence} value={`${rfq.confidence}%`} />
        <div className="border border-slate-200 bg-white p-4">
          <p className="label">{t.demo.reviewStatus}</p>
          <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-bold ${reviewTone}`}>{statusLabel(t, rfq.status)}</p>
        </div>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="border border-slate-200 bg-white p-6">
          <p className="label">{t.demo.requirement}</p>
          <h2 className="mt-3 text-lg font-bold">{t.demo.customerReq}</h2>
          <div className="mt-4 rounded-md bg-slate-50 p-4 text-sm font-medium leading-7">
            {requirement.text}
            <br />{t.demo.quantity}: {rfq.quantity}
            {requirement.changed && <p className="mt-3 text-xs font-normal leading-6 text-slate-500">{t.rfqDetail.original}: {requirement.original}</p>}
          </div>
          <h2 className="mt-7 text-lg font-bold">{t.demo.matchedProduct}</h2>
          <div className="mt-4 flex items-start justify-between rounded-md border border-green-200 bg-green-50 p-4">
            <div>
              <p className="text-sm font-semibold text-green-900">{rfq.matched}</p>
              <p className="mt-1 text-xs text-green-700">{t.demo.confidenceScore} {rfq.confidence}%</p>
            </div>
            <CheckCircle2 className="text-green-700" size={20} />
          </div>
        </div>
        <div className="border border-slate-200 bg-white p-6">
          <p className="label">{t.demo.reviewQueue}</p>
          <h2 className="mt-3 text-lg font-bold">{t.demo.missing}</h2>
          <div className="mt-4 space-y-3">{rfq.missing.map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertCircle size={17} />{missingLabel(t, item)}
            </div>
          ))}</div>
          <p className="mt-6 text-xs leading-5 text-slate-500">{t.demo.rfqFooter}</p>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="border border-slate-200 bg-white p-4"><p className="label">{label}</p><p className="mt-2 text-lg font-bold">{value}</p></div>;
}
