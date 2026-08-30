"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { extractBuyerEmail, extractFromRows, extractFromText, extractRfq, keepSourceTraces } from "@/lib/rfq/extract";
import { matchItems, rfqStatus } from "@/lib/rfq/match";
import { sha256Hex } from "@/lib/rfq/checksum";
import { fileToContent, sourceTypeFromName } from "@/lib/rfq/parse";
import { nextReference } from "@/lib/rfq/reference";
import type { CatalogProduct, ExtractedRfq } from "@/lib/rfq/types";
import type { Rfq } from "@/types/database";
import { useI18n } from "@/lib/i18n/provider";

export default function RfqWorkspace() {
  const { t } = useI18n();
  const router = useRouter();
  const [rfqs, setRfqs] = useState<Rfq[]>([]);
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});
  const [buyer, setBuyer] = useState("");
  const [paste, setPaste] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.from("rfqs").select("*").order("created_at", { ascending: false });
      const list = (data ?? []) as Rfq[];
      setRfqs(list);
      if (list.length) {
        const { data: items } = await supabase.from("rfq_items").select("rfq_id");
        const counts: Record<string, number> = {};
        (items ?? []).forEach((row: { rfq_id: string }) => { counts[row.rfq_id] = (counts[row.rfq_id] ?? 0) + 1; });
        setItemCounts(counts);
      }
    })();
  }, []);

  async function analyze() {
      setError("");
      setWarning("");
      setLoading(true);
    try {
      if (file && file.size > 10 * 1024 * 1024) throw new Error(t.rfqPage.tooBig);
      if (!file && !paste.trim()) throw new Error(t.rfqPage.noFile);
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error(t.rfqPage.session);
      const { data: member } = await supabase.from("company_members").select("company_id").eq("user_id", session.user.id).maybeSingle();
      if (!member) throw new Error(t.rfqPage.noCompany);

      let text = paste;
      let rows: Record<string, unknown>[] = [];
      let checksum: string | null = null;
      let duplicateId: string | null = null;
      let pageCount: number | null = null;
      let extractKind = "text";
      if (file) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        checksum = await sha256Hex(bytes);
        const parsed = await fileToContent(new File([bytes], file.name, { type: file.type }));
        text = [paste, parsed.text].filter(Boolean).join("\n");
        rows = parsed.rows;
        pageCount = parsed.pageCount;
        extractKind = parsed.extractKind;
        if (parsed.extractKind === "pdf-empty" || parsed.extractKind === "image") {
          if (!paste.trim()) throw new Error(parsed.extractKind === "image" ? t.rfqPage.noImageText : t.rfqPage.noPdfText);
        }
        if (parsed.extractKind === "invalid") throw new Error(t.rfqPage.invalidFile);
        const { data: twins } = await supabase.from("rfqs").select("id, reference").eq("source_checksum", checksum).limit(1);
        if (twins?.[0]) {
          duplicateId = twins[0].id;
          setWarning(`${t.rfqPage.duplicateHint} ${twins[0].reference}`);
        }
      }

      let extracted: ExtractedRfq = rows.length ? extractFromRows(rows) : extractFromText(text);
      try {
        const res = await fetch("/api/rfqs/extract", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ text, rows }),
        });
        if (res.ok) extracted = keepSourceTraces(await res.json(), extracted);
      } catch {
        extracted = await extractRfq({ text, rows });
      }
      if (!extracted.items.length) throw new Error(t.rfqPage.noItems);

      const { data: products } = await supabase.from("products").select("*").eq("active", true);
      const matched = matchItems(extracted.items, (products ?? []) as CatalogProduct[]);
      const { data: existing } = await supabase.from("rfqs").select("reference");
      const reference = nextReference((existing ?? []).map((r: { reference: string }) => r.reference));

      let documentId: string | null = null;
      if (file) {
        const path = `${member.company_id}/rfqs/${crypto.randomUUID()}/${file.name}`;
        const upload = await supabase.storage.from("company-documents").upload(path, file, { upsert: false });
        if (upload.error) throw new Error(t.rfqPage.uploadFail);
        const { data: doc, error: docError } = await supabase.from("documents").insert({
          company_id: member.company_id,
          storage_path: path,
          original_filename: file.name,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          document_type: "rfq",
          checksum,
          processing_status: extractKind === "pdf-empty" || extractKind === "image" ? "needs_text" : "extracted",
          page_count: pageCount,
          ocr_used: false,
        }).select("id").single();
        if (docError) throw new Error(t.rfqPage.uploadFail);
        documentId = doc.id;
      }

      const { data: rfq, error: rfqError } = await supabase.from("rfqs").insert({
        company_id: member.company_id,
        reference,
        buyer_name: buyer.trim() || extracted.buyer || file?.name || "RFQ",
        buyer_email: extracted.buyer_email || extractBuyerEmail(paste) || null,
        source_type: file ? sourceTypeFromName(file.name, file.type) : (paste.includes("@") ? "email" : "text"),
        source_filename: file?.name ?? null,
        document_id: documentId,
        status: rfqStatus(matched),
        source_checksum: checksum,
        possible_duplicate_of: duplicateId,
        extracted_header: extracted.header,
        extraction_status: extracted.extraction_status,
        created_by: session.user.id,
      }).select().single();
      if (rfqError || !rfq) throw new Error(rfqError?.message ?? t.rfqPage.fail);

      const { error: itemsError } = await supabase.from("rfq_items").insert(matched.map((item, i) => ({
        company_id: member.company_id,
        rfq_id: rfq.id,
        line_no: i + 1,
        requirement: item.requirement,
        quantity: item.quantity,
        unit: item.unit,
        specs: { material: item.material ?? "", size: item.size ?? "", model: item.model ?? "" },
        matched_product_id: item.matched_product_id,
        matched_sku: item.matched_sku,
        confidence: item.confidence,
        missing: item.missing,
        review_status: "pending",
        source_text: item.source_text ?? item.requirement,
        source_ref: item.source_ref ?? null,
        requested_sku: item.requested_sku ?? null,
        target_price: item.target_price ?? null,
        extract_confidence: item.extract_confidence ?? null,
      })));
      if (itemsError) throw new Error(itemsError.message);
      router.push(`/rfqs/${rfq.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.rfqPage.fail);
    }
    setLoading(false);
  }

  const statusLabel = (status: string) => t.rfqPage.status[status as keyof typeof t.rfqPage.status] ?? status;

  return (
    <div>
      <p className="label">{t.app.workspaceShort}</p>
      <h1 className="mt-2 text-2xl font-bold">{t.rfqPage.title}</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-500">{t.rfqPage.lead}</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold">{t.rfqPage.uploadTitle}</h2>
          <p className="mt-1 text-sm text-slate-500">{t.rfqPage.uploadBody}</p>
          {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          {warning && <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{warning}</div>}
          <div className="mt-5 space-y-4">
            <div><label className="label">{t.rfqPage.buyer}</label><input className="field" value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder={t.rfqPage.buyerPlaceholder} /></div>
            <div>
              <label className="label">{t.rfqPage.file}</label>
              <label className="mt-1 flex cursor-pointer flex-col items-center rounded-lg border border-dashed border-slate-300 p-6 text-center">
                <span className="text-sm font-semibold">{file ? file.name : t.rfqPage.choose}</span>
                <span className="mt-1 text-xs text-slate-500">{t.rfqPage.dropBody}</span>
                <input className="hidden" type="file" accept=".csv,.xls,.xlsx,.txt,.pdf,.eml,.png,.jpg,.jpeg,.webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
            </div>
            <div>
              <label className="label">{t.rfqPage.pasteLabel}</label>
              <textarea className="field" rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={t.rfqPage.pastePlaceholder} />
            </div>
            <button className="btn-primary" onClick={analyze} disabled={loading}>{loading ? t.rfqPage.analyzing : t.rfqPage.analyze}</button>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <p className="label">{t.rfqPage.capabilities}</p>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            {t.rfqPage.capabilityList.map((line) => <p key={line}>• {line}</p>)}
          </div>
          <Link href="/demo/rfqs" className="mt-6 inline-block text-sm font-semibold text-blue-600">{t.rfqPage.viewSamples}</Link>
        </div>
      </div>

      <div className="mt-10">
        <h2 className="text-lg font-bold">{t.rfqPage.recent}</h2>
        <p className="mt-1 text-sm text-slate-500">{t.rfqPage.listLead}</p>
        <div className="mt-4 overflow-x-auto border border-slate-200 bg-white">
          {rfqs.length === 0 ? (
            <div className="p-8 text-sm text-slate-500">{t.rfqPage.empty}</div>
          ) : (
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t.rfqPage.table.rfq}</th>
                  <th className="px-4 py-3">{t.rfqPage.table.buyer}</th>
                  <th className="px-4 py-3">{t.rfqPage.table.received}</th>
                  <th className="px-4 py-3">{t.rfqPage.table.items}</th>
                  <th className="px-4 py-3">{t.rfqPage.table.status}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">{rfqs.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-600">{r.reference}</td>
                  <td className="px-4 py-3 font-medium">{r.buyer_name || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">{itemCounts[r.id] ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      r.status === "needs_review" ? "bg-amber-500 text-white"
                        : r.status === "won" ? "bg-emerald-700 text-white"
                          : r.status === "lost" ? "bg-slate-500 text-white"
                            : r.status === "sent" ? "bg-green-600 text-white"
                              : r.status === "quoted" || r.status === "matched" ? "bg-blue-600 text-white"
                                : "bg-slate-700 text-white"
                    }`}>{statusLabel(r.status)}</span>
                  </td>
                  <td className="px-4 py-3"><Link href={`/rfqs/${r.id}`} className="text-sm font-semibold text-blue-600">{t.rfqPage.open}</Link></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
