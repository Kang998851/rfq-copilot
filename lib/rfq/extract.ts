import { z } from "zod";
import { asField, emptyHeader, extractHeader, mergeHeader, parseTargetPrice } from "./header";
import type { ExtractedHeader, ExtractedItem, ExtractedRfq, ExtractionStatus } from "./types";

const qtyPattern = /(\d[\d,]*(?:\.\d+)?)\s*(pcs|pc|pieces|units?|sets?|kg|ton|件|台|套)?/i;

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function extractBuyerEmail(text: string): string {
  const angled = /<([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>/i.exec(text);
  if (angled) return angled[1];
  const match = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  return match?.[0] ?? "";
}

function parseQty(value: string): { quantity: number | null; unit: string | null } {
  const match = value.match(qtyPattern);
  if (!match) return { quantity: null, unit: null };
  const quantity = Number(match[1].replace(/,/g, ""));
  return { quantity: Number.isFinite(quantity) ? quantity : null, unit: match[2] ?? null };
}

export function extractFromRows(rows: Record<string, unknown>[]): ExtractedRfq {
  const items: ExtractedItem[] = [];
  for (const row of rows) {
    const map: Record<string, string> = {};
    Object.entries(row).forEach(([key, value]) => {
      map[key.trim().toLowerCase().replace(/[._-]+/g, " ")] = clean(value);
    });
    const requirement = map.product || map.name || map.item || map.description || map["product name"] || map["item name"] || map["产品"] || map["品名"] || map["规格"] || "";
    const extra = [map.model, map.material, map.size, map.spec, map.specification, map["规格"], map["材质"], map["型号"]].filter(Boolean);
    const qtySource = map.qty || map.quantity || map["数量"] || map.amount || "";
    const parsed = parseQty(qtySource || extra.join(" "));
    const text = [requirement, ...extra].filter(Boolean).join(" · ");
    if (!text) continue;
    const qty = parsed.quantity ?? (qtySource ? Number(String(qtySource).replace(/,/g, "")) : null);
    const target = parseTargetPrice([map["target price"], map.budget, map.offer, text].filter(Boolean).join(" "));
    items.push({
      requirement: text,
      quantity: Number.isFinite(qty as number) ? qty : null,
      unit: parsed.unit || map.unit || map["单位"] || null,
      material: map.material || map["材质"] || null,
      size: map.size || map["尺寸"] || map["规格"] || null,
      model: map.model || map["型号"] || null,
      category: map.category || map.type || map["品类"] || null,
      source_text: text,
      source_ref: `row ${items.length + 2}`,
      requested_sku: map.sku || map["requested sku"] || map["型号"] || null,
      target_price: target,
      extract_confidence: qty ? 0.8 : 0.55,
    });
  }
  const fields = rows.map((row) => Object.entries(row).reduce<Record<string, string>>((acc, [key, value]) => {
    acc[key.trim().toLowerCase().replace(/[._-]+/g, " ")] = clean(value);
    return acc;
  }, {}));
  const email = fields.map((values) => values.email || values["buyer email"] || values["e mail"] || values["邮箱"] || "").find(Boolean) ?? "";
  const buyer = fields.map((values) => values.customer || values.buyer || values.company || values["客户"] || "").find(Boolean) ?? "";
  const blob = rows.map((row) => Object.values(row).join(" ")).join("\n");
  return { buyer, buyer_email: email, header: extractHeader(blob), extraction_status: "heuristic", items };
}

export function extractFromText(text: string): ExtractedRfq {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let buyer = "";
  const buyerLine = lines.find((line) => /^(from|buyer|customer|company|客户|买家)[:：]/i.test(line));
  if (buyerLine) buyer = buyerLine.replace(/^(from|buyer|customer|company|客户|买家)[:：]\s*/i, "");
  else {
    const named = lines.find((line) => /(gmbh|ltd|co\.|inc\.|llc|limited|公司|工业)/i.test(line) && line.length < 80);
    if (named) buyer = named.replace(/^(re:|subject:)\s*/i, "");
  }

  const itemLines = lines.filter((line) => {
    if (buyer && line === buyer) return false;
    if (/^(from|buyer|customer|subject|date|dear|regards)/i.test(line)) return false;
    return qtyPattern.test(line) || /valve|bearing|pump|motor|bolt|nut|fitting|dn\d|mm\b|阀门|轴承|泵|电机/i.test(line);
  });

  const source = itemLines.length ? itemLines : lines.slice(0, 12);
  const items: ExtractedItem[] = source.map((line) => {
    const parsed = parseQty(line);
    const lineNo = lines.indexOf(line) + 1;
    return {
      requirement: line,
      quantity: parsed.quantity,
      unit: parsed.unit,
      material: /(ss304|ss316|stainless|carbon steel|cast iron|brass|aluminum)/i.exec(line)?.[0] ?? null,
      size: /(dn\d+|\d+\s*mm|\d+\s*inch|\d+x\d+x[\d.]+)/i.exec(line)?.[0] ?? null,
      model: null,
      category: null,
      source_text: line,
      source_ref: lineNo > 0 ? `line ${lineNo}` : null,
      requested_sku: /(?:sku|mpn|pn)[:\s]+([A-Z0-9._-]{3,})/i.exec(line)?.[1] ?? null,
      target_price: parseTargetPrice(line),
      extract_confidence: parsed.quantity ? 0.7 : 0.5,
    };
  }).filter((item) => item.requirement.length > 3);

  return { buyer, buyer_email: extractBuyerEmail(text), header: extractHeader(text), extraction_status: "heuristic", items: items.slice(0, 50) };
}

const fieldSchema = z.union([
  z.string(),
  z.object({
    value: z.string().nullable().optional(),
    confidence: z.number().min(0).max(1).optional(),
    source: z.string().nullable().optional(),
  }),
]).nullable().optional();

export const extractedSchema = z.object({
  buyer: z.string(),
  buyer_email: z.string().optional().nullable(),
  header: z.object({
    phone: fieldSchema,
    rfq_number: fieldSchema,
    request_date: fieldSchema,
    currency: fieldSchema,
    incoterm: fieldSchema,
    delivery_location: fieldSchema,
    deadline: fieldSchema,
    payment_terms: fieldSchema,
    certification: fieldSchema,
    notes: fieldSchema,
  }).optional(),
  items: z.array(z.object({
    requirement: z.string().min(1),
    quantity: z.number().nullable(),
    unit: z.string().nullable(),
    material: z.string().nullable(),
    size: z.string().nullable(),
    model: z.string().nullable(),
    category: z.string().nullable(),
    source_text: z.string().nullable().optional(),
    source_ref: z.string().nullable().optional(),
    requested_sku: z.string().nullable().optional(),
    target_price: z.number().nullable().optional(),
    requested_delivery: z.string().nullable().optional(),
    certification: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    extract_confidence: z.number().min(0).max(1).optional().nullable(),
  })),
});

export function parseExtracted(data: unknown) {
  return extractedSchema.safeParse(data);
}

function headerFromUnknown(header: z.infer<typeof extractedSchema>["header"] | undefined): ExtractedHeader {
  const keys: (keyof ExtractedHeader)[] = ["phone", "rfq_number", "request_date", "currency", "incoterm", "delivery_location", "deadline", "payment_terms", "certification", "notes"];
  const next = emptyHeader();
  keys.forEach((key) => { next[key] = asField(header?.[key]); });
  return next;
}

export function toExtracted(data: z.infer<typeof extractedSchema>, status: ExtractionStatus): ExtractedRfq {
  return {
    buyer: data.buyer,
    buyer_email: data.buyer_email ?? undefined,
    header: headerFromUnknown(data.header),
    extraction_status: status,
    items: data.items.map((item) => ({
      ...item,
      requested_sku: item.requested_sku ?? null,
      target_price: item.target_price ?? null,
      extract_confidence: item.extract_confidence ?? null,
    })),
  };
}

const extractPrompt = `Extract an industrial RFQ as structured JSON.
Do not invent prices, SKUs, quantities, currency, incoterms, payment terms, or certifications.
If a field is not stated, use null. target_price is only a customer-stated target or budget, never a selling price.
Each header field may be a string or { value, confidence 0-1, source }.
Return buyer company name and buyer email if present.

`;

async function requestAiExtract(text: string, extra = "") {
  const { generateText, Output } = await import("ai");
  const result = await generateText({
    model: "openai/gpt-5.4",
    output: Output.object({ schema: extractedSchema }),
    prompt: `${extractPrompt}${extra}${text.slice(0, 12000)}`,
  });
  return parseExtracted(result.output);
}

export async function extractWithAi(text: string): Promise<ExtractedRfq | "failed" | null> {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) return null;
  try {
    let parsed = await requestAiExtract(text);
    if (!parsed.success || !parsed.data.items.length) {
      parsed = await requestAiExtract(text, `The previous JSON failed validation. Repair it to match the schema. Do not invent fields.\n\n`);
    }
    if (!parsed.success || !parsed.data.items.length) return "failed";
    return toExtracted(parsed.data, "ai");
  } catch {
    return "failed";
  }
}

export function keepSourceTraces(primary: ExtractedRfq, fallback: ExtractedRfq): ExtractedRfq {
  return {
    buyer: primary.buyer || fallback.buyer,
    buyer_email: primary.buyer_email || fallback.buyer_email || "",
    header: mergeHeader(primary.header, fallback.header ?? emptyHeader()),
    extraction_status: primary.extraction_status,
    items: (primary.items.length ? primary.items : fallback.items).map((item, i) => ({
      ...item,
      source_text: item.source_text || fallback.items[i]?.source_text || item.requirement,
      source_ref: item.source_ref || fallback.items[i]?.source_ref || null,
      requested_sku: item.requested_sku ?? fallback.items[i]?.requested_sku ?? null,
      target_price: item.target_price ?? fallback.items[i]?.target_price ?? null,
      extract_confidence: item.extract_confidence ?? fallback.items[i]?.extract_confidence ?? null,
    })),
  };
}

export async function extractRfq(input: { text?: string; rows?: Record<string, unknown>[] }): Promise<ExtractedRfq> {
  const heuristic = input.rows?.length ? extractFromRows(input.rows) : extractFromText(input.text ?? "");
  const ai = input.text ? await extractWithAi(input.text) : null;
  if (!ai) return heuristic;
  if (ai === "failed") return { ...heuristic, extraction_status: "failed" };
  return keepSourceTraces(ai, heuristic);
}
