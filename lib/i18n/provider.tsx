"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LOCALE_COOKIE, type Locale } from "./locale";
import { messages, type Messages } from "./messages";

type Ctx = { locale: Locale; setLocale: (locale: Locale) => void; t: Messages };

const LanguageContext = createContext<Ctx | null>(null);

export function LanguageProvider({ initial, children }: { initial: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initial);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; SameSite=Lax`;
    try { localStorage.setItem(LOCALE_COOKIE, locale); } catch { /* ignore */ }
  }, [locale]);

  const value = useMemo<Ctx>(() => ({
    locale,
    setLocale: setLocaleState,
    t: messages[locale] as Messages,
  }), [locale]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useI18n must be used within LanguageProvider");
  return ctx;
}

export function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
}

export function authError(message: string, t: Messages) {
  const lower = message.toLowerCase();
  if (lower.includes("email not confirmed")) return t.auth.emailNotConfirmed;
  if (lower.includes("invalid login credentials")) return t.auth.invalidCredentials;
  return message;
}

export function importIssue(message: string, t: Messages) {
  if (message === "SKU is required") return t.import.skuRequired;
  if (message === "Product name is required") return t.import.nameRequired;
  if (message === "Cost must be a valid number") return t.import.costNumber;
  if (message === "Cost cannot be negative") return t.import.costNegative;
  const missing = message.match(/^Missing currency → (.+)$/);
  if (missing) return fill(t.import.missingCurrency, { currency: missing[1] });
  return message;
}
