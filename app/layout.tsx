import "./globals.css";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { LanguageProvider } from "@/lib/i18n/provider";
import { detectLocale } from "@/lib/i18n/locale";

export const metadata: Metadata = {
  title: "RFQ Copilot — AI RFQ & Quotation Workspace for Industrial Exporters",
  description: "Process industrial RFQs faster. Extract requirements, match internal products, review specifications and prepare quotations from one workspace.",
  metadataBase: new URL("https://rfq-copilot.vercel.app"),
  openGraph: {
    title: "RFQ Copilot — AI RFQ & Quotation Workspace for Industrial Exporters",
    description: "Process industrial RFQs faster with a focused workflow for industrial exporters.",
    type: "website",
  },
  icons: { icon: "/favicon.svg" },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const locale = detectLocale(cookieStore.get("rfq-locale")?.value, headerStore.get("accept-language"));

  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"}>
      <body>
        <LanguageProvider initial={locale}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
