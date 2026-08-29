import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { GMAIL_EMAIL_COOKIE, GMAIL_REFRESH_COOKIE } from "@/lib/gmail/oauth";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const store = await cookies();
  store.delete(GMAIL_REFRESH_COOKIE);
  store.delete(GMAIL_EMAIL_COOKIE);
  return NextResponse.json({ ok: true });
}
