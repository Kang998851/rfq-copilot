export type FieldReviewStatus = "pending" | "approved" | "edited" | "missing" | "ignored";

export type ReviewActivity = {
  at: string;
  action: string;
  detail: string;
};

export function fieldStatus(reviews: Record<string, string> | null | undefined, field: string): FieldReviewStatus {
  const value = reviews?.[field];
  if (value === "approved" || value === "edited" || value === "missing" || value === "ignored") return value;
  return "pending";
}

export function setFieldStatus(reviews: Record<string, string> | null | undefined, field: string, status: FieldReviewStatus) {
  return { ...(reviews ?? {}), [field]: status };
}

export function visibleMissing(missing: string[], reviews: Record<string, string> | null | undefined) {
  return missing.filter((item) => {
    const status = fieldStatus(reviews, item);
    return status !== "ignored" && status !== "approved";
  });
}

export function needsLineReview(extractConfidence: number | null | undefined, reviewStatus: string) {
  if (reviewStatus !== "pending") return false;
  return extractConfidence == null || extractConfidence < 0.7;
}

export function askBuyerQuestion(lineNo: number, label: string) {
  return `Could you please confirm the ${label} for item ${lineNo}?`;
}

export function appendActivity(log: ReviewActivity[] | null | undefined, action: string, detail: string): ReviewActivity[] {
  return [{ at: new Date().toISOString(), action, detail }, ...(log ?? [])].slice(0, 40);
}

export function reviewsFromSpecs(specs: Record<string, string> | null | undefined): Record<string, string> {
  const raw = specs && typeof specs === "object" ? (specs as Record<string, unknown>).field_reviews : null;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, string> : {};
}

export function specsWithReviews(specs: Record<string, string> | null | undefined, reviews: Record<string, string>) {
  return { ...(specs ?? {}), field_reviews: reviews } as Record<string, string>;
}

export function activityFromHeader(header: unknown): ReviewActivity[] {
  if (!header || typeof header !== "object" || Array.isArray(header)) return [];
  const raw = (header as { __activity?: ReviewActivity[] }).__activity;
  return Array.isArray(raw) ? raw : [];
}

export function headerWithActivity(header: unknown, activity: ReviewActivity[]) {
  const base = header && typeof header === "object" && !Array.isArray(header) ? header as Record<string, unknown> : {};
  return { ...base, __activity: activity };
}
