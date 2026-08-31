import { hexToRgb, jpegDimensions } from "./branding";
import { formatMoney, lineAmount, quoteTotal } from "./totals";

export type QuotePdfItem = {
  sku: string | null;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  lead_time_days: number | null;
  spec?: string | null;
};

export type QuotePdfInput = {
  title: string;
  companyName: string;
  contactLine: string;
  reference: string;
  quoteNumber?: string;
  date: string;
  validUntil?: string;
  currency: string;
  status: string;
  buyerName: string;
  buyerEmail: string;
  incoterm?: string | null;
  payment?: string | null;
  delivery?: string | null;
  items: QuotePdfItem[];
  notes: string;
  validity: string;
  disclaimer: string;
  footer?: string;
  terms?: string;
  accent?: string;
  logoJpeg?: Uint8Array | null;
  notProvided?: string;
  signature?: string;
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
  if (!value) return "";
  return `BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfEscape(value)}) Tj ET`;
}

function shown(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

function fitLogo(width: number, height: number, maxW: number, maxH: number) {
  const scale = Math.min(maxW / width, maxH / height);
  return { w: Math.max(8, width * scale), h: Math.max(8, height * scale) };
}

function chunkItems(items: QuotePdfItem[]): QuotePdfItem[][] {
  const first = 12;
  const rest = 18;
  if (items.length <= first) return [items];
  const pages = [items.slice(0, first)];
  for (let i = first; i < items.length; i += rest) pages.push(items.slice(i, i + rest));
  return pages;
}

function pageStream(input: QuotePdfInput, group: QuotePdfItem[], pageIndex: number, pageCount: number): string {
  const accent = hexToRgb(input.accent ?? "#26448c");
  const stroke = `${accent.r.toFixed(3)} ${accent.g.toFixed(3)} ${accent.b.toFixed(3)} RG`;
  const fill = `${accent.r.toFixed(3)} ${accent.g.toFixed(3)} ${accent.b.toFixed(3)} rg`;
  const fallback = input.notProvided ?? "Not provided";
  const quoteNo = input.quoteNumber || input.reference;
  const last = pageIndex === pageCount - 1;
  const logo = input.logoJpeg ? jpegDimensions(input.logoJpeg) : null;
  const commands: string[] = [`${stroke} 50 800 495 2 re S`];

  if (logo && pageIndex === 0) {
    const box = fitLogo(logo.width, logo.height, 90, 36);
    commands.push(`q ${box.w.toFixed(2)} 0 0 ${box.h.toFixed(2)} 50 ${(800 - box.h).toFixed(2)} cm /Im1 Do Q`);
    commands.push(text(150, 812, 18, input.title, "F2"));
    commands.push(text(150, 794, 12, input.companyName, "F2"));
    commands.push(text(150, 778, 9, input.contactLine));
  } else if (pageIndex === 0) {
    commands.push(text(50, 812, 18, input.title, "F2"));
    commands.push(text(50, 786, 14, input.companyName, "F2"));
    commands.push(text(50, 770, 9, input.contactLine));
  } else {
    commands.push(text(50, 812, 12, input.companyName, "F2"));
  }

  commands.push(
    text(360, 812, 10, quoteNo, "F2"),
    text(360, 796, 9, `RFQ: ${input.reference}`),
    text(360, 782, 9, input.date),
    text(360, 768, 9, input.validUntil ? `Valid until: ${input.validUntil}` : ""),
    text(360, 754, 9, `${input.currency} · ${input.status}${pageCount > 1 ? ` · ${pageIndex + 1}/${pageCount}` : ""}`),
  );

  let y = pageIndex === 0 ? 718 : 758;
  if (pageIndex === 0) {
    commands.push(
      text(50, y, 8, "TO"),
      text(50, y - 14, 11, input.buyerName, "F2"),
      text(50, y - 28, 9, input.buyerEmail),
      text(320, y, 8, "TERMS"),
      text(320, y - 14, 9, `Incoterm: ${shown(input.incoterm, fallback)}`),
      text(320, y - 28, 9, `Payment: ${shown(input.payment, fallback)}`),
      text(320, y - 42, 9, `Delivery: ${shown(input.delivery, fallback)}`),
    );
    y -= 68;
  }

  commands.push(
    text(50, y, 8, "SKU"),
    text(110, y, 8, "DESCRIPTION"),
    text(300, y, 8, "QTY"),
    text(348, y, 8, "UNIT"),
    text(428, y, 8, "AMOUNT"),
    text(500, y, 8, "LEAD"),
    `0.9 0.91 0.93 RG 50 ${y - 6} 495 0.6 re S`,
  );
  y -= 22;

  for (const item of group) {
    const qty = `${item.quantity ?? "—"} ${item.unit ?? ""}`.trim();
    commands.push(
      text(50, y, 9, item.sku ?? "—"),
      text(110, y, 9, item.name.slice(0, 32)),
      text(300, y, 9, qty),
      text(348, y, 9, formatMoney(item.unit_price, input.currency)),
      text(428, y, 9, formatMoney(lineAmount(item.quantity, item.unit_price), input.currency)),
      text(500, y, 8, item.lead_time_days != null ? `${item.lead_time_days}d` : "—"),
    );
    if (item.spec) {
      y -= 11;
      commands.push(text(110, y, 8, item.spec.slice(0, 72)));
    }
    y -= 22;
  }

  if (last) {
    commands.push(
      text(348, y - 2, 9, "TOTAL", "F2"),
      text(428, y - 2, 12, formatMoney(quoteTotal(input.items), input.currency), "F2"),
      `${fill} 50 120 210 0.7 re f`,
      text(50, 128, 8, input.signature ?? "Authorized signature / Date"),
      text(50, 90, 8, input.notes),
      text(50, 76, 8, input.validity),
      text(50, 62, 8, input.disclaimer),
      text(50, 48, 8, (input.terms ?? "").slice(0, 110)),
      text(50, 34, 8, (input.footer ?? "").slice(0, 110)),
    );
  }

  return commands.filter(Boolean).join("\n");
}

export function buildQuotePdf(input: QuotePdfInput): Uint8Array {
  const groups = chunkItems(input.items);
  const streams = groups.map((group, index) => pageStream(input, group, index, groups.length));
  return assemblePdf(streams, input.logoJpeg ?? null);
}

function assemblePdf(streams: string[], logoJpeg: Uint8Array | null): Uint8Array {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("latin1");
  const logo = logoJpeg ? jpegDimensions(logoJpeg) : null;
  const firstPage = logo ? 6 : 5;
  const pageIds = streams.map((_, i) => firstPage + i * 2);
  const contentIds = streams.map((_, i) => firstPage + i * 2 + 1);
  const xobject = logo ? `/XObject << /Im1 5 0 R >>` : "";
  const kids = pageIds.map((id) => `${id} 0 R`).join(" ");
  const numberedCount = 4 + (logo ? 1 : 0) + streams.length * 2;

  const objects: Uint8Array[] = [
    encoder.encode("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"),
    encoder.encode(`2 0 obj << /Type /Pages /Kids [ ${kids} ] /Count ${streams.length} >> endobj\n`),
    encoder.encode("3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n"),
    encoder.encode("4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj\n"),
  ];
  if (logo && logoJpeg) {
    objects.push(encoder.encode(`5 0 obj << /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoJpeg.length} >> stream\n`));
    objects.push(logoJpeg);
    objects.push(encoder.encode("\nendstream endobj\n"));
  }
  streams.forEach((stream, i) => {
    objects.push(encoder.encode(`${pageIds[i]} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentIds[i]} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> ${xobject} >> >> endobj\n`));
    objects.push(encoder.encode(`${contentIds[i]} 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj\n`));
  });

  const header = encoder.encode("%PDF-1.4\n");
  const starts: number[] = [];
  let offset = header.length;
  for (const chunk of objects) {
    const head = decoder.decode(chunk.slice(0, Math.min(24, chunk.length)));
    if (/^\d+ 0 obj/.test(head)) starts.push(offset);
    offset += chunk.length;
  }

  const xrefAt = offset;
  let xref = `xref\n0 ${numberedCount + 1}\n0000000000 65535 f \n`;
  for (const start of starts) xref += `${String(start).padStart(10, "0")} 00000 n \n`;
  xref += `trailer << /Size ${numberedCount + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  const tail = encoder.encode(xref);

  const out = new Uint8Array(header.length + objects.reduce((sum, chunk) => sum + chunk.length, 0) + tail.length);
  out.set(header, 0);
  let at = header.length;
  for (const chunk of objects) {
    out.set(chunk, at);
    at += chunk.length;
  }
  out.set(tail, at);
  return out;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
