"use client";

import Link from "next/link";
import AuthForm from "@/components/AuthForm";
import LanguageSwitch from "@/components/LanguageSwitch";
import { useI18n } from "@/lib/i18n/provider";

export default function Signup() {
  const { t } = useI18n();
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <div className="mb-5 text-sm font-bold text-blue-600">RFQ Copilot</div>
            <h1 className="text-2xl font-bold">{t.auth.create}</h1>
            <p className="mt-2 text-sm text-slate-500">{t.auth.createLead}</p>
          </div>
          <LanguageSwitch />
        </div>
        <AuthForm mode="signup" />
        <p className="mt-6 text-center text-sm text-slate-500">{t.auth.haveAccount} <Link className="font-semibold text-blue-600" href="/login">{t.auth.login}</Link></p>
      </div>
    </main>
  );
}
