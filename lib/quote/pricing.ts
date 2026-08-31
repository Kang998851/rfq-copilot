export type PricingMethod = "margin" | "markup";
export type PriceRule = "manual" | "product" | "category" | "company" | "cost";

export type PricingRules = {
  method: PricingMethod;
  default_margin: number;
  default_markup: number;
  minimum_margin: number;
  category_margins: Record<string, number>;
};

export type LinePricing = {
  cost: number | null;
  cost_currency: string | null;
  moq: number | null;
  method: PricingMethod | "manual" | "cost";
  rule: PriceRule;
  suggested: number | null;
  fx_blocked: boolean;
  human?: string;
};

export const PRICING_STORAGE_KEY = "rfq-copilot-pricing";
export const CATEGORY_MARGIN_KEYS = ["Valve", "Pump", "Bearing", "Motor", "Fastener", "Fitting"] as const;

export function defaultPricingRules(): PricingRules {
  return {
    method: "margin",
    default_margin: 0,
    default_markup: 0,
    minimum_margin: 0,
    category_margins: {},
  };
}

function asRate(value: unknown, max = 0.99): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  const rate = n >= 1 ? n / 100 : n;
  return Math.min(rate, max);
}

export function parsePricingRules(raw: unknown): PricingRules {
  const base = defaultPricingRules();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const row = raw as Record<string, unknown>;
  const category_margins: Record<string, number> = {};
  if (row.category_margins && typeof row.category_margins === "object" && !Array.isArray(row.category_margins)) {
    for (const [key, value] of Object.entries(row.category_margins as Record<string, unknown>)) {
      const rate = asRate(value);
      if (rate != null) category_margins[key] = rate;
    }
  }
  return {
    method: row.method === "markup" ? "markup" : "margin",
    default_margin: asRate(row.default_margin) ?? 0,
    default_markup: asRate(row.default_markup, 10) ?? 0,
    minimum_margin: asRate(row.minimum_margin) ?? 0,
    category_margins,
  };
}

export function toCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function saleFromMargin(cost: number, margin: number): number | null {
  if (!Number.isFinite(cost) || cost < 0) return null;
  if (!Number.isFinite(margin) || margin < 0 || margin >= 1) return null;
  return fromCents(Math.round(toCents(cost) / (1 - margin)));
}

export function saleFromMarkup(cost: number, markup: number): number | null {
  if (!Number.isFinite(cost) || cost < 0) return null;
  if (!Number.isFinite(markup) || markup < 0) return null;
  return fromCents(Math.round(toCents(cost) * (1 + markup)));
}

export function realizedMargin(cost: number | null, sale: number | null): number | null {
  if (cost == null || sale == null || !Number.isFinite(cost) || !Number.isFinite(sale) || sale <= 0) return null;
  return Math.round((1 - cost / sale) * 10000) / 10000;
}

export function belowMinimumMargin(cost: number | null, sale: number | null, minimum: number): boolean {
  if (minimum <= 0) return false;
  const margin = realizedMargin(cost, sale);
  return margin != null && margin < minimum;
}

function productRate(specifications: Record<string, string> | null | undefined): number | null {
  if (!specifications) return null;
  return asRate(specifications.margin ?? specifications.Margin ?? specifications.markup ?? specifications.Markup);
}

export function resolvePriceRule(
  rules: PricingRules,
  product: { category?: string | null; specifications?: Record<string, string> | null },
): { rate: number; rule: Exclude<PriceRule, "manual">; method: PricingMethod } {
  const fromProduct = productRate(product.specifications);
  if (fromProduct != null) return { rate: fromProduct, rule: "product", method: rules.method };
  const category = product.category?.trim() ?? "";
  const fromCategory = category ? asRate(rules.category_margins[category]) : null;
  if (fromCategory != null) return { rate: fromCategory, rule: "category", method: rules.method };
  const companyRate = rules.method === "markup" ? rules.default_markup : rules.default_margin;
  return { rate: companyRate, rule: companyRate === 0 ? "cost" : "company", method: rules.method };
}

export function suggestUnitPrice(input: {
  cost: number | null;
  cost_currency: string | null;
  quote_currency: string;
  rules: PricingRules;
  product: { category?: string | null; specifications?: Record<string, string> | null };
}): { unit_price: number | null; pricing: LinePricing } {
  const resolved = resolvePriceRule(input.rules, input.product);
  const costCurrency = input.cost_currency?.trim() || null;
  const quoteCurrency = input.quote_currency.trim().toUpperCase();
  const fx_blocked = Boolean(costCurrency && costCurrency.toUpperCase() !== quoteCurrency);
  let unit_price: number | null = null;
  if (input.cost != null && !fx_blocked) {
    unit_price = resolved.method === "markup"
      ? saleFromMarkup(input.cost, resolved.rate)
      : saleFromMargin(input.cost, resolved.rate);
  }
  return {
    unit_price,
    pricing: {
      cost: input.cost,
      cost_currency: costCurrency,
      moq: null,
      method: fx_blocked ? "manual" : resolved.method,
      rule: fx_blocked ? "manual" : resolved.rule,
      suggested: unit_price,
      fx_blocked,
    },
  };
}

export function quoteCurrency(customerCurrency: string | null | undefined, companyDefault: string | null | undefined): {
  currency: string;
  source: "customer" | "company_default";
} {
  const customer = customerCurrency?.trim();
  if (customer) return { currency: customer.toUpperCase(), source: "customer" };
  const fallback = companyDefault?.trim() || "USD";
  return { currency: fallback.toUpperCase(), source: "company_default" };
}

export function encodeLineNotes(pricing: LinePricing, human = ""): string {
  return JSON.stringify({ ...pricing, human });
}

export function parseLineNotes(notes: string | null | undefined): { pricing: LinePricing | null; human: string } {
  if (!notes) return { pricing: null, human: "" };
  try {
    const parsed = JSON.parse(notes) as LinePricing & { human?: string };
    if (parsed && typeof parsed === "object" && ("cost" in parsed || "method" in parsed)) {
      return { pricing: parsed, human: parsed.human ?? "" };
    }
  } catch {
    /* plain text notes from older quotes */
  }
  return { pricing: null, human: notes };
}

export function readStoredPricing(companyId: string): PricingRules {
  if (typeof window === "undefined") return defaultPricingRules();
  try {
    const raw = window.localStorage.getItem(`${PRICING_STORAGE_KEY}:${companyId}`);
    return parsePricingRules(raw ? JSON.parse(raw) : null);
  } catch {
    return defaultPricingRules();
  }
}

export function writeStoredPricing(companyId: string, rules: PricingRules) {
  window.localStorage.setItem(`${PRICING_STORAGE_KEY}:${companyId}`, JSON.stringify(rules));
}

export function percentInput(rate: number): string {
  return String(Math.round(rate * 10000) / 100);
}

export function rateFromPercentInput(value: string, max = 0.99): number {
  return asRate(value, max) ?? 0;
}
