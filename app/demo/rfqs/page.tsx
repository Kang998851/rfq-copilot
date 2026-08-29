"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { demoRfqs } from "@/lib/demo/data";
import { useI18n } from "@/lib/i18n/provider";
import type { Messages } from "@/lib/i18n/messages";

function statusLabel(t: Messages, status: string) {
  return t.demo.status[status as keyof typeof t.demo.status] ?? status;
}

export default function DemoRfqs() {
  const { t } = useI18n();
  const headers = [t.demo.table.rfq, t.demo.table.buyer, t.demo.table.received, t.demo.table.items, t.demo.table.status, ""];

  return (
    <div>
      <Link href="/demo" className="text-sm text-blue-600">← {t.demo.overview}</Link>
      <div className="mb-6 mt-4">
        <p className="label">{t.demo.readonly}</p>
        <h1 className="mt-2 text-3xl font-bold">{t.demo.rfqsTitle}</h1>
        <p className="mt-2 text-slate-500">{t.demo.rfqLead}</p>
      </div>
      <div className="overflow-x-auto border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-100 text-xs uppercase text-slate-500">
            <tr>{headers.map((h, i) => <th key={h || i} className="px-4 py-3">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">{demoRfqs.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="px-4 py-4 font-mono text-xs font-semibold text-blue-600">{r.id}</td>
              <td className="px-4 py-4 font-medium">{r.buyer}</td>
              <td className="px-4 py-4 text-slate-600">{r.received}</td>
              <td className="px-4 py-4">{r.items}</td>
              <td className="px-4 py-4"><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">{statusLabel(t, r.status)}</span></td>
              <td className="px-4 py-4"><Link href={`/demo/rfqs/${r.id}`} className="inline-flex items-center text-blue-600">{t.demo.open} <ArrowRight className="ml-2" size={15} /></Link></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
