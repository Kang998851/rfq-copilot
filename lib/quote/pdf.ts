import { formatMoney, lineAmount, quoteTotal } from "./totals";

export type QuotePdfItem = {
  sku: string | null;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  lead_time_days: number | null;
};

export type QuotePdfInput = {
  title: string;
  companyName: string;
  contactLine: string;
  reference: string;
  date: string;
  currency: string;
  status: string;
  buyerName: string;
  buyerEmail: string;
  items: QuotePdfItem[];
  notes: string;
  validity: string;
  disclaimer: string;
};

function pdfEscape(value: string): string {
  return latin1(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function latin1(value: string): string {
  return Array.from(value).map((char) => {
    const code = char.charCodeAt(0);
    return code <= 255 ? char : "?";
  }).join("");
}

function text(x: number, y: number, size: number, value: string, font = "F1"): string {
  return `BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfEscape(value)}) Tj ET`;
}

export function buildQuotePdf(input: QuotePdfInput): Uint8Array {
  const commands: string[] = [
    "0.15 0.27 0.55 RG 50 800 495 2 re S",
    text(50, 812, 18, input.title, "F2"),
    text(50, 786, 14, input.companyName, "F2"),
    text(50, 770, 9, input.contactLine),
    text(360, 812, 10, input.reference, "F2"),
    text(360, 796, 9, input.date),
    text(360, 782, 9, `${input.currency} · ${input.status}`),
    text(50, 740, 8, "TO"),
    text(50, 726, 11, input.buyerName, "F2"),
    text(50, 712, 9, input.buyerEmail),
    text(50, 684, 8, "SKU"),
    text(120, 684, 8, "PRODUCT"),
    text(320, 684, 8, "QTY"),
    text(380, 684, 8, "UNIT"),
    text(450, 684, 8, "AMOUNT"),
    "0.9 0.91 0.93 RG 50 678 495 0.6 re S",
  ];

  let y = 660;
  input.items.forEach((item) => {
    if (y < 120) return;
    const qty = `${item.quantity ?? "—"} ${item.unit ?? ""}`.trim();
    commands.push(
      text(50, y, 9, item.sku ?? "—"),
      text(120, y, 9, item.name.slice(0, 36)),
      text(320, y, 9, qty),
      text(380, y, 9, formatMoney(item.unit_price, input.currency)),
      text(450, y, 9, formatMoney(lineAmount(item.quantity, item.unit_price), input.currency)),
    );
    if (item.lead_time_days != null) commands.push(text(120, y - 12, 8, `Lead time: ${item.lead_time_days} days`));
    y -= 28;
  });

  commands.push(
    text(380, y - 8, 9, "TOTAL", "F2"),
    text(450, y - 8, 12, formatMoney(quoteTotal(input.items), input.currency), "F2"),
    text(50, 90, 8, input.notes),
    text(50, 74, 8, input.validity),
    text(50, 58, 8, input.disclaimer),
  );

  const stream = commands.join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >> endobj",
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    "6 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj",
  ];

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(body.length);
    body += `${object}\n`;
  }
  const startxref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF`;
  return new TextEncoder().encode(body);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
