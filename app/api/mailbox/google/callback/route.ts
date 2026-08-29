import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  cookieOptions,
  exchangeGoogleCode,
  GMAIL_EMAIL_COOKIE,
  GMAIL_REFRESH_COOKIE,
  GMAIL_STATE_COOKIE,
  requestOrigin,
} from "@/lib/gmail/oauth";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = requestOrigin(request);
  const error = url.searchParams.get("error");
  if (error) return NextResponse.redirect(new URL(`/settings?gmail=denied`, origin));

  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const store = await cookies();
  const expected = store.get(GMAIL_STATE_COOKIE)?.value;
  store.delete(GMAIL_STATE_COOKIE);
  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(new URL("/settings?gmail=error", origin));
  }

  try {
    const tokens = await exchangeGoogleCode(origin, code);
    store.set(GMAIL_REFRESH_COOKIE, tokens.refreshToken, cookieOptions(60 * 60 * 24 * 180));
    store.set(GMAIL_EMAIL_COOKIE, tokens.email, { ...cookieOptions(60 * 60 * 24 * 180), httpOnly: false });

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: member } = await supabase.from("company_members").select("company_id").eq("user_id", user.id).maybeSingle();
      if (member) {
        await supabase.from("companies").update({ contact_email: tokens.email }).eq("id", member.company_id);
      }
    }
    return NextResponse.redirect(new URL("/settings?gmail=connected", origin));
  } catch {
    return NextResponse.redirect(new URL("/settings?gmail=error", origin));
  }
}
