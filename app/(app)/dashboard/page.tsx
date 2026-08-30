"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Company } from "@/types/database";
import { useI18n } from "@/lib/i18n/provider";

export default function Dashboard() {
  const { t } = useI18n();
  const [company, setCompany] = useState<Company | null>(null);
  const [productCount, setProductCount] = useState(0);
  const [rfqMonth, setRfqMonth] = useState(0);
  const [pending, setPending] = useState(0);
  const [quotes, setQuotes] = useState(0);
  const [overdue, setOverdue] = useState(0);
  const [openSent, setOpenSent] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return void (window.location.href = "/login");
      const { data: member } = await supabase.from("company_members").select("company_id").eq("user_id", user.id).maybeSingle();
      if (!member) return void (window.location.href = "/onboarding");
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const now = new Date().toISOString();
      const [{ data: companyData }, { count }, { count: monthCount }, { count: pendingCount }, { count: quoteCount }, { count: overdueCount }, { count: openSentCount }] = await Promise.all([
        supabase.from("companies").select("id, name, country, industry, website, default_currency, contact_email, contact_name").eq("id", member.company_id).single(),
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("rfqs").select("id", { count: "exact", head: true }).gte("created_at", start.toISOString()),
        supabase.from("rfqs").select("id", { count: "exact", head: true }).eq("status", "needs_review"),
        supabase.from("quotations").select("id", { count: "exact", head: true }).eq("status", "ready"),
        supabase.from("quotations").select("id", { count: "exact", head: true }).eq("status", "sent").eq("outcome", "open").lte("follow_up_due", now),
        supabase.from("quotations").select("id", { count: "exact", head: true }).eq("status", "sent").eq("outcome", "open"),
      ]);
      setCompany(companyData);
      setProductCount(count ?? 0);
      setRfqMonth(monthCount ?? 0);
      setPending(pendingCount ?? 0);
      setQuotes(quoteCount ?? 0);
      setOverdue(overdueCount ?? 0);
      setOpenSent(openSentCount ?? 0);
    })();
  }, []);

  return (
    <div>
      <div className="mb-8">
        <p className="label">{t.dash.label}</p>
        <h1 className="mt-2 text-2xl font-bold">{company?.name ?? t.dash.fallbackName}</h1>
        <p className="mt-1 text-sm text-slate-500">{t.dash.lead}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Stat label={t.dash.rfqsMonth} value={rfqMonth} note={t.dash.thisMonth} />
      <Stat label={t.dash.products} value={productCount} note={t.dash.inCatalog} />
      <Stat label={t.dash.pending} value={pending} note={t.dash.awaitingReview} />
      <Stat label={t.dash.quotes} value={quotes} note={t.dash.readyQuotes} />
      <Stat label={t.dash.overdue} value={overdue} note={t.dash.overdueNote} />
      <Stat label={t.dash.openSent} value={openSent} note={t.dash.openSentNote} />
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Action href="/products/new" title={t.dash.addTitle} body={t.dash.addBody} />
        <Action href="/products/import" title={t.dash.importTitle} body={t.dash.importBody} />
        <Action href="/products" title={t.dash.libraryTitle} body={t.dash.libraryBody} />
        <Link href="/follow-ups" className="rounded-lg border border-slate-200 bg-white p-5 hover:border-blue-300">
          <p className="font-semibold">{t.dash.followUpsTitle}</p>
          <p className="mt-1 text-sm text-slate-500">{t.dash.followUpsBody}</p>
        </Link>
        <Link href="/rfqs" className="rounded-lg border border-dashed border-slate-300 bg-white p-5 hover:border-blue-300">
          <p className="font-semibold">{t.dash.newRfq}</p>
          <p className="mt-1 text-sm text-slate-500">{t.dash.newRfqBody}</p>
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string | number; note: string }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-3xl font-bold">{value}</p><p className="mt-2 text-xs text-slate-400">{note}</p></div>;
}

function Action({ href, title, body }: { href: string; title: string; body: string }) {
  return <Link href={href} className="rounded-lg border border-slate-200 bg-white p-5 hover:border-blue-300"><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-slate-500">{body}</p></Link>;
}
