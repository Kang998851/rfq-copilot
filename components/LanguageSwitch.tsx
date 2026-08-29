"use client";

import { useI18n } from "@/lib/i18n/provider";

export default function LanguageSwitch({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className={`inline-flex overflow-hidden rounded-md border border-slate-200 text-xs font-semibold ${className}`}>
      <button type="button" aria-pressed={locale === "en"} onClick={() => setLocale("en")} className={`px-2.5 py-1 ${locale === "en" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{t.lang.en}</button>
      <button type="button" aria-pressed={locale === "zh"} onClick={() => setLocale("zh")} className={`px-2.5 py-1 ${locale === "zh" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{t.lang.zh}</button>
    </div>
  );
}
