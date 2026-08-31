"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/provider";
import { isValidEmail } from "@/lib/quote/email";
import {
  COMPANY_PUBLIC_COLUMNS,
  buildMailboxConfig,
  clearStoredMailbox,
  detectSmtpPreset,
  isSmtpReady,
  mailboxGuideHref,
  mailboxServers,
  presetFromEmail,
  readStoredMailbox,
  writeStoredMailbox,
  type SmtpPreset,
} from "@/lib/quote/smtp";
import type { Company } from "@/types/database";
import {
  CATEGORY_MARGIN_KEYS,
  defaultPricingRules,
  percentInput,
  rateFromPercentInput,
  readStoredPricing,
  writeStoredPricing,
  type PricingMethod,
  type PricingRules,
} from "@/lib/quote/pricing";

const PRESETS: SmtpPreset[] = ["gmail", "outlook", "qq", "163", "custom"];

export default function Settings() {
  const { t } = useI18n();
  const [company, setCompany] = useState<Company | null>(null);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [preset, setPreset] = useState<SmtpPreset>("qq");
  const [authCode, setAuthCode] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(465);
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState(993);
  const [secure, setSecure] = useState(true);
  const [mailboxReady, setMailboxReady] = useState(false);
  const [gmailConfigured, setGmailConfigured] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pricing, setPricing] = useState<PricingRules>(defaultPricingRules());

  const hint = useMemo(() => {
    if (preset === "gmail") return t.settings.mailboxHintGmail;
    if (preset === "outlook") return t.settings.mailboxHintOutlook;
    if (preset === "qq") return t.settings.mailboxHintQq;
    if (preset === "163") return t.settings.mailboxHint163;
    return t.settings.mailboxHint;
  }, [preset, t.settings]);

  const guideHref = mailboxGuideHref(preset);
  const showServers = preset === "custom";

  function applyPreset(next: SmtpPreset, email = contactEmail) {
    setPreset(next);
    const servers = mailboxServers(next, email);
    setSmtpHost(servers.host);
    setSmtpPort(servers.port);
    setImapHost(servers.imapHost);
    setImapPort(servers.imapPort);
    setSecure(servers.secure);
  }

  useEffect(() => {
    const flag = new URLSearchParams(window.location.search).get("gmail");
    if (flag === "connected") setMessage(t.settings.gmailConnected);
    if (flag === "denied") setMessage(t.settings.gmailDenied);
    if (flag === "error") setMessage(t.settings.gmailError);
    if (flag === "setup") setMessage(t.settings.gmailNeedSetup);
  }, [t.settings.gmailConnected, t.settings.gmailDenied, t.settings.gmailError, t.settings.gmailNeedSetup]);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const loginEmail = user.email ?? "";
      setUserEmail(loginEmail);
      const stored = readStoredMailbox();
      if (stored) {
        setMailboxReady(isSmtpReady(stored));
        setContactEmail(stored.username || stored.from);
        setAuthCode(stored.password);
        applyPreset(detectSmtpPreset(stored.host) === "custom" ? presetFromEmail(stored.username) : detectSmtpPreset(stored.host), stored.username);
        setSmtpHost(stored.host);
        setSmtpPort(stored.port);
        setImapHost(stored.imapHost || "");
        setImapPort(stored.imapPort || 993);
        setSecure(stored.secure);
      }
      const { data: member } = await supabase.from("company_members").select("company_id").eq("user_id", user.id).maybeSingle();
      if (!member) return;
      const { data } = await supabase.from("companies").select(COMPANY_PUBLIC_COLUMNS).eq("id", member.company_id).single();
      if (data) {
        const next = data as Company;
        setCompany(next);
        setContactName(next.contact_name ?? "");
        setPricing(readStoredPricing(next.id));
        if (!stored) {
          const email = next.contact_email || loginEmail;
          setContactEmail(email);
          applyPreset(presetFromEmail(email), email);
        }
      }
      const status = await fetch("/api/mailbox/google/status");
      const payload = await status.json().catch(() => ({}));
      setGmailConfigured(Boolean(payload.configured));
      setGmailConnected(Boolean(payload.connected));
      setGmailEmail(typeof payload.email === "string" ? payload.email : "");
    })();
  }, []);

  function currentMailbox() {
    return buildMailboxConfig({
      preset,
      email: contactEmail.trim() || userEmail,
      password: authCode,
      displayName: contactName,
      host: smtpHost,
      port: smtpPort,
      imapHost,
      imapPort,
      secure,
    });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!company) return;
    const email = contactEmail.trim() || userEmail;
    if (email && !isValidEmail(email)) {
      setMessage(t.settings.saveFail);
      return;
    }
    setBusy(true);
    setMessage("");
    const mailbox = currentMailbox();
    if (mailbox) {
      writeStoredMailbox(mailbox);
      setMailboxReady(true);
    }
    const { error } = await createClient().from("companies").update({
      contact_name: contactName.trim() || null,
      contact_email: email || null,
    }).eq("id", company.id);
    writeStoredPricing(company.id, pricing);
    setMessage(error ? t.settings.saveFail : mailbox ? t.settings.mailboxConnected : t.settings.saved);
    setBusy(false);
  }

  async function testMailbox() {
    const mailbox = currentMailbox();
    if (!mailbox) {
      setMessage(t.settings.mailboxMissing);
      return;
    }
    writeStoredMailbox(mailbox);
    setMailboxReady(true);
    setBusy(true);
    setMessage("");
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
      body: JSON.stringify({ action: "test", fromName: contactName, smtp: mailbox }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) setMessage(payload.error ?? t.settings.testFail);
    else if (payload.inbox === false) setMessage(t.settings.inboxFail);
    else setMessage(`${t.settings.testOk} ${t.settings.inboxOk}`);
    setBusy(false);
  }

  async function disconnectMailbox() {
    clearStoredMailbox();
    setAuthCode("");
    setMailboxReady(false);
    setMessage(t.settings.mailboxCleared);
  }

  async function disconnectGmail() {
    setBusy(true);
    await fetch("/api/mailbox/google/disconnect", { method: "POST" });
    setGmailConnected(false);
    setGmailEmail("");
    setMessage(t.settings.gmailDisconnected);
    setBusy(false);
  }

  async function testGmail() {
    setBusy(true);
    setMessage("");
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
      body: JSON.stringify({ action: "test", fromName: contactName }),
    });
    const payload = await res.json().catch(() => ({}));
    setMessage(res.ok ? t.settings.testOk : (payload.error ?? t.settings.testFail));
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
          <label className="label" htmlFor="contact-name">{t.settings.contactName}</label>
          <input id="contact-name" className="field" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </div>

        <div className="border-t border-slate-100 pt-4">
          <h2 className="text-base font-semibold">{t.settings.mailboxTitle}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{t.settings.mailboxLead}</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">{t.settings.mailboxWhy}</p>
          <p className="label mt-4">{t.settings.mailboxPreset}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PRESETS.map((kind) => (
              <button
                key={kind}
                type="button"
                className={`rounded-md border px-3 py-2 text-sm ${preset === kind ? "border-blue-600 bg-blue-50 font-semibold text-blue-800" : "border-slate-200 text-slate-600"}`}
                onClick={() => applyPreset(kind)}
              >
                {kind === "gmail" ? t.settings.presetGmail
                  : kind === "outlook" ? t.settings.presetOutlook
                    : kind === "qq" ? t.settings.presetQq
                      : kind === "163" ? t.settings.preset163
                        : t.settings.presetCustom}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="contact-email">{t.settings.smtpUser}</label>
          <input
            id="contact-email"
            className="field"
            type="email"
            value={contactEmail}
            onChange={(e) => {
              const value = e.target.value;
              setContactEmail(value);
              const next = presetFromEmail(value);
              if (next !== "custom" || preset === "custom") applyPreset(next === "custom" ? preset : next, value);
            }}
            placeholder={userEmail}
          />
        </div>
        <div>
          <label className="label" htmlFor="auth-code">{t.settings.smtpPass}</label>
          <input id="auth-code" className="field" type="password" autoComplete="off" value={authCode} onChange={(e) => setAuthCode(e.target.value)} />
        </div>
        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{hint}</p>
        {guideHref && (
          <a className="text-sm text-blue-600" href={guideHref} target="_blank" rel="noreferrer">{t.settings.mailboxGuideOpen}</a>
        )}
        {showServers && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="smtp-host">{t.settings.smtpHost}</label>
              <input id="smtp-host" className="field" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="smtp-port">{t.settings.smtpPort}</label>
              <input id="smtp-port" className="field" type="number" value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value) || 587)} />
            </div>
            <div>
              <label className="label" htmlFor="imap-host">{t.settings.imapHost}</label>
              <input id="imap-host" className="field" value={imapHost} onChange={(e) => setImapHost(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="imap-port">{t.settings.imapPort}</label>
              <input id="imap-port" className="field" type="number" value={imapPort} onChange={(e) => setImapPort(Number(e.target.value) || 993)} />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2">
              <input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} />
              {t.settings.smtpSecure}
            </label>
          </div>
        )}
        <p className="text-xs leading-5 text-slate-500">{mailboxReady ? t.settings.mailboxConnected : t.settings.mailboxMissing}</p>
        <p className="text-xs leading-5 text-slate-500">{t.settings.mailboxPrivacy}</p>

        <div className="border-t border-slate-100 pt-4">
          <h2 className="text-base font-semibold">{t.settings.pricingTitle}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{t.settings.pricingLead}</p>
          <p className="label mt-4">{t.settings.method}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["margin", "markup"] as PricingMethod[]).map((method) => (
              <button
                key={method}
                type="button"
                className={`rounded-md border px-3 py-2 text-sm ${pricing.method === method ? "border-blue-600 bg-blue-50 font-semibold text-blue-800" : "border-slate-200 text-slate-600"}`}
                onClick={() => setPricing((row) => ({ ...row, method }))}
              >
                {method === "margin" ? t.settings.methodMargin : t.settings.methodMarkup}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="default-margin">{t.settings.defaultMargin}</label>
              <input id="default-margin" className="field" type="number" min="0" max="99" step="0.1" value={percentInput(pricing.default_margin)} onChange={(e) => setPricing((row) => ({ ...row, default_margin: rateFromPercentInput(e.target.value) }))} />
            </div>
            <div>
              <label className="label" htmlFor="default-markup">{t.settings.defaultMarkup}</label>
              <input id="default-markup" className="field" type="number" min="0" max="400" step="0.1" value={percentInput(pricing.default_markup)} onChange={(e) => setPricing((row) => ({ ...row, default_markup: rateFromPercentInput(e.target.value, 10) }))} />
            </div>
            <div>
              <label className="label" htmlFor="minimum-margin">{t.settings.minimumMargin}</label>
              <input id="minimum-margin" className="field" type="number" min="0" max="99" step="0.1" value={percentInput(pricing.minimum_margin)} onChange={(e) => setPricing((row) => ({ ...row, minimum_margin: rateFromPercentInput(e.target.value) }))} />
            </div>
          </div>
          <p className="label mt-4">{t.settings.categoryMargins}</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {CATEGORY_MARGIN_KEYS.map((key) => (
              <div key={key}>
                <label className="label" htmlFor={`margin-${key}`}>{key}</label>
                <input
                  id={`margin-${key}`}
                  className="field"
                  type="number"
                  min="0"
                  max="99"
                  step="0.1"
                  value={percentInput(pricing.category_margins[key] ?? 0)}
                  onChange={(e) => setPricing((row) => {
                    const rate = rateFromPercentInput(e.target.value);
                    const category_margins = { ...row.category_margins };
                    if (rate === 0) delete category_margins[key];
                    else category_margins[key] = rate;
                    return { ...row, category_margins };
                  })}
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">{t.settings.percentHint}</p>
        </div>

        {gmailConfigured && (
          <div className="border-t border-slate-100 pt-4">
            <h2 className="text-base font-semibold">{t.settings.gmailTitle}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{t.settings.gmailLead}</p>
            {gmailConnected ? (
              <p className="mt-3 text-sm font-medium text-slate-700">{t.settings.gmailConnectedAs} {gmailEmail}</p>
            ) : (
              <p className="mt-3 text-sm text-slate-500">{t.settings.gmailMissing}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {!gmailConnected && <a className="btn-secondary" href="/api/mailbox/google">{t.settings.connectGmail}</a>}
              {gmailConnected && (
                <>
                  <button type="button" className="btn-secondary" disabled={busy} onClick={testGmail}>{busy ? t.settings.testingMailbox : t.settings.testMailbox}</button>
                  <button type="button" className="btn-secondary" disabled={busy} onClick={disconnectGmail}>{t.settings.disconnectGmail}</button>
                </>
              )}
            </div>
          </div>
        )}

        {message && <p className="text-sm text-slate-600">{message}</p>}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy || !company}>{busy ? t.settings.saving : t.settings.save}</button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={testMailbox}>{busy ? t.settings.testingMailbox : t.settings.testMailbox}</button>
          {mailboxReady && <button type="button" className="btn-secondary" disabled={busy} onClick={disconnectMailbox}>{t.settings.clearMailbox}</button>}
        </div>
      </form>
    </div>
  );
}
