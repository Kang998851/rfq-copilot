export type QuoteLine = {
  quantity: number | null;
  unit_price: number | null;
};

export function lineAmount(quantity: number | null, unitPrice: number | null): number | null {
  if (quantity == null || unitPrice == null) return null;
  return Math.round(quantity * unitPrice * 100) / 100;
}

export function quoteTotal(items: QuoteLine[]): number | null {
  let total = 0;
  for (const item of items) {
    const amount = lineAmount(item.quantity, item.unit_price);
    if (amount == null) return null;
    total += amount;
  }
  return Math.round(total * 100) / 100;
}

export function formatMoney(value: number | null, currency: string): string {
  if (value == null) return "TBD";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function allPricesFilled(items: QuoteLine[]): boolean {
  return items.length > 0 && items.every((item) => item.unit_price != null);
}
