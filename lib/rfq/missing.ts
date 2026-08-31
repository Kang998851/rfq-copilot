import type { CatalogProduct, ExtractedItem } from "./types";

export const CATEGORY_REQUIRED: Record<string, string[]> = {
  valve: ["Size", "Pressure Rating", "Material", "Connection Type", "Seat", "Certificate Requirement"],
  pump: ["Size", "Material", "Voltage", "Connection Type"],
  bearing: ["Size", "Material"],
  motor: ["Size", "Material", "Voltage"],
  fastener: ["Size", "Material"],
  fitting: ["Size", "Material", "Connection Type", "Pressure Rating"],
};

const FIELD_HINTS: Record<string, string[]> = {
  Size: ["dn", "mm", "inch", "size", "尺寸", "规格"],
  "Pressure Rating": ["pn", "pressure", "bar", "mpa", "压力"],
  Material: ["ss304", "ss316", "cast iron", "brass", "carbon steel", "stainless", "material", "材质"],
  "Connection Type": ["flange", "thread", "npt", "bsp", "connection", "法兰", "螺纹", "连接"],
  Seat: ["seat", "ptfe", "epdm", "nbr", "阀座"],
  "Certificate Requirement": ["ce", "iso", "certificate", "en 10204", "certification", "证书"],
  Voltage: ["voltage", "380v", "220v", "v ac", "电压"],
};

export function inferCategory(item: ExtractedItem, product: CatalogProduct | null) {
  const text = `${item.category ?? ""} ${product?.category ?? ""} ${item.requirement}`.toLowerCase();
  if (/valve|阀/.test(text)) return "valve";
  if (/pump|泵/.test(text)) return "pump";
  if (/bearing|轴承/.test(text)) return "bearing";
  if (/motor|电机/.test(text)) return "motor";
  if (/bolt|nut|screw|fastener|螺栓|螺母/.test(text)) return "fastener";
  if (/fitting|法兰|接头/.test(text)) return "fitting";
  return "";
}

function hasHint(blob: string, label: string) {
  return (FIELD_HINTS[label] ?? []).some((hint) => blob.includes(hint));
}

export function filledSpecsFrom(specs: Record<string, unknown> | null | undefined): Record<string, string> {
  const raw = specs?.filled_specs;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, string> : {};
}

export function requiredMissing(item: ExtractedItem, product: CatalogProduct | null, filled: Record<string, string> = {}) {
  const category = inferCategory(item, product);
  const required = CATEGORY_REQUIRED[category] ?? [];
  const blob = [
    item.requirement,
    item.size,
    item.material,
    item.model,
    item.certification,
    product?.material,
    product?.size,
    JSON.stringify(product?.specifications ?? {}),
    ...Object.values(filled),
  ].filter(Boolean).join(" ").toLowerCase();

  return required.filter((label) => {
    if (filled[label]?.trim()) return false;
    if (label === "Size" && (item.size || product?.size)) return false;
    if (label === "Material" && (item.material || product?.material)) return false;
    return !hasHint(blob, label);
  });
}

function specString(specs: Record<string, unknown> | null | undefined, key: string) {
  const value = specs?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export function extractedFromLine(item: {
  requirement: string;
  quantity: number | null;
  unit: string | null;
  specs?: Record<string, unknown> | null;
  requested_sku?: string | null;
}): ExtractedItem {
  return {
    requirement: item.requirement,
    quantity: item.quantity,
    unit: item.unit,
    material: specString(item.specs, "material"),
    size: specString(item.specs, "size"),
    model: specString(item.specs, "model"),
    category: specString(item.specs, "category"),
    requested_sku: item.requested_sku ?? null,
    certification: specString(item.specs, "certification"),
  };
}

export function liveMissing(item: {
  requirement: string;
  quantity: number | null;
  unit: string | null;
  specs?: Record<string, unknown> | null;
  requested_sku?: string | null;
  missing: string[];
}, product: CatalogProduct | null) {
  return [...new Set([...item.missing, ...requiredMissing(extractedFromLine(item), product, filledSpecsFrom(item.specs))])];
}
