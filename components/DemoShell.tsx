"use client";

import Link from "next/link";
import LanguageSwitch from "@/components/LanguageSwitch";
import { useI18n } from "@/lib/i18n/provider";

export default function DemoShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-bold tracking-tight">RFQ <span className="text-blue-600">Copilot</span></Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 sm:inline">{t.demo.mode}</span>
            <LanguageSwitch />
            <Link href="/login" className="text-slate-600 hover:text-slate-950">{t.nav.login}</Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
