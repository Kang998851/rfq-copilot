import { z } from "zod";
import type { ExtractedItem, ExtractedRfq } from "./types";

const qtyPattern = /(\d[\d,]*(?:\.\d+)?)\s*(pcs|pc|pieces|units?|sets?|kg|ton|件|台|套)?/i;

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
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
    items.push({
      requirement: text,
      quantity: Number.isFinite(qty as number) ? qty : null,
      unit: parsed.unit || map.unit || map["单位"] || null,
      material: map.material || map["材质"] || null,
      size: map.size || map["尺寸"] || map["规格"] || null,
      model: map.model || map["型号"] || null,
      category: map.category || map.type || map["品类"] || null,
    });
  }
  return { buyer: "", items };
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
    return {
      requirement: line,
      quantity: parsed.quantity,
      unit: parsed.unit,
      material: /(ss304|ss316|stainless|carbon steel|cast iron|brass|aluminum)/i.exec(line)?.[0] ?? null,
      size: /(dn\d+|\d+\s*mm|\d+\s*inch|\d+x\d+x[\d.]+)/i.exec(line)?.[0] ?? null,
      model: null,
      category: null,
    };
  }).filter((item) => item.requirement.length > 3);

  return { buyer, items: items.slice(0, 50) };
}

export const extractedSchema = z.object({
  buyer: z.string(),
  items: z.array(z.object({
    requirement: z.string().min(1),
    quantity: z.number().nullable(),
    unit: z.string().nullable(),
    material: z.string().nullable(),
    size: z.string().nullable(),
    model: z.string().nullable(),
    category: z.string().nullable(),
  })),
});

export async function extractWithAi(text: string): Promise<ExtractedRfq | null> {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) return null;
  try {
    const { generateText, Output } = await import("ai");
    const result = await generateText({
      model: "openai/gpt-5.4",
      output: Output.object({ schema: extractedSchema }),
      prompt: `Extract industrial RFQ line items from this customer request. Do not invent prices, SKUs, or commercial terms. If quantity is missing use null. Return buyer company name if present.\n\n${text.slice(0, 12000)}`,
    });
    const output = extractedSchema.safeParse(result.output);
    if (!output.success || !output.data.items.length) return null;
    return output.data;
  } catch {
    return null;
  }
}

export async function extractRfq(input: { text?: string; rows?: Record<string, unknown>[] }): Promise<ExtractedRfq> {
  const heuristic = input.rows?.length ? extractFromRows(input.rows) : extractFromText(input.text ?? "");
  const ai = input.text ? await extractWithAi(input.text) : null;
  if (!ai) return heuristic;
  return {
    buyer: ai.buyer || heuristic.buyer,
    items: ai.items.length ? ai.items : heuristic.items,
  };
}
