import { requiredMissing } from "./missing";
import type { CatalogProduct, ExtractedItem, MatchCandidate, MatchedItem, MatchMemory } from "./types";

function norm(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").trim();
}

function tokens(value: string | null | undefined) {
  return norm(value).split(/\s+/).filter((t) => t.length > 1);
}

function includesAny(haystack: string, needles: string[]) {
  return needles.some((n) => haystack.includes(n));
}

function compactSize(value: string | null | undefined) {
  return norm(value).replace(/\s+/g, "").replace("dn", "dn");
}

export function explainScore(item: ExtractedItem, product: CatalogProduct, memory: MatchMemory[] = []) {
  const req = norm([item.requirement, item.model, item.material, item.size, item.category, item.requested_sku].filter(Boolean).join(" "));
  const sku = norm(product.sku);
  const model = norm(product.model);
  const requested = norm(item.requested_sku);
  const reasons: string[] = [];
  let score = 0;

  if (sku && (requested === sku || req.split(" ").includes(sku) || req.includes(sku))) {
    score += requested === sku || req.split(" ").includes(sku) ? 55 : 40;
    reasons.push("skuExact");
  }

  const mpn = norm(product.specifications?.mpn || product.specifications?.pn || product.specifications?.part_number);
  if (mpn && (requested === mpn || req.includes(mpn))) {
    score += 25;
    reasons.push("mpn");
  }

  if (model && (norm(item.model) === model || req.includes(model))) {
    score += 30;
    reasons.push("modelExact");
  }

  const nameBits = tokens(product.name);
  const overlap = nameBits.filter((bit) => req.includes(bit)).length;
  if (nameBits.length && overlap) {
    score += Math.round((overlap / nameBits.length) * 25);
    reasons.push("name");
  }

  if (item.category && product.category && norm(item.category) === norm(product.category)) {
    score += 8;
    reasons.push("category");
  } else if (product.category && req.includes(norm(product.category))) {
    score += 4;
    reasons.push("category");
  }

  if (item.material && product.material && norm(item.material) === norm(product.material)) {
    score += 12;
    reasons.push("material");
  } else if (product.material && req.includes(norm(product.material))) {
    score += 8;
    reasons.push("material");
  }

  const itemSize = compactSize(item.size) || compactSize(item.requirement.match(/dn\s*\d+|\d+\s*mm/i)?.[0]);
  const productSize = compactSize(product.size);
  if (itemSize && productSize && (itemSize === productSize || req.replace(/\s+/g, "").includes(productSize))) {
    score += item.size && product.size && norm(item.size) === norm(product.size) ? 12 : 8;
    reasons.push("size");
  } else if (product.size && req.includes(norm(product.size))) {
    score += 8;
    reasons.push("size");
  }

  const specValues = Object.values(product.specifications ?? {}).map((value) => norm(value)).filter((value) => value.length > 1);
  const specHits = specValues.filter((value) => req.includes(value)).length;
  if (specHits) {
    score += Math.min(15, specHits * 5);
    reasons.push("specs");
  }

  const reqTokens = tokens(item.requirement);
  const learned = memory.some((row) => {
    if (norm(row.sku) !== sku) return false;
    return tokens(row.requirement).filter((bit) => reqTokens.includes(bit)).length >= 2;
  });
  if (learned) {
    score += 10;
    reasons.push("history");
  }

  return { score: Math.min(99, score), reasons };
}

export function scoreProduct(item: ExtractedItem, product: CatalogProduct, memory: MatchMemory[] = []) {
  return explainScore(item, product, memory).score;
}

export function rankCandidates(item: ExtractedItem, products: CatalogProduct[], memory: MatchMemory[] = []): MatchCandidate[] {
  return products
    .filter((product) => product.active !== false)
    .map((product) => {
      const { score, reasons } = explainScore(item, product, memory);
      return {
        product_id: product.id,
        sku: product.sku,
        name: product.name,
        model: product.model,
        material: product.material,
        size: product.size,
        cost: product.cost,
        currency: product.currency,
        moq: product.moq,
        lead_time_days: product.lead_time_days,
        confidence: score,
        reasons,
      };
    })
    .filter((row) => row.confidence >= 12)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);
}

export function detectMissing(item: ExtractedItem, product: CatalogProduct | null) {
  const req = [item.requirement, item.model, item.material, item.size, item.category, item.requested_sku, item.certification].filter(Boolean).join(" ").toLowerCase();
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
  missing.push(...requiredMissing(item, product));
  return [...new Set(missing)];
}

export function matchItems(items: ExtractedItem[], products: CatalogProduct[], memory: MatchMemory[] = []): MatchedItem[] {
  const active = products.filter((p) => p.active !== false);
  return items.map((item) => {
    const candidates = rankCandidates(item, active, memory);
    const best = candidates[0];
    const confidence = best && best.confidence >= 20 ? best.confidence : 0;
    const product = confidence > 0 ? active.find((row) => row.id === best.product_id) ?? null : null;
    const missing = detectMissing(item, product);
    if (product && confidence < 80 && !missing.includes("Match confirmation")) missing.push("Match confirmation");
    return {
      ...item,
      matched_product_id: product?.id ?? null,
      matched_sku: product?.sku ?? null,
      confidence,
      missing,
      match_reasons: best?.reasons ?? [],
      candidates,
    };
  });
}

export function rfqStatus(items: MatchedItem[]) {
  if (!items.length) return "needs_review" as const;
  const needsReview = items.some((item) => item.confidence < 80 || item.missing.length > 0);
  return needsReview ? "needs_review" as const : "matched" as const;
}

export function candidatesFromSpecs(specs: Record<string, unknown> | null | undefined): MatchCandidate[] {
  const raw = specs?.match_candidates;
  return Array.isArray(raw) ? raw as MatchCandidate[] : [];
}
