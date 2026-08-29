import { NextResponse } from "next/server";
import { googleOAuthConfigured, readGmailSession } from "@/lib/gmail/oauth";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = await readGmailSession();
  return NextResponse.json({
    configured: googleOAuthConfigured(),
    connected: Boolean(session),
    email: session?.email || null,
  });
}
