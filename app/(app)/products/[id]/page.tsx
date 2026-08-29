"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Product } from "@/types/database";
import { useI18n } from "@/lib/i18n/provider";

const FIELD_KEYS = ["name", "description", "category", "model", "material", "size", "cost", "currency", "moq", "lead_time_days", "unit"] as const;

export default function ProductDetail() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<Partial<Product>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    createClient().from("products").select("*").eq("id", id).single().then(({ data }) => {
      setProduct(data as Product);
      setForm(data as Product);
    });
  }, [id]);

  if (!product) return <div className="text-sm text-slate-500">{t.product.loading}</div>;

  const set = (key: string, value: string | number | boolean) => setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    setSaving(true);
    setMessage("");
    const { error } = await createClient().from("products").update({ ...form, specifications: form.specifications ?? {} }).eq("id", id);
    setMessage(error ? t.product.saveFail : t.product.saved);
    setSaving(false);
  }

  return (
    <div className="max-w-3xl">
      <p className="label">Product / {product.sku}</p>
      <h1 className="mt-2 text-2xl font-bold">{t.product.edit}</h1>
      <div className="mt-6 grid gap-5 rounded-lg border border-slate-200 bg-white p-6 sm:grid-cols-2">
        {FIELD_KEYS.map((key) => (
          <div key={key} className={key === "description" ? "sm:col-span-2" : ""}>
            <label className="label">{t.product.fields[key]}</label>
            {key === "description"
              ? <textarea className="field" rows={3} value={String(form[key] ?? "")} onChange={(e) => set(key, e.target.value)} />
              : <input className="field" type={["cost", "moq", "lead_time_days"].includes(key) ? "number" : "text"} value={String(form[key] ?? "")} onChange={(e) => set(key, ["cost", "moq", "lead_time_days"].includes(key) ? Number(e.target.value) : e.target.value)} />}
          </div>
        ))}
        <div className="sm:col-span-2">
          <label className="label">{t.product.specs}</label>
          <textarea className="field font-mono text-xs" rows={5} value={JSON.stringify(form.specifications ?? {}, null, 2)} onChange={(e) => { try { set("specifications", JSON.parse(e.target.value)); } catch { /* wait for valid JSON */ } }} />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(form.active)} onChange={(e) => set("active", e.target.checked)} /> {t.product.active}</label>
      </div>
      <div className="mt-4 flex items-center gap-4">
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? t.product.saving : t.product.save}</button>
        {message && <span className="text-sm text-slate-600">{message}</span>}
      </div>
    </div>
  );
}
