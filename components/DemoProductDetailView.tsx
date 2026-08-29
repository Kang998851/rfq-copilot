"use client";

import Link from "next/link";
import type { DemoProduct } from "@/lib/demo/data";
import { useI18n } from "@/lib/i18n/provider";
import type { Messages } from "@/lib/i18n/messages";

function categoryLabel(t: Messages, category: string) {
  return t.demo.category[category as keyof typeof t.demo.category] ?? category;
}

function specLabel(t: Messages, key: string) {
  return t.demo.specs[key as keyof typeof t.demo.specs] ?? key;
}

export default function DemoProductDetailView({ product }: { product: DemoProduct }) {
  const { t } = useI18n();
  const facts: [string, string][] = [
    [t.demo.facts.material, product.material],
    [t.demo.facts.size, product.size],
    [t.demo.facts.cost, `${product.cost} ${product.currency}`],
    [t.demo.facts.moq, `${product.moq} ${product.unit}`],
    [t.demo.facts.lead, `${product.leadTime} ${t.demo.days}`],
    [t.demo.facts.status, t.demo.status.Active],
  ];

  return (
    <div className="max-w-3xl">
      <Link href="/demo/products" className="text-sm text-blue-600">← {t.demo.backProducts}</Link>
      <div className="mt-5 flex items-start justify-between">
        <div>
          <p className="label">{t.demo.sampleProduct} · {product.sku}</p>
          <h1 className="mt-2 text-3xl font-bold">{product.name}</h1>
          <p className="mt-2 text-slate-500">{categoryLabel(t, product.category)} · {product.model}</p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{t.demo.readOnly}</span>
      </div>
      <div className="mt-8 grid gap-4 border border-slate-200 bg-white p-6 sm:grid-cols-2">{facts.map(([label, value]) => (
        <div key={label}><p className="label">{label}</p><p className="mt-2 text-sm font-semibold">{value}</p></div>
      ))}</div>
      <div className="mt-4 border border-slate-200 bg-white p-6">
        <p className="label">{t.demo.specifications}</p>
        {Object.entries(product.specifications).map(([key, value]) => (
          <div key={key} className="flex justify-between border-b border-slate-100 py-3 text-sm">
            <span className="text-slate-500">{specLabel(t, key)}</span>
            <span className="font-medium">{value}</span>
          </div>
        ))}
      </div>
      <p className="mt-5 text-xs text-slate-500">{t.demo.sampleFooter}</p>
    </div>
  );
}
