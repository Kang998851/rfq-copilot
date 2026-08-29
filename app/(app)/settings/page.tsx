"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import type { Company } from "@/types/database";

export default function Settings() {
  const { t } = useI18n();
  const [company, setCompany] = useState<Company | null>(null);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: member } = await supabase.from("company_members").select("company_id").eq("user_id", user.id).maybeSingle();
      if (!member) return;
      const { data } = await supabase.from("companies").select("*").eq("id", member.company_id).single();
      if (data) {
        setCompany(data as Company);
        setContactName(data.contact_name ?? "");
        setContactEmail(data.contact_email ?? "");
      }
    })();
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!company) return;
    setBusy(true);
    setMessage("");
    const { error } = await createClient().from("companies").update({
      contact_name: contactName.trim() || null,
      contact_email: contactEmail.trim() || null,
    }).eq("id", company.id);
    setMessage(error ? t.settings.saveFail : t.settings.saved);
    setBusy(false);
  }

  return (
    <div className="max-w-xl">
      <p className="label">{t.app.workspaceShort}</p>
      <h1 className="mt-2 text-2xl font-bold">{t.settings.title}</h1>
      <p className="mt-2 text-sm text-slate-500">{t.settings.lead}</p>
      <form onSubmit={save} className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <div>
          <p className="label">{t.settings.company}</p>
          <p className="mt-2 text-sm font-semibold">{company?.name ?? "—"}</p>
        </div>
        <div>
          <label className="label">{t.settings.contactName}</label>
          <input className="field" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </div>
        <div>
          <label className="label">{t.settings.contactEmail}</label>
          <input className="field" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </div>
        <p className="text-xs text-slate-500">{t.settings.contactHint}</p>
        {message && <p className="text-sm text-slate-600">{message}</p>}
        <button className="btn-primary" disabled={busy || !company}>{busy ? t.settings.saving : t.settings.save}</button>
      </form>
    </div>
  );
}
