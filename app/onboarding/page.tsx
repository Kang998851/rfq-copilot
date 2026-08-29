"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import LanguageSwitch from "@/components/LanguageSwitch";
import { useI18n } from "@/lib/i18n/provider";

export default function Onboarding() {
  const { t } = useI18n();
  const [form, setForm] = useState({ name: "", country: "", industry: "", website: "", currency: "USD" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return void (window.location.href = "/login");
    const { data, error: companyError } = await supabase.from("companies").insert(form).select().single();
    if (companyError || !data) {
      setError(t.onboard.fail);
      setLoading(false);
      return;
    }
    window.location.href = "/dashboard";
    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm font-bold text-blue-600">RFQ Copilot</p>
          <LanguageSwitch />
        </div>
        <h1 className="mt-5 text-2xl font-bold">{t.onboard.title}</h1>
        <p className="mt-2 text-sm text-slate-500">{t.onboard.lead}</p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <Field label={t.onboard.name} value={form.name} onChange={(v) => update("name", v)} required />
          <Field label={t.onboard.country} value={form.country} onChange={(v) => update("country", v)} required />
          <Field label={t.onboard.industry} value={form.industry} onChange={(v) => update("industry", v)} required />
          <Field label={t.onboard.website} value={form.website} onChange={(v) => update("website", v)} />
          <div>
            <label className="label">{t.onboard.currency}</label>
            <select className="field" value={form.currency} onChange={(e) => update("currency", e.target.value)}>
              <option>USD</option><option>EUR</option><option>GBP</option><option>CNY</option>
            </select>
          </div>
          <button className="btn-primary w-full" disabled={loading}>{loading ? t.onboard.creating : t.onboard.continue}</button>
        </form>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return <div><label className="label">{label}</label><input className="field" value={value} onChange={(e) => onChange(e.target.value)} required={required} /></div>;
}
