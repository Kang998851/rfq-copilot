import * as XLSX from "xlsx";
import type { SourceType } from "./types";

export function sourceTypeFromName(filename: string): SourceType {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "excel";
  if (lower.endsWith(".eml") || lower.endsWith(".txt")) return "email";
  return "text";
}

export async function fileToContent(file: File): Promise<{ text: string; rows: Record<string, unknown>[] }> {
  const name = file.name.toLowerCase();
  if (/\.(csv|xlsx|xls)$/.test(name)) {
    const data = await file.arrayBuffer();
    const workbook = name.endsWith(".csv") ? XLSX.read(await file.text(), { type: "string" }) : XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    const text = rows.map((row) => Object.values(row).join(" ")).join("\n");
    return { text, rows };
  }
  const text = await file.text();
  return { text: text.slice(0, 20000), rows: [] };
}
