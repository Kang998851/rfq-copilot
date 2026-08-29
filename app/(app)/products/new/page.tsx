"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";

const OPTIONAL_TEXT = ["description", "category", "model", "material", "size", "unit"] as const;

export default function NewProductPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState({
    sku: "", name: "", description: "", category: "", model: "", material: "", size: "",
    cost: "", currency: "USD", moq: "", lead_time_days: "", unit: "pcs",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  function num(value: string) {
    if (!value.trim()) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.sku.trim()) return setError(t.product.skuRequired);
    if (!form.name.trim()) return setError(t.product.nameRequired);
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return void (window.location.href = "/login");
    const { data: member } = await supabase.from("company_members").select("company_id").eq("user_id", user.id).maybeSingle();
    if (!member) return void (window.location.href = "/onboarding");
    const { data, error: insertError } = await supabase.from("products").insert({
      company_id: member.company_id,
      sku: form.sku.trim(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      category: form.category.trim() || null,
      model: form.model.trim() || null,
      material: form.material.trim() || null,
      size: form.size.trim() || null,
      cost: num(form.cost),
      currency: form.currency.trim() || "USD",
      moq: num(form.moq) == null ? null : Math.round(num(form.moq)!),
      lead_time_days: num(form.lead_time_days) == null ? null : Math.round(num(form.lead_time_days)!),
      unit: form.unit.trim() || null,
      specifications: {},
      active: true,
    }).select("id").single();
    if (insertError || !data) {
      const duplicate = /duplicate|unique/i.test(insertError?.message ?? "") || insertError?.code === "23505";
      setError(duplicate ? t.product.skuDuplicate : (insertError?.message ?? t.product.createFail));
      setSaving(false);
      return;
    }
    router.push(`/products/${data.id}`);
  }

  return (
    <div className="max-w-3xl">
      <Link href="/products" className="text-sm text-blue-600">← {t.product.back}</Link>
      <h1 className="mt-3 text-2xl font-bold">{t.product.create}</h1>
      <p className="mt-1 text-sm text-slate-500">{t.product.createLead}</p>
      <form onSubmit={submit} className="mt-6 grid gap-5 rounded-lg border border-slate-200 bg-white p-6 sm:grid-cols-2">
        {error && <div className="sm:col-span-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <div>
          <label className="label">{t.product.sku} *</label>
          <input className="field" value={form.sku} onChange={(e) => set("sku", e.target.value)} required />
        </div>
        <div>
          <label className="label">{t.product.fields.name} *</label>
          <input className="field" value={form.name} onChange={(e) => set("name", e.target.value)} required />
        </div>
        <div className="sm:col-span-2">
          <label className="label">{t.product.fields.description}</label>
          <textarea className="field" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
        </div>
        {OPTIONAL_TEXT.filter((key) => key !== "description").map((key) => (
          <div key={key}>
            <label className="label">{t.product.fields[key]}</label>
            <input className="field" value={form[key]} onChange={(e) => set(key, e.target.value)} />
          </div>
        ))}
        <div>
          <label className="label">{t.product.fields.cost}</label>
          <input className="field" type="number" step="any" value={form.cost} onChange={(e) => set("cost", e.target.value)} />
        </div>
        <div>
          <label className="label">{t.product.fields.currency}</label>
          <select className="field" value={form.currency} onChange={(e) => set("currency", e.target.value)}>
            <option>USD</option><option>EUR</option><option>GBP</option><option>CNY</option>
          </select>
        </div>
        <div>
          <label className="label">{t.product.fields.moq}</label>
          <input className="field" type="number" value={form.moq} onChange={(e) => set("moq", e.target.value)} />
        </div>
        <div>
          <label className="label">{t.product.fields.lead_time_days}</label>
          <input className="field" type="number" value={form.lead_time_days} onChange={(e) => set("lead_time_days", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <button className="btn-primary" disabled={saving}>{saving ? t.product.creating : t.product.createAction}</button>
        </div>
      </form>
    </div>
  );
}
