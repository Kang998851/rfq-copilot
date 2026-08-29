"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, Upload, Settings, LogOut, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import LanguageSwitch from "@/components/LanguageSwitch";
import { useI18n } from "@/lib/i18n/provider";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { t } = useI18n();
  const links = [
    { href: "/dashboard", label: t.app.overview, icon: LayoutDashboard },
    { href: "/rfqs", label: t.app.rfqs, icon: FileText },
    { href: "/products", label: t.app.products, icon: Package },
    { href: "/products/import", label: t.app.imports, icon: Upload },
    { href: "/settings", label: t.app.settings, icon: Settings },
  ];
  const logout = () => createClient().auth.signOut().then(() => { window.location.href = "/login"; });

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white p-4 md:flex md:flex-col">
        <Link href="/dashboard" className="mb-8 block px-3 text-lg font-bold tracking-tight">RFQ <span className="text-blue-600">Copilot</span></Link>
        <nav className="space-y-1">{links.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${path === href || (href === "/rfqs" && path.startsWith("/rfqs/")) || (href === "/products" && path.startsWith("/products/") && !path.startsWith("/products/import")) ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}>
            <Icon size={17} />{label}
          </Link>
        ))}</nav>
        <div className="mt-auto border-t border-slate-100 pt-4">
          <p className="px-3 text-xs text-slate-400">{t.app.workspace}</p>
          <button onClick={logout} className="mt-2 flex items-center gap-3 px-3 py-2 text-sm text-slate-500"><LogOut size={17} />{t.app.logout}</button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
          <span className="text-sm font-semibold md:hidden">RFQ Copilot</span>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-slate-400 sm:inline">{t.app.workspaceShort}</span>
            <LanguageSwitch />
            <button onClick={logout} className="text-xs font-semibold text-slate-500 md:hidden">{t.app.logout}</button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-6">{children}</main>
      </div>
    </div>
  );
}
