"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import {
  COMPANY_PUBLIC_COLUMNS,
  clearStoredMailbox,
  detectSmtpPreset,
  isSmtpReady,
  parseMailboxPayload,
  presetFromEmail,
  readStoredMailbox,
  smtpPreset,
  writeStoredMailbox,
  type SmtpPreset,
} from "@/lib/quote/smtp";
import type { Company } from "@/types/database";

export default function Settings() {
  const { t } = useI18n();
  const [company, setCompany] = useState<Company | null>(null);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [preset, setPreset] = useState<SmtpPreset>("gmail");
  const [host, setHost] = useState(smtpPreset("gmail").host);
  const [port, setPort] = useState(String(smtpPreset("gmail").port));
  const [secure, setSecure] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [mailboxReady, setMailboxReady] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const loginEmail = user.email ?? "";
      setUserEmail(loginEmail);
      const { data: member } = await supabase.from("company_members").select("company_id").eq("user_id", user.id).maybeSingle();
      if (!member) return;
      const { data } = await supabase.from("companies").select(COMPANY_PUBLIC_COLUMNS).eq("id", member.company_id).single();
      if (data) {
        const next = data as Company;
        setCompany(next);
        setContactName(next.contact_name ?? "");
        setContactEmail(next.contact_email ?? "");
        const stored = readStoredMailbox();
        if (stored) {
          setPreset(detectSmtpPreset(stored.host));
          setHost(stored.host);
          setPort(String(stored.port));
          setSecure(stored.secure);
          setUsername(stored.username);
          setPassword(stored.password);
          setMailboxReady(true);
        } else {
          const email = loginEmail || next.contact_email || "";
          const nextPreset = presetFromEmail(email);
          const defaults = smtpPreset(nextPreset);
          setPreset(nextPreset);
          setHost(defaults.host);
          setPort(String(defaults.port));
          setSecure(defaults.secure);
          setUsername(email);
          if (!next.contact_email && email) setContactEmail(email);
        }
      }
    })();
  }, []);

  const mailbox = useMemo(() => parseMailboxPayload({
    host,
    port: Number(port) || 587,
    username,
    password,
    secure,
    from: username,
  }), [host, password, port, secure, username]);

  function applyPreset(next: SmtpPreset) {
    setPreset(next);
    if (next === "custom") return;
    const defaults = smtpPreset(next);
    setHost(defaults.host);
    setPort(String(defaults.port));
    setSecure(defaults.secure);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!company) return;
    setBusy(true);
    setMessage("");
    const { error } = await createClient().from("companies").update({
      contact_name: contactName.trim() || null,
      contact_email: contactEmail.trim() || username.trim() || null,
    }).eq("id", company.id);
    if (error) {
      setMessage(t.settings.saveFail);
      setBusy(false);
      return;
    }
    if (mailbox) {
      writeStoredMailbox(mailbox);
      setMailboxReady(true);
    }
    setMessage(t.settings.saved);
    setBusy(false);
  }

  async function testMailbox() {
    if (!mailbox) {
      setMessage(t.settings.testFail);
      return;
    }
    setBusy(true);
    setMessage("");
    writeStoredMailbox(mailbox);
    setMailboxReady(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setMessage(t.settings.saveFail);
      setBusy(false);
      return;
    }
    const res = await fetch("/api/quotes/email", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test", smtp: mailbox, fromName: contactName }),
    });
    const payload = await res.json().catch(() => ({}));
    setMessage(res.ok ? t.settings.testOk : (payload.error ?? t.settings.testFail));
    setBusy(false);
  }

  function disconnect() {
    clearStoredMailbox();
    setPassword("");
    setMailboxReady(false);
    setMessage(t.settings.mailboxCleared);
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
          <label className="label" htmlFor="contact-name">{t.settings.contactName}</label>
          <input id="contact-name" className="field" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="contact-email">{t.settings.contactEmail}</label>
          <input id="contact-email" className="field" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </div>
        <p className="text-xs text-slate-500">{t.settings.contactHint}</p>

        <div className="border-t border-slate-100 pt-4">
          <h2 className="text-base font-semibold">{t.settings.mailboxTitle}</h2>
          <p className="mt-1 text-sm text-slate-500">{t.settings.mailboxLead}</p>
          <p className="mt-3 text-xs font-medium text-slate-600">{mailboxReady || isSmtpReady(mailbox) ? t.settings.mailboxConnected : t.settings.mailboxMissing}</p>
        </div>
        <div>
          <label className="label" htmlFor="smtp-preset">{t.settings.mailboxPreset}</label>
          <select id="smtp-preset" className="field" value={preset} onChange={(e) => applyPreset(e.target.value as SmtpPreset)}>
            <option value="gmail">{t.settings.presetGmail}</option>
            <option value="outlook">{t.settings.presetOutlook}</option>
            <option value="qq">{t.settings.presetQq}</option>
            <option value="163">{t.settings.preset163}</option>
            <option value="custom">{t.settings.presetCustom}</option>
          </select>
        </div>
        {preset === "custom" && (
          <>
            <div>
              <label className="label" htmlFor="smtp-host">{t.settings.smtpHost}</label>
              <input id="smtp-host" className="field" value={host} onChange={(e) => setHost(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="smtp-port">{t.settings.smtpPort}</label>
              <input id="smtp-port" className="field" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} />
              {t.settings.smtpSecure}
            </label>
          </>
        )}
        <div>
          <label className="label" htmlFor="smtp-user">{t.settings.smtpUser}</label>
          <input id="smtp-user" className="field" type="email" value={username} onChange={(e) => {
            setUsername(e.target.value);
            if (!contactEmail || contactEmail === username || contactEmail === userEmail) setContactEmail(e.target.value);
          }} placeholder={userEmail} />
        </div>
        <div>
          <label className="label" htmlFor="smtp-pass">{t.settings.smtpPass}</label>
          <input id="smtp-pass" className="field" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="mt-2 text-xs text-slate-500">{preset === "gmail" ? t.settings.mailboxHintGmail : t.settings.mailboxHint}</p>
        </div>
        {message && <p className="text-sm text-slate-600">{message}</p>}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy || !company}>{busy ? t.settings.saving : t.settings.save}</button>
          <button type="button" className="btn-secondary" disabled={busy || !mailbox} onClick={testMailbox}>{busy ? t.settings.testingMailbox : t.settings.testMailbox}</button>
          {mailboxReady && <button type="button" className="btn-secondary" disabled={busy} onClick={disconnect}>{t.settings.clearMailbox}</button>}
        </div>
        <p className="text-xs text-slate-500">{t.settings.mailboxPrivacy}</p>
      </form>
    </div>
  );
}
