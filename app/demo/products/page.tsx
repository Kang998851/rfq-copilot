"use client";

import Link from "next/link";
import { useState } from "react";
import { demoProducts } from "@/lib/demo/data";
import { fill, useI18n } from "@/lib/i18n/provider";
import type { Messages } from "@/lib/i18n/messages";

function categoryLabel(t: Messages, category: string) {
  return t.demo.category[category as keyof typeof t.demo.category] ?? category;
}

export default function DemoProducts() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const categories = ["All", ...Array.from(new Set(demoProducts.map((p) => p.category)))];
  const products = demoProducts.filter((p) => (category === "All" || p.category === category) && [p.sku, p.name, p.model].some((v) => v.toLowerCase().includes(query.toLowerCase())));
  const headers = [t.demo.table.sku, t.demo.table.name, t.demo.table.model, t.demo.table.category, t.demo.table.material, t.demo.table.size, t.demo.table.cost, t.demo.table.moq, t.demo.table.lead];

  return (
    <div>
      <Link href="/demo" className="text-sm text-blue-600">← {t.demo.overview}</Link>
      <div className="mb-6 mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="label">{t.demo.readonly}</p>
          <h1 className="mt-2 text-3xl font-bold">{t.demo.productsTitle}</h1>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{t.demo.noWrites}</span>
      </div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <input className="field max-w-md" placeholder={t.demo.search} value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="field max-w-xs" value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => <option key={c} value={c}>{c === "All" ? t.demo.all : categoryLabel(t, c)}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto border border-slate-200 bg-white">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-100 text-xs uppercase text-slate-500">
            <tr>{headers.map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">{products.map((p) => (
            <tr key={p.sku} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-mono text-xs"><Link href={`/demo/products/${p.sku}`} className="text-blue-600 hover:underline">{p.sku}</Link></td>
              <td className="px-4 py-3 font-medium">{p.name}</td>
              <td className="px-4 py-3">{p.model}</td>
              <td className="px-4 py-3">{categoryLabel(t, p.category)}</td>
              <td className="px-4 py-3">{p.material}</td>
              <td className="px-4 py-3">{p.size}</td>
              <td className="px-4 py-3">{p.cost} {p.currency}</td>
              <td className="px-4 py-3">{p.moq}</td>
              <td className="px-4 py-3">{p.leadTime} {t.demo.days}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">{fill(t.demo.showing, { n: products.length, total: demoProducts.length })}</p>
    </div>
  );
}
