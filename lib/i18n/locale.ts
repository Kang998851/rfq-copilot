export type Locale = "en" | "zh";

export const LOCALE_COOKIE = "rfq-locale";

export function detectLocale(cookie?: string | null, acceptLanguage?: string | null): Locale {
  if (cookie === "zh" || cookie === "en") return cookie;
  if (acceptLanguage?.toLowerCase().includes("zh")) return "zh";
  return "en";
}
