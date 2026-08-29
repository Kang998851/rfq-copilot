"use client";

import Link from "next/link";
import { ArrowRight, Package, ReceiptText } from "lucide-react";
import { demoProducts, demoRfqs } from "@/lib/demo/data";
import { useI18n } from "@/lib/i18n/provider";

export default function DemoHome() {
  const { t } = useI18n();
  return (
    <div>
      <div className="mb-8">
        <p className="label">{t.demo.interactive}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{t.demo.title}</h1>
        <p className="mt-2 max-w-2xl text-slate-500">{t.demo.lead}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/demo/products" className="border border-slate-200 bg-white p-6 hover:border-blue-300">
          <Package className="text-blue-600" size={22} />
          <h2 className="mt-6 font-semibold">{t.demo.productsTitle}</h2>
          <p className="mt-2 text-sm text-slate-500">{t.demo.productsBody}</p>
          <span className="mt-5 inline-flex items-center text-sm font-semibold text-blue-600">{t.demo.exploreProducts} <ArrowRight className="ml-2" size={15} /></span>
        </Link>
        <Link href="/demo/rfqs" className="border border-slate-200 bg-white p-6 hover:border-blue-300">
          <ReceiptText className="text-blue-600" size={22} />
          <h2 className="mt-6 font-semibold">{t.demo.rfqsTitle}</h2>
          <p className="mt-2 text-sm text-slate-500">{t.demo.rfqsBody}</p>
          <span className="mt-5 inline-flex items-center text-sm font-semibold text-blue-600">{t.demo.viewRfqs} <ArrowRight className="ml-2" size={15} /></span>
        </Link>
        <div className="border border-slate-200 bg-white p-6">
          <p className="label">{t.demo.dataset}</p>
          <p className="mt-6 text-3xl font-bold">{demoProducts.length}</p>
          <p className="text-sm text-slate-500">{t.demo.industrialProducts}</p>
          <p className="mt-4 text-3xl font-bold">{demoRfqs.length}</p>
          <p className="text-sm text-slate-500">{t.demo.sampleRfqs}</p>
        </div>
      </div>
    </div>
  );
}
