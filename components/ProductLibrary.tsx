"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Product } from "@/types/database";
import { fill, useI18n } from "@/lib/i18n/provider";

export default function ProductLibrary() {
  const { t } = useI18n();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const load = async () => {
    const { data } = await createClient().from("products").select("*").order("created_at", { ascending: false });
    setProducts((data ?? []) as Product[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  const filtered = products.filter((p) => [p.sku, p.name, p.model].some((v) => (v ?? "").toLowerCase().includes(search.toLowerCase())));
  async function toggle(product: Product) {
    await createClient().from("products").update({ active: !product.active }).eq("id", product.id);
    setProducts((ps) => ps.map((p) => p.id === product.id ? { ...p, active: !p.active } : p));
  }
  const headers = [t.catalog.table.sku, t.catalog.table.name, t.catalog.table.model, t.catalog.table.category, t.catalog.table.material, t.catalog.table.size, t.catalog.table.cost, t.catalog.table.moq, t.catalog.table.lead, t.catalog.table.status];

  return (
    <div>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="label">{t.catalog.label}</p>
          <h1 className="mt-2 text-2xl font-bold">{t.catalog.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{fill(t.catalog.count, { n: products.length })}</p>
        </div>
        <Link href="/products/import" className="btn-primary">{t.catalog.import}</Link>
      </div>
      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
        <input className="w-full text-sm outline-none" placeholder={t.catalog.search} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        {loading ? <div className="p-8 text-sm text-slate-500">{t.catalog.loading}</div> : (
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>{headers.map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">{filtered.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs"><Link className="text-blue-600 hover:underline" href={`/products/${p.id}`}>{p.sku}</Link></td>
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-slate-600">{p.model || "—"}</td>
                <td className="px-4 py-3 text-slate-600">{p.category || "—"}</td>
                <td className="px-4 py-3 text-slate-600">{p.material || "—"}</td>
                <td className="px-4 py-3 text-slate-600">{p.size || "—"}</td>
                <td className="px-4 py-3">{p.cost == null ? "—" : `${p.cost} ${p.currency}`}</td>
                <td className="px-4 py-3">{p.moq ?? "—"}</td>
                <td className="px-4 py-3">{p.lead_time_days ? `${p.lead_time_days} ${t.catalog.days}` : "—"}</td>
                <td className="px-4 py-3">
                  <button onClick={() => toggle(p)} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${p.active ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {p.active ? t.catalog.active : t.catalog.disabled}
                  </button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {!loading && filtered.length === 0 && <div className="p-10 text-center text-sm text-slate-500">{t.catalog.empty}</div>}
      </div>
    </div>
  );
}
