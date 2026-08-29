export type SmtpPreset = "gmail" | "outlook" | "qq" | "163" | "custom";

export type SmtpConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  secure: boolean;
  from: string;
};

export const COMPANY_PUBLIC_COLUMNS =
  "id, name, country, industry, website, default_currency, contact_email, contact_name";

export const MAILBOX_STORAGE_KEY = "rfq-copilot-mailbox";

export function smtpPreset(kind: SmtpPreset): { host: string; port: number; secure: boolean } {
  switch (kind) {
    case "gmail":
      return { host: "smtp.gmail.com", port: 587, secure: false };
    case "outlook":
      return { host: "smtp.office365.com", port: 587, secure: false };
    case "qq":
      return { host: "smtp.qq.com", port: 465, secure: true };
    case "163":
      return { host: "smtp.163.com", port: 465, secure: true };
    default:
      return { host: "", port: 587, secure: false };
  }
}

export function detectSmtpPreset(host: string | null | undefined): SmtpPreset {
  const value = (host ?? "").toLowerCase();
  if (value.includes("gmail.com")) return "gmail";
  if (value.includes("office365.com") || value.includes("outlook.com")) return "outlook";
  if (value.includes("qq.com")) return "qq";
  if (value.includes("163.com")) return "163";
  return value ? "custom" : "gmail";
}

export function presetFromEmail(email: string | null | undefined): SmtpPreset {
  const domain = (email ?? "").split("@")[1]?.toLowerCase() ?? "";
  if (domain === "gmail.com" || domain === "googlemail.com") return "gmail";
  if (domain === "outlook.com" || domain === "hotmail.com" || domain === "live.com") return "outlook";
  if (domain.endsWith("qq.com")) return "qq";
  if (domain === "163.com" || domain === "126.com") return "163";
  return "custom";
}

export function isSmtpReady(row: Partial<SmtpConfig> | null | undefined): boolean {
  return Boolean(row?.host?.trim() && row?.username?.trim() && row?.password && row?.from?.trim());
}

export function mailboxAsUserSender(config: SmtpConfig, displayName?: string | null): SmtpConfig {
  const email = extractEmailAddress(config.username) || extractEmailAddress(config.from);
  return {
    ...config,
    username: email,
    from: formatFromAddress(displayName, email),
  };
}

export function formatFromAddress(name: string | null | undefined, email: string): string {
  const trimmed = name?.trim();
  const address = email.trim();
  if (!trimmed) return address;
  return `${trimmed.replace(/[<>"]/g, "")} <${address}>`;
}

export function extractEmailAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match?.[1] || from).trim();
}

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export function encodeMimeWord(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${utf8ToBase64(value)}?=`;
}

export function encodeFromHeader(from: string): string {
  const match = from.match(/^(.*)<([^>]+)>\s*$/);
  if (!match) return from;
  const name = match[1].trim();
  if (!name) return match[2];
  return `${encodeMimeWord(name)} <${match[2]}>`;
}

export function isCompleteSmtpReply(buffer: string): boolean {
  if (!/(?:\r\n|\n)$/.test(buffer)) return false;
  const lines = buffer.replace(/\r\n/g, "\n").trimEnd().split("\n");
  const last = lines[lines.length - 1] ?? "";
  return /^\d{3} /.test(last);
}

export function stuffDots(body: string): string {
  return body.replace(/^\./gm, "..");
}

export function buildRfc822Message(input: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}): string {
  const headers = [
    `From: ${encodeFromHeader(input.from)}`,
    `To: ${input.to}`,
    `Subject: ${encodeMimeWord(input.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
  ];
  if (input.replyTo) headers.push(`Reply-To: ${input.replyTo}`);

  if (input.html) {
    const boundary = `rfq${Date.now().toString(16)}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    return [
      headers.join("\r\n"),
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      input.text.replace(/\r?\n/g, "\r\n"),
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      input.html.replace(/\r?\n/g, "\r\n"),
      `--${boundary}--`,
      "",
    ].join("\r\n");
  }

  headers.push("Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit");
  return `${headers.join("\r\n")}\r\n\r\n${input.text.replace(/\r?\n/g, "\r\n")}\r\n`;
}

export function parseMailboxPayload(value: unknown): SmtpConfig | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const host = typeof row.host === "string" ? row.host.trim() : "";
  const username = typeof row.username === "string" ? row.username.trim() : "";
  const password = typeof row.password === "string" ? row.password : "";
  const from = typeof row.from === "string" ? row.from.trim() : username;
  const port = typeof row.port === "number" ? row.port : Number(row.port) || 587;
  const secure = row.secure === true || port === 465;
  const config = { host, port, username, password, secure, from };
  return isSmtpReady(config) ? config : null;
}

export function readStoredMailbox(): SmtpConfig | null {
  if (typeof window === "undefined") return null;
  try {
    return parseMailboxPayload(JSON.parse(window.localStorage.getItem(MAILBOX_STORAGE_KEY) || "null"));
  } catch {
    return null;
  }
}

export function writeStoredMailbox(config: SmtpConfig): void {
  window.localStorage.setItem(MAILBOX_STORAGE_KEY, JSON.stringify(config));
}

export function clearStoredMailbox(): void {
  window.localStorage.removeItem(MAILBOX_STORAGE_KEY);
}
