import { NextResponse } from "next/server";
import { listGmailReplies, readGmailSession, refreshGoogleAccess } from "@/lib/gmail/oauth";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = await readGmailSession();
  if (!session) return NextResponse.json({ replies: [], connected: false });

  const url = new URL(request.url);
  const reference = url.searchParams.get("reference")?.trim() || "";
  const buyer = url.searchParams.get("from")?.trim() || "";
  const parts = [reference && `subject:${reference}`, buyer && `from:${buyer}`].filter(Boolean);
  if (!parts.length) return NextResponse.json({ replies: [], connected: true });

  try {
    const access = await refreshGoogleAccess(session.refreshToken);
    const replies = await listGmailReplies(access, parts.join(" OR "));
    return NextResponse.json({ replies, connected: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read Gmail" }, { status: 502 });
  }
}
