import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { autoMapHeaders, normalizeHeader } from "@/lib/import/normalize";
import { validateImportRow } from "@/lib/import/validation";
describe("import logic", () => {
  it("normalizes spreadsheet headers", () => expect(normalizeHeader("  Item-No_  ")).toBe("item no"));
  it("auto maps common columns", () => expect(autoMapHeaders(["Item No.", "Product", "Price", "Min Qty", "Delivery", "材质"])["Item No."]).toBe("sku"));
  it("validates required and numeric fields", () => { expect(validateImportRow({ sku: "A-1", name: "Valve", cost: "12.5", moq: "2" }, "USD").valid).toBe(true); expect(validateImportRow({ sku: "", name: "Valve", cost: "bad" }, "USD").valid).toBe(false); });
  it("falls back to company currency", () => expect(validateImportRow({ sku: "A-1", name: "Valve", cost: 1 }, "EUR").data?.currency).toBe("EUR"));
  it("parses CSV, XLSX and XLS workbooks", () => {
    const rows = [{ sku: "A-1", name: "Valve", cost: 2 }];
    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Products");
    const csv = XLSX.write(workbook, { type: "string", bookType: "csv" });
    const xlsx = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const xls = XLSX.write(workbook, { type: "buffer", bookType: "biff8" });
    const csvBook = XLSX.read(csv, { type: "string" });
    const xlsxBook = XLSX.read(xlsx, { type: "buffer" });
    const xlsBook = XLSX.read(xls, { type: "buffer" });
    expect(XLSX.utils.sheet_to_json(csvBook.Sheets[csvBook.SheetNames[0]])).toHaveLength(1);
    expect(XLSX.utils.sheet_to_json(xlsxBook.Sheets[xlsxBook.SheetNames[0]])).toHaveLength(1);
    expect(XLSX.utils.sheet_to_json(xlsBook.Sheets[xlsBook.SheetNames[0]])).toHaveLength(1);
  });
});
