import type { CatalogProduct, ExtractedItem, MatchedItem } from "./types";

function norm(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").trim();
}

function tokens(value: string | null | undefined) {
  return norm(value).split(/\s+/).filter((t) => t.length > 1);
}

function includesAny(haystack: string, needles: string[]) {
  return needles.some((n) => haystack.includes(n));
}

export function scoreProduct(item: ExtractedItem, product: CatalogProduct) {
  const req = norm([item.requirement, item.model, item.material, item.size, item.category].filter(Boolean).join(" "));
  const sku = norm(product.sku);
  const model = norm(product.model);
  const name = norm(product.name);
  let score = 0;

  if (sku && req.includes(sku)) score += 55;
  if (model && (req.includes(model) || norm(item.model) === model)) score += 30;
  const nameBits = tokens(product.name);
  const overlap = nameBits.filter((bit) => req.includes(bit)).length;
  if (nameBits.length) score += Math.round((overlap / nameBits.length) * 25);
  if (item.material && product.material && norm(item.material) === norm(product.material)) score += 12;
  else if (product.material && req.includes(norm(product.material))) score += 8;
  if (item.size && product.size && norm(item.size) === norm(product.size)) score += 12;
  else if (product.size && req.includes(norm(product.size))) score += 8;
  if (item.category && product.category && norm(item.category) === norm(product.category)) score += 8;
  else if (product.category && req.includes(norm(product.category))) score += 4;
  return Math.min(99, score);
}

export function detectMissing(item: ExtractedItem, product: CatalogProduct | null) {
  const req = `${item.requirement} ${Object.values(item).join(" ")}`.toLowerCase();
  const specText = product ? `${JSON.stringify(product.specifications)} ${product.material} ${product.size}`.toLowerCase() : "";
  const missing: string[] = [];
  const checks: [string[], string][] = [
    [["certificate", "iso", "ce ", "certification", "证书"], "Certificate Requirement"],
    [["voltage", "v ac", "380v", "220v", "电压"], "Voltage"],
    [["packaging", "packing", "carton", "wooden case", "包装"], "Packaging Requirement"],
    [["pressure", "pn16", "pn25", "压力"], "Pressure Rating"],
    [["connection", "flange", "thread", "连接"], "Connection Type"],
  ];
  for (const [needles, label] of checks) {
    if (includesAny(req, needles) && !includesAny(specText, needles)) missing.push(label);
  }
  if (/\b(eur|usd|gbp|cny|rmb)\b/.test(req) && product?.currency) {
    const mentioned = req.match(/\b(eur|usd|gbp|cny|rmb)\b/);
    if (mentioned && mentioned[1].toUpperCase().replace("RMB", "CNY") !== product.currency.toUpperCase()) {
      missing.push("Currency");
    }
  }
  if (!product) missing.push("Product Match");
  return [...new Set(missing)];
}

export function matchItems(items: ExtractedItem[], products: CatalogProduct[]): MatchedItem[] {
  const active = products.filter((p) => p.active !== false);
  return items.map((item) => {
    let best: CatalogProduct | null = null;
    let bestScore = 0;
    for (const product of active) {
      const score = scoreProduct(item, product);
      if (score > bestScore) {
        best = product;
        bestScore = score;
      }
    }
    const confidence = bestScore >= 20 ? bestScore : 0;
    const product = confidence > 0 ? best : null;
    const missing = detectMissing(item, product);
    if (product && confidence < 80 && !missing.includes("Match confirmation")) missing.push("Match confirmation");
    return {
      ...item,
      matched_product_id: product?.id ?? null,
      matched_sku: product?.sku ?? null,
      confidence,
      missing,
    };
  });
}

export function rfqStatus(items: MatchedItem[]) {
  if (!items.length) return "needs_review" as const;
  const needsReview = items.some((item) => item.confidence < 80 || item.missing.length > 0);
  return needsReview ? "needs_review" as const : "matched" as const;
}
