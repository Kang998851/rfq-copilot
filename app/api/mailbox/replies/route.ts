import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { listGmailReplies, readGmailSession, refreshGoogleAccess } from "@/lib/gmail/oauth";
import { listImapReplies } from "@/lib/quote/imap";
import { parseMailboxPayload } from "@/lib/quote/smtp";

export const maxDuration = 20;

function client(authorization: string | null) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { global: { headers: authorization ? { Authorization: authorization } : {} } },
  );
}

export async function POST(request: Request) {
  const supabase = client(request.headers.get("authorization"));
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const reference = typeof body.reference === "string" ? body.reference.trim() : "";
  const from = typeof body.from === "string" ? body.from.trim() : "";
  const mailbox = parseMailboxPayload(body.mailbox ?? body.smtp);

  if (mailbox) {
    try {
      const replies = await listImapReplies(mailbox, reference, from);
      return NextResponse.json({ replies, connected: true, provider: "imap" });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read mailbox" }, { status: 502 });
    }
  }

  const session = await readGmailSession();
  if (!session) return NextResponse.json({ replies: [], connected: false });
  const parts = [reference && `subject:${reference}`, from && `from:${from}`].filter(Boolean);
  if (!parts.length) return NextResponse.json({ replies: [], connected: true, provider: "gmail" });

  try {
    const access = await refreshGoogleAccess(session.refreshToken);
    const replies = await listGmailReplies(access, parts.join(" OR "));
    return NextResponse.json({ replies, connected: true, provider: "gmail" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read Gmail" }, { status: 502 });
  }
}
