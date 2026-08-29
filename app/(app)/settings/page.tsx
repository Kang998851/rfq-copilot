"use client";

import { useI18n } from "@/lib/i18n/provider";

export default function Settings() {
  const { t } = useI18n();
  return (
    <div>
      <p className="label">{t.app.workspaceShort}</p>
      <h1 className="mt-2 text-2xl font-bold">{t.settings.title}</h1>
      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">{t.settings.body}</div>
    </div>
  );
}
