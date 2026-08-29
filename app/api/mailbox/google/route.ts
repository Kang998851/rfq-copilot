import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { cookieOptions, googleAuthUrl, googleOAuthConfigured, GMAIL_STATE_COOKIE, requestOrigin } from "@/lib/gmail/oauth";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(request: Request) {
  if (!googleOAuthConfigured()) {
    return NextResponse.redirect(new URL("/settings?gmail=setup", request.url));
  }
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/settings", request.url));

  const state = randomBytes(16).toString("hex");
  const store = await cookies();
  store.set(GMAIL_STATE_COOKIE, state, cookieOptions(600));
  return NextResponse.redirect(googleAuthUrl(requestOrigin(request), state));
}
