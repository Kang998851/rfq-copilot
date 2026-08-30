import * as XLSX from "xlsx";
import { extractPdfText } from "./pdf-text";
import type { SourceType } from "./types";

export type ParsedRfqFile = {
  text: string;
  rows: Record<string, unknown>[];
  sourceType: SourceType;
  pageCount: number | null;
  extractKind: "rows" | "text" | "pdf-text" | "pdf-empty" | "image" | "invalid";
};

export function sourceTypeFromName(filename: string, mime = ""): SourceType {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf") || mime === "application/pdf") return "pdf";
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "excel";
  if (/\.(png|jpe?g|webp|gif|tif{1,2})$/.test(lower) || mime.startsWith("image/")) return "image";
  if (lower.endsWith(".eml") || lower.endsWith(".txt")) return "email";
  return "text";
}

export async function fileToContent(file: File): Promise<ParsedRfqFile> {
  const name = file.name.toLowerCase();
  const mime = file.type || "";
  const sourceType = sourceTypeFromName(file.name, mime);

  if (sourceType === "image") {
    return { text: "", rows: [], sourceType, pageCount: null, extractKind: "image" };
  }

  if (sourceType === "pdf") {
    const pdf = extractPdfText(new Uint8Array(await file.arrayBuffer()));
    if (pdf.kind === "invalid") return { text: "", rows: [], sourceType, pageCount: 0, extractKind: "invalid" };
    return {
      text: pdf.text,
      rows: [],
      sourceType,
      pageCount: pdf.pageCount,
      extractKind: pdf.text ? "pdf-text" : "pdf-empty",
    };
  }

  if (/\.(csv|xlsx|xls)$/.test(name)) {
    const data = await file.arrayBuffer();
    const workbook = name.endsWith(".csv") ? XLSX.read(await file.text(), { type: "string" }) : XLSX.read(data);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    const text = rows.map((row) => Object.values(row).join(" ")).join("\n");
    return { text, rows, sourceType, pageCount: null, extractKind: "rows" };
  }

  const text = await file.text();
  return { text: text.slice(0, 20000), rows: [], sourceType, pageCount: null, extractKind: "text" };
}
