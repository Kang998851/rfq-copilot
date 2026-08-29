import { NextResponse } from "next/server";
import { extractRfq } from "@/lib/rfq/extract";
import { createUserClient } from "@/lib/supabase/route";

export const maxDuration = 20;

export async function POST(request: Request) {
  const supabase = createUserClient(request.headers.get("authorization"));
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text : "";
  const rows = Array.isArray(body.rows) ? body.rows : undefined;
  if (!text.trim() && !rows?.length) return NextResponse.json({ error: "Empty RFQ" }, { status: 400 });
  const extracted = await extractRfq({ text, rows });
  return NextResponse.json(extracted);
}
