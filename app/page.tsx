"use client";

import Link from "next/link";
import { ArrowRight, Check, ShieldCheck, Workflow } from "lucide-react";
import LanguageSwitch from "@/components/LanguageSwitch";
import { useI18n } from "@/lib/i18n/provider";

export default function LandingPage() {
  const { t } = useI18n();
  const L = t.landing;
  const flow = [
    ["01", L.flow1t, L.flow1b, false],
    ["02", L.flow2t, L.flow2b, false],
    ["03", L.flow3t, L.flow3b, false],
    ["04", L.flow4t, L.flow4b, false],
  ] as const;

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <header className="border-b border-slate-200 bg-white/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-bold tracking-tight">RFQ <span className="text-blue-600">Copilot</span></Link>
          <div className="flex items-center gap-3">
            <nav className="hidden items-center gap-7 text-sm text-slate-600 md:flex">
              <a href="#product" className="hover:text-slate-950">{t.nav.product}</a>
              <a href="#workflow" className="hover:text-slate-950">{t.nav.workflow}</a>
              <a href="#security" className="hover:text-slate-950">{t.nav.security}</a>
              <Link href="/login" className="hover:text-slate-950">{t.nav.login}</Link>
              <Link href="/demo" className="btn-primary">{t.nav.demo}</Link>
            </nav>
            <LanguageSwitch />
            <Link href="/demo" className="btn-primary md:hidden">{t.nav.demo}</Link>
          </div>
        </div>
      </header>
      <section className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto grid max-w-7xl gap-14 px-6 py-20 lg:grid-cols-[1fr_0.9fr] lg:items-center lg:py-28">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"><span className="h-1.5 w-1.5 rounded-full bg-blue-600" />{L.badge}</div>
            <h1 className="max-w-2xl text-5xl font-bold leading-[1.05] tracking-[-0.04em] sm:text-6xl">{L.h1a}<span className="text-blue-600">{L.h1b}</span>{L.h1c}</h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">{L.lead}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/demo" className="btn-primary px-5 py-3">{L.tryDemo} <ArrowRight className="ml-2" size={16} /></Link>
              <a href="#workflow" className="btn-secondary px-5 py-3">{L.viewWorkflow}</a>
            </div>
            <p className="mt-5 text-xs text-slate-500">{L.sampleNote}</p>
          </div>
          <ProductPreview />
        </div>
      </section>
      <section id="product" className="mx-auto max-w-7xl px-6 py-20">
        <div className="max-w-2xl">
          <p className="label">{L.painLabel}</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{L.painTitle}</h2>
          <p className="mt-4 text-slate-600">{L.painBody}</p>
        </div>
        <div className="mt-12 grid gap-3 md:grid-cols-6">{L.steps.map((item, i) => (
          <div key={item} className="relative border border-slate-200 bg-white p-4">
            <span className="text-xs font-bold text-blue-600">0{i + 1}</span>
            <p className="mt-8 text-sm font-semibold">{item}</p>
            {i < 5 && <ArrowRight className="absolute -right-3 top-1/2 z-10 hidden bg-white text-slate-400 md:block" size={18} />}
          </div>
        ))}</div>
      </section>
      <section id="workflow" className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="label">{L.flowLabel}</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{L.flowTitle}</h2>
              <p className="mt-4 text-slate-600">{L.flowBody}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">{flow.map(([n, title, body, next]) => (
              <div key={n} className="border border-slate-200 bg-white p-5">
                <span className="text-xs font-bold text-blue-600">{n}</span>
                <h3 className="mt-8 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{body}</p>
                {next && <span className="mt-4 inline-block text-xs font-semibold text-amber-700">{L.comingNext}</span>}
              </div>
            ))}</div>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-2 lg:items-center">
        <div className="order-2 rounded-lg border border-slate-200 bg-slate-950 p-5 text-slate-100 shadow-xl lg:order-1">
          <div className="mb-5 flex items-center justify-between border-b border-slate-800 pb-4">
            <span className="text-sm font-semibold">{L.catalogLabel}</span>
            <span className="text-xs text-slate-400">{L.catalogCount}</span>
          </div>
          {["VLV-001 · Gate Valve", "PMP-001 · Centrifugal Pump", "BRG-001 · Deep Groove Bearing", "MTR-001 · Three Phase Motor"].map((p, i) => (
            <div key={p} className="flex items-center justify-between border-b border-slate-800 py-3 text-sm">
              <span>{p}</span>
              <span className="text-xs text-slate-400">{i % 2 ? L.active : "USD"}</span>
            </div>
          ))}
          <Link href="/demo" className="mt-5 inline-flex items-center text-sm font-semibold text-blue-300">{L.openDemo} <ArrowRight className="ml-2" size={15} /></Link>
        </div>
        <div className="order-1 lg:order-2">
          <p className="label">{L.catalogLabel}</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight">{L.catalogTitle}</h2>
          <p className="mt-4 leading-7 text-slate-600">{L.catalogBody}</p>
          <div className="mt-7 space-y-3 text-sm text-slate-700">{L.catalogPoints.map((x) => (
            <div key={x} className="flex items-center gap-3"><Check size={16} className="text-blue-600" />{x}</div>
          ))}</div>
          <Link href="/demo" className="btn-primary mt-8">{L.openDemo}</Link>
        </div>
      </section>
      <section id="security" className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-16 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-4">
            <ShieldCheck className="mt-1 text-blue-600" size={24} />
            <div>
              <h2 className="text-xl font-bold">{L.humanTitle}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{L.humanBody}</p>
            </div>
          </div>
          <Link href="/demo" className="btn-secondary shrink-0">{L.exploreDemo}</Link>
        </div>
      </section>
      <footer className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>{L.footer}</span>
        <div className="flex gap-5">
          <Link href="/privacy">{t.nav.privacy}</Link>
          <Link href="/terms">{t.nav.terms}</Link>
          <a href="mailto:hello@rfqcopilot.com">{t.nav.contact}</a>
        </div>
      </footer>
    </main>
  );
}

function ProductPreview() {
  const { t } = useI18n();
  const L = t.landing;
  const stats: [string, string, string][] = [
    ["42", L.lineItems, "text-slate-950"],
    ["38", L.productsMatched, "text-blue-600"],
    ["4", L.specsReview, "text-amber-600"],
  ];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-200/60">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><span className="h-2 w-2 rounded-full bg-blue-600" />RFQ Copilot</div>
        <span className="text-xs text-slate-400">{L.previewSample}</span>
      </div>
      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{L.incoming}</span>
          <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">{L.needsReview}</span>
        </div>
        <p className="mt-3 text-sm font-semibold">Northstar Industrial GmbH</p>
        <p className="mt-1 text-xs text-slate-500">RFQ-2026-001 · customer email + PDF</p>
      </div>
      <div className="my-4 ml-4 border-l border-slate-200 pl-5">{stats.map(([n, label, c]) => (
        <div key={label} className="relative flex items-center gap-3 py-3">
          <span className={`absolute -left-[29px] h-2 w-2 rounded-full bg-current ${c}`} />
          <span className={`text-xl font-bold ${c}`}>{n}</span>
          <span className="text-sm text-slate-600">{label}</span>
        </div>
      ))}</div>
      <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-4">
        <div className="flex items-center gap-3"><Workflow size={18} className="text-green-700" /><span className="text-sm font-semibold text-green-800">{L.quoteReady}</span></div>
        <span className="text-xs text-green-700">{L.humanReview}</span>
      </div>
    </div>
  );
}
