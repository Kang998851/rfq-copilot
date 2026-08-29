"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { autoMapHeaders, IMPORT_FIELDS, ImportField } from "@/lib/import/normalize";
import { validateImportRow, ValidatedProduct } from "@/lib/import/validation";
import { fill, importIssue, useI18n } from "@/lib/i18n/provider";
import type { Messages } from "@/lib/i18n/messages";

type Row = Record<string, unknown>;
type Review = { valid: boolean; data: ValidatedProduct | null; errors: string[]; warnings: string[]; raw: Row };

function fieldLabel(t: Messages, key: ImportField) {
  return t.import.fields[key];
}

export default function ImportWizard() {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Record<string, ImportField | "ignore">>({});
  const [reviews, setReviews] = useState<Review[]>([]);
  const [currency] = useState("USD");
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const steps = t.import.steps;

  async function choose(f: File) {
    setError("");
    if (f.size > 10 * 1024 * 1024) return setError(t.import.tooBig);
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) return setError(t.import.badFormat);
    try {
      const data = await f.arrayBuffer();
      const workbook = f.name.toLowerCase().endsWith(".csv") ? XLSX.read(await f.text(), { type: "string" }) : XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const parsed = XLSX.utils.sheet_to_json<Row>(sheet, { defval: "" });
      if (!parsed.length) throw new Error(t.import.noHeader);
      const h = Object.keys(parsed[0]);
      setFile(f);
      setHeaders(h);
      setRows(parsed);
      setMapping(autoMapHeaders(h));
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.import.parseFail);
    }
  }

  function mappedRow(row: Row) {
    const result: Row = {};
    Object.entries(mapping).forEach(([header, field]) => {
      if (field !== "ignore") result[field] = row[header];
    });
    return result;
  }

  function review() {
    const checked = rows.map((raw) => {
      const r = validateImportRow(mappedRow(raw), currency);
      return { ...r, raw };
    });
    setReviews(checked);
    setStep(3);
  }

  async function importProducts() {
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t.import.session);
      const { data: member } = await supabase.from("company_members").select("company_id").eq("user_id", user.id).single();
      if (!member) throw new Error(t.import.noCompany);
      const path = `${member.company_id}/product-imports/${crypto.randomUUID()}/${file!.name}`;
      const upload = await supabase.storage.from("company-documents").upload(path, file!, { upsert: false });
      if (upload.error) throw new Error(t.import.uploadFail);
      const { data: imp, error: impError } = await supabase.from("product_imports").insert({
        company_id: member.company_id,
        filename: file!.name,
        status: "completed",
        total_rows: reviews.length,
        imported_rows: reviews.filter((r) => r.valid).length,
        failed_rows: reviews.filter((r) => !r.valid).length,
        mapping,
      }).select().single();
      if (impError) throw new Error(t.import.recordFail);
      const valid = reviews.filter((r): r is Review & { data: ValidatedProduct } => r.valid && r.data !== null);
      for (const r of valid) {
        const { error: upsertError } = await supabase.from("products").upsert({
          company_id: member.company_id,
          ...r.data,
          source_import_id: imp.id,
          active: true,
        }, { onConflict: "company_id,sku" });
        if (upsertError) throw new Error(t.import.someFail);
      }
      const { error: docError } = await supabase.from("documents").insert({
        company_id: member.company_id,
        storage_path: path,
        original_filename: file!.name,
        mime_type: file!.type || "application/octet-stream",
        size_bytes: file!.size,
        document_type: "product_catalog",
      });
      if (docError) throw new Error(t.import.docFail);
      setImportedCount(valid.length);
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.import.genericFail);
    }
    setLoading(false);
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <Link href="/products" className="text-sm text-blue-600">← {t.import.back}</Link>
        <h1 className="mt-3 text-2xl font-bold">{t.import.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{t.import.lead}</p>
      </div>
      <div className="mb-6 flex items-center gap-2 text-xs font-semibold text-slate-500">
        {steps.map((s, i) => <span key={s} className={step === i + 1 ? "text-blue-600" : ""}>{i + 1}. {s}{i < 3 && "  /"}</span>)}
      </div>
      {error && <div className="mb-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {step === 1 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="font-semibold">{t.import.dropTitle}</p>
          <p className="mt-2 text-sm text-slate-500">{t.import.dropBody}</p>
          <label className="btn-primary mt-6 cursor-pointer">{t.import.choose}<input className="hidden" type="file" accept=".csv,.xls,.xlsx" onChange={(e) => e.target.files?.[0] && choose(e.target.files[0])} /></label>
        </div>
      )}
      {step === 2 && (
        <div className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="font-semibold">{t.import.mapTitle}</h2>
            <p className="mt-1 text-sm text-slate-500">{t.import.mapLead}</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">{headers.map((h) => (
              <div key={h}>
                <label className="label">{h}</label>
                <select className="field" value={mapping[h]} onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value as ImportField | "ignore" }))}>
                  <option value="ignore">{t.import.ignore}</option>
                  {IMPORT_FIELDS.map((f) => <option key={f.key} value={f.key}>{fieldLabel(t, f.key)}{f.required ? " *" : ""}</option>)}
                </select>
              </div>
            ))}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="font-semibold">{t.import.preview}</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead><tr>{headers.map((h) => <th key={h} className="border-b px-3 py-2 text-slate-500">{h}</th>)}</tr></thead>
                <tbody>{rows.slice(0, 20).map((r, i) => <tr key={i}>{headers.map((h) => <td key={h} className="border-b px-3 py-2">{String(r[h])}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </div>
          <button className="btn-primary" onClick={review}>{t.import.review}</button>
        </div>
      )}
      {step === 3 && (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <Summary label={t.import.valid} value={reviews.filter((r) => r.valid).length} tone="green" />
            <Summary label={t.import.invalid} value={reviews.filter((r) => !r.valid).length} tone="red" />
            <Summary label={t.import.warnings} value={reviews.reduce((n, r) => n + r.warnings.length, 0)} tone="amber" />
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{t.import.details}</h2>
              <span className="text-sm text-slate-500">{fill(t.import.readyCount, { n: reviews.filter((r) => r.valid).length })}</span>
            </div>
            <div className="mt-4 max-h-80 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-slate-500">
                    <th className="px-3 py-2">{t.import.row}</th>
                    <th className="px-3 py-2">{t.import.sku}</th>
                    <th className="px-3 py-2">{t.import.status}</th>
                    <th className="px-3 py-2">{t.import.details}</th>
                  </tr>
                </thead>
                <tbody>{reviews.map((r, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-3 py-2">{i + 2}</td>
                    <td className="px-3 py-2">{String(mappedRow(r.raw).sku || "—")}</td>
                    <td className="px-3 py-2">{r.valid ? <span className="text-green-700">{t.import.validLabel}</span> : <span className="text-red-700">{t.import.invalidLabel}</span>}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{[...r.errors, ...r.warnings].map((m) => importIssue(m, t)).join(" · ") || t.import.ready}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
          <div className="flex gap-3">
            <button className="btn-secondary" onClick={() => setStep(2)}>{t.import.backBtn}</button>
            <button className="btn-primary" onClick={importProducts} disabled={loading || reviews.every((r) => !r.valid)}>{loading ? t.import.importing : t.import.confirm}</button>
          </div>
        </div>
      )}
      {step === 4 && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-8">
          <h2 className="text-lg font-bold text-green-800">{t.import.complete}</h2>
          <p className="mt-2 text-sm text-green-700">{fill(t.import.imported, { n: importedCount })}</p>
          <Link href="/products" className="btn-primary mt-6">{t.import.viewLibrary}</Link>
        </div>
      )}
    </div>
  );
}

function Summary({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className={`rounded-lg border bg-white p-5 ${tone === "green" ? "border-green-200" : tone === "red" ? "border-red-200" : "border-amber-200"}`}><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>;
}
