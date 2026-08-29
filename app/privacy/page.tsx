"use client";

import Link from "next/link";
import LanguageSwitch from "@/components/LanguageSwitch";
import { useI18n } from "@/lib/i18n/provider";

export default function Privacy() {
  const { t } = useI18n();
  return (
    <Legal>
      <p>{t.legal.privacy1}</p>
      <p>{t.legal.privacy2}</p>
      <p>{t.legal.privacy3}<a className="text-blue-600" href="mailto:hello@rfqcopilot.com">hello@rfqcopilot.com</a>.</p>
    </Legal>
  );
}

function Legal({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <main className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <Link href="/" className="font-bold">RFQ <span className="text-blue-600">Copilot</span></Link>
          <div className="flex items-center gap-4">
            <LanguageSwitch />
            <Link href="/" className="text-sm text-slate-500">{t.nav.home}</Link>
          </div>
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-6 py-16">
        <p className="label">{t.legal.early}</p>
        <h1 className="mt-3 text-4xl font-bold">{t.legal.privacyTitle}</h1>
        <div className="mt-8 space-y-5 text-sm leading-7 text-slate-600">{children}</div>
      </article>
    </main>
  );
}
