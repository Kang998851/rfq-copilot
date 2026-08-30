"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { daysSince, followUpDueFrom, pipelineBucket } from "@/lib/quote/followup";
import type { Quotation } from "@/types/database";
import { useI18n } from "@/lib/i18n/provider";

type RfqSummary = { id: string; reference: string; buyer_name: string; buyer_email: string | null; status: string };
type Row = Quotation & { rfqs: RfqSummary | RfqSummary[] | null };

function rfqOf(row: Row): RfqSummary | null {
  if (Array.isArray(row.rfqs)) return row.rfqs[0] ?? null;
  return row.rfqs;
}

export default function FollowUpWorkspace() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return void (window.location.href = "/login");
    const { data } = await supabase
      .from("quotations")
      .select("*, rfqs(id, reference, buyer_name, buyer_email, status)")
      .eq("status", "sent")
      .order("follow_up_due", { ascending: true });
    setRows((data ?? []) as Row[]);
  }

  useEffect(() => { load(); }, []);

  async function setOutcome(row: Row, outcome: "open" | "won" | "lost") {
    const supabase = createClient();
    const now = new Date();
    const nowIso = now.toISOString();
    await supabase.from("quotations").update({
      outcome,
      follow_up_due: outcome === "open" ? followUpDueFrom(now) : row.follow_up_due,
      updated_at: nowIso,
    }).eq("id", row.id);
    await supabase.from("rfqs").update({
      status: outcome === "open" ? "sent" : outcome,
      updated_at: nowIso,
    }).eq("id", row.rfq_id);
    setMessage(t.followUps.saved);
    await load();
  }

  const groups = useMemo(() => ({
    overdue: rows.filter((row) => pipelineBucket(row) === "overdue"),
    awaiting: rows.filter((row) => pipelineBucket(row) === "awaiting"),
    won: rows.filter((row) => pipelineBucket(row) === "won"),
    lost: rows.filter((row) => pipelineBucket(row) === "lost"),
  }), [rows]);

  return (
    <div>
      <div className="mb-8">
        <p className="label">{t.app.followUps}</p>
        <h1 className="mt-2 text-2xl font-bold">{t.followUps.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{t.followUps.lead}</p>
        {message && <p className="mt-3 text-sm text-slate-600">{message}</p>}
      </div>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-sm text-slate-500">{t.followUps.empty}</div>
      ) : (
        <div className="space-y-8">
          {groups.overdue.length > 0 && (
            <Section title={t.followUps.overdue} count={groups.overdue.length} tone="overdue">
              {groups.overdue.map((row) => <Card key={row.id} row={row} t={t} onOutcome={setOutcome} />)}
            </Section>
          )}
          {groups.awaiting.length > 0 && (
            <Section title={t.followUps.awaiting} count={groups.awaiting.length} tone="awaiting">
              {groups.awaiting.map((row) => <Card key={row.id} row={row} t={t} onOutcome={setOutcome} />)}
            </Section>
          )}
          {groups.won.length > 0 && (
            <Section title={t.followUps.won} count={groups.won.length} tone="won">
              {groups.won.map((row) => <Card key={row.id} row={row} t={t} onOutcome={setOutcome} />)}
            </Section>
          )}
          {groups.lost.length > 0 && (
            <Section title={t.followUps.lost} count={groups.lost.length} tone="lost">
              {groups.lost.map((row) => <Card key={row.id} row={row} t={t} onOutcome={setOutcome} />)}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, count, tone, children }: { title: string; count: number; tone: string; children: React.ReactNode }) {
  const bar = tone === "overdue" ? "border-amber-300" : tone === "won" ? "border-emerald-300" : tone === "lost" ? "border-slate-200" : "border-blue-200";
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{count}</span>
      </div>
      <div className={`space-y-3 border-l-4 pl-4 ${bar}`}>{children}</div>
    </section>
  );
}

function Card({
  row,
  t,
  onOutcome,
}: {
  row: Row;
  t: ReturnType<typeof useI18n>["t"];
  onOutcome: (row: Row, outcome: "open" | "won" | "lost") => void;
}) {
  const waiting = daysSince(row.sent_at);
  const rfq = rfqOf(row);
  const buyer = rfq?.buyer_name || "—";
  const reference = rfq?.reference || row.rfq_id;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-semibold text-blue-600">{reference}</p>
          <h3 className="mt-1 text-lg font-bold">{buyer}</h3>
          <p className="mt-2 text-sm text-slate-500">
            {t.followUps.sentOn} {row.sent_at ? new Date(row.sent_at).toLocaleDateString() : "—"}
            {waiting != null ? ` · ${waiting} ${t.followUps.daysWaiting}` : ""}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {row.follow_up_due ? `${t.followUps.dueOn} ${new Date(row.follow_up_due).toLocaleDateString()}` : t.followUps.noDue}
          </p>
        </div>
        <Link href={`/rfqs/${row.rfq_id}`} className="btn-secondary">{t.followUps.openRfq}</Link>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {row.outcome !== "won" && <button className="btn-primary" onClick={() => onOutcome(row, "won")}>{t.followUps.markWon}</button>}
        {row.outcome !== "lost" && <button className="btn-secondary" onClick={() => onOutcome(row, "lost")}>{t.followUps.markLost}</button>}
        {row.outcome !== "open" && <button className="btn-secondary" onClick={() => onOutcome(row, "open")}>{t.followUps.reopen}</button>}
      </div>
    </div>
  );
}
