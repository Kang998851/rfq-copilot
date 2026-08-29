"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Company } from "@/types/database";

export default function Dashboard() {
  const [company, setCompany] = useState<Company | null>(null);
  const [productCount, setProductCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return void (window.location.href = "/login");
      const { data: member } = await supabase.from("company_members").select("company_id").eq("user_id", user.id).maybeSingle();
      if (!member) return void (window.location.href = "/onboarding");
      const [{ data: companyData }, { count }] = await Promise.all([
        supabase.from("companies").select("*").eq("id", member.company_id).single(),
        supabase.from("products").select("id", { count: "exact", head: true }),
      ]);
      setCompany(companyData);
      setProductCount(count ?? 0);
    })();
  }, []);

  return <div>
    <div className="mb-8"><p className="label">Workspace overview</p><h1 className="mt-2 text-2xl font-bold">{company?.name ?? "Your workspace"}</h1><p className="mt-1 text-sm text-slate-500">Keep your product data ready for every RFQ.</p></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="RFQs this month" value="0" note="Coming in Phase 2" />
      <Stat label="Products" value={productCount} note="In your catalog" />
      <Stat label="Pending review" value="0" note="Coming in Phase 2" />
      <Stat label="Quotes prepared" value="0" note="Coming in Phase 2" />
    </div>
    <div className="mt-8 grid gap-4 md:grid-cols-3">
      <Action href="/products/import" title="Import Products" body="Upload and map your catalog." />
      <Action href="/products" title="View Product Library" body="Search and maintain your SKUs." />
      <Link href="/rfqs" className="rounded-lg border border-dashed border-slate-300 bg-white p-5 hover:border-blue-300"><p className="font-semibold">New RFQ</p><p className="mt-1 text-sm text-slate-500">Open the RFQ workspace preview.</p></Link>
    </div>
  </div>;
}

function Stat({ label, value, note }: { label: string; value: string | number; note: string }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-3xl font-bold">{value}</p><p className="mt-2 text-xs text-slate-400">{note}</p></div>;
}

function Action({ href, title, body }: { href: string; title: string; body: string }) {
  return <Link href={href} className="rounded-lg border border-slate-200 bg-white p-5 hover:border-blue-300"><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-slate-500">{body}</p></Link>;
}
