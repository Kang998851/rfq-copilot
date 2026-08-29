import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "RFQ Copilot — AI RFQ & Quotation Workspace for Industrial Exporters", description: "Process industrial RFQs faster. Extract requirements, match internal products, review specifications and prepare quotations from one workspace.", metadataBase: new URL("https://rfq-copilot.vercel.app"), openGraph: { title: "RFQ Copilot — AI RFQ & Quotation Workspace for Industrial Exporters", description: "Process industrial RFQs faster with a focused workspace for industrial exporters.", type: "website" }, icons: { icon: "/favicon.svg" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
