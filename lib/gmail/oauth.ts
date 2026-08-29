import { cookies } from "next/headers";
export { buildGmailRaw } from "./message";

export const GMAIL_REFRESH_COOKIE = "rfq_gmail_rt";
export const GMAIL_EMAIL_COOKIE = "rfq_gmail_email";
export const GMAIL_STATE_COOKIE = "rfq_gmail_state";

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
].join(" ");

export function googleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function requestOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  if (host) return `${proto}://${host.split(",")[0].trim()}`;
  return new URL(request.url).origin;
}

export function googleRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/mailbox/google/callback`;
}

export function googleAuthUrl(origin: string, state: string): string {
  const query = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: googleRedirectUri(origin),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${query.toString()}`;
}

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function exchangeGoogleCode(origin: string, code: string): Promise<{
  refreshToken: string;
  accessToken: string;
  email: string;
}> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: googleRedirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  const payload = await res.json() as { refresh_token?: string; access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "Google authorization failed");
  }
  const email = await googleEmail(payload.access_token);
  if (!payload.refresh_token) {
    throw new Error("Google did not return a lasting connection. Disconnect the app in Google Account permissions and connect again.");
  }
  return { refreshToken: payload.refresh_token, accessToken: payload.access_token, email };
}

export async function refreshGoogleAccess(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      grant_type: "refresh_token",
    }),
  });
  const payload = await res.json() as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "Gmail connection expired. Connect Gmail again.");
  }
  return payload.access_token;
}

export async function googleEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await res.json() as { email?: string };
  if (!payload.email) throw new Error("Could not read the Gmail address");
  return payload.email;
}

export async function sendGmail(accessToken: string, raw: string): Promise<void> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(payload.error?.message || "Gmail could not send the message");
  }
}

export type GmailReply = { id: string; from: string; date: string; snippet: string };

export async function listGmailReplies(accessToken: string, query: string): Promise<GmailReply[]> {
  const list = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({ q: query, maxResults: "8" })}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await list.json() as { messages?: Array<{ id: string }> };
  if (!list.ok || !payload.messages?.length) return [];
  const items = await Promise.all(payload.messages.slice(0, 8).map(async (row) => {
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${row.id}?format=metadata&metadataHeaders=From&metadataHeaders=Date&metadataHeaders=Subject`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const message = await res.json() as {
      snippet?: string;
      payload?: { headers?: Array<{ name: string; value: string }> };
    };
    const header = (name: string) => message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value || "";
    return {
      id: row.id,
      from: header("From"),
      date: header("Date"),
      snippet: message.snippet || "",
    };
  }));
  return items;
}

export async function readGmailSession(): Promise<{ refreshToken: string; email: string } | null> {
  const store = await cookies();
  const refreshToken = store.get(GMAIL_REFRESH_COOKIE)?.value;
  const email = store.get(GMAIL_EMAIL_COOKIE)?.value;
  if (!refreshToken || !email) return null;
  return { refreshToken, email };
}
