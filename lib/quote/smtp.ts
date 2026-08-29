export type SmtpPreset = "gmail" | "outlook" | "qq" | "163" | "custom";

export type SmtpConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  secure: boolean;
  from: string;
  imapHost?: string;
  imapPort?: number;
};

export type MailboxServers = {
  host: string;
  port: number;
  secure: boolean;
  imapHost: string;
  imapPort: number;
};

export const COMPANY_PUBLIC_COLUMNS =
  "id, name, country, industry, website, default_currency, contact_email, contact_name";

export const MAILBOX_STORAGE_KEY = "rfq-copilot-mailbox";

const PRESET_SERVERS: Record<Exclude<SmtpPreset, "custom">, MailboxServers> = {
  gmail: { host: "smtp.gmail.com", port: 587, secure: false, imapHost: "imap.gmail.com", imapPort: 993 },
  outlook: { host: "smtp.office365.com", port: 587, secure: false, imapHost: "outlook.office365.com", imapPort: 993 },
  qq: { host: "smtp.qq.com", port: 465, secure: true, imapHost: "imap.qq.com", imapPort: 993 },
  "163": { host: "smtp.163.com", port: 465, secure: true, imapHost: "imap.163.com", imapPort: 993 },
};

const DOMAIN_SERVERS: Record<string, MailboxServers> = {
  "gmail.com": PRESET_SERVERS.gmail,
  "googlemail.com": PRESET_SERVERS.gmail,
  "outlook.com": PRESET_SERVERS.outlook,
  "hotmail.com": PRESET_SERVERS.outlook,
  "live.com": PRESET_SERVERS.outlook,
  "qq.com": PRESET_SERVERS.qq,
  "foxmail.com": PRESET_SERVERS.qq,
  "163.com": PRESET_SERVERS["163"],
  "126.com": { host: "smtp.126.com", port: 465, secure: true, imapHost: "imap.126.com", imapPort: 993 },
  "yeah.net": { host: "smtp.yeah.net", port: 465, secure: true, imapHost: "imap.yeah.net", imapPort: 993 },
  "sina.com": { host: "smtp.sina.com", port: 465, secure: true, imapHost: "imap.sina.com", imapPort: 993 },
  "sina.cn": { host: "smtp.sina.com", port: 465, secure: true, imapHost: "imap.sina.com", imapPort: 993 },
  "aliyun.com": { host: "smtp.aliyun.com", port: 465, secure: true, imapHost: "imap.aliyun.com", imapPort: 993 },
  "ali.com": { host: "smtp.aliyun.com", port: 465, secure: true, imapHost: "imap.aliyun.com", imapPort: 993 },
  "exmail.qq.com": { host: "smtp.exmail.qq.com", port: 465, secure: true, imapHost: "imap.exmail.qq.com", imapPort: 993 },
  "139.com": { host: "smtp.139.com", port: 465, secure: true, imapHost: "imap.139.com", imapPort: 993 },
};

export function smtpPreset(kind: SmtpPreset): { host: string; port: number; secure: boolean } {
  const servers = mailboxServers(kind);
  return { host: servers.host, port: servers.port, secure: servers.secure };
}

export function mailboxServers(kind: SmtpPreset, email?: string | null): MailboxServers {
  const domain = emailDomain(email);
  if (domain && DOMAIN_SERVERS[domain]) return DOMAIN_SERVERS[domain];
  if (domain?.endsWith(".onmicrosoft.com")) return PRESET_SERVERS.outlook;
  if (kind !== "custom") return PRESET_SERVERS[kind];
  return { host: "", port: 587, secure: false, imapHost: "", imapPort: 993 };
}

export function inferImapHost(smtpHost: string | null | undefined): string {
  const host = (smtpHost ?? "").trim().toLowerCase();
  if (!host) return "";
  if (host === "smtp.office365.com") return "outlook.office365.com";
  if (host.startsWith("smtp.")) return `imap.${host.slice(5)}`;
  return host;
}

export function mailboxGuideHref(kind: SmtpPreset): string | null {
  switch (kind) {
    case "gmail":
      return "https://myaccount.google.com/apppasswords";
    case "outlook":
      return "https://account.microsoft.com/security";
    case "qq":
      return "https://mail.qq.com";
    case "163":
      return "https://mail.163.com";
    default:
      return null;
  }
}

export function detectSmtpPreset(host: string | null | undefined): SmtpPreset {
  const value = (host ?? "").toLowerCase();
  if (value.includes("gmail.com")) return "gmail";
  if (value.includes("office365.com") || value.includes("outlook.com")) return "outlook";
  if (value.includes("qq.com") || value.includes("foxmail.com")) return "qq";
  if (value.includes("163.com") || value.includes("126.com") || value.includes("yeah.net")) return "163";
  return value ? "custom" : "gmail";
}

export function emailDomain(email: string | null | undefined): string {
  return (email ?? "").split("@")[1]?.trim().toLowerCase() ?? "";
}

export function presetFromEmail(email: string | null | undefined): SmtpPreset {
  const domain = emailDomain(email);
  if (domain === "gmail.com" || domain === "googlemail.com") return "gmail";
  if (domain === "outlook.com" || domain === "hotmail.com" || domain === "live.com" || domain.endsWith(".onmicrosoft.com")) return "outlook";
  if (domain === "qq.com" || domain === "foxmail.com" || domain.endsWith(".qq.com")) return "qq";
  if (domain === "163.com" || domain === "126.com" || domain === "yeah.net") return "163";
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
    imapHost: config.imapHost?.trim() || inferImapHost(config.host),
    imapPort: config.imapPort || 993,
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
  const imapHost = typeof row.imapHost === "string" && row.imapHost.trim() ? row.imapHost.trim() : inferImapHost(host);
  const imapPort = typeof row.imapPort === "number" ? row.imapPort : Number(row.imapPort) || 993;
  const config = { host, port, username, password, secure, from, imapHost, imapPort };
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

export function buildMailboxConfig(input: {
  preset: SmtpPreset;
  email: string;
  password: string;
  displayName?: string | null;
  host?: string;
  port?: number;
  imapHost?: string;
  imapPort?: number;
  secure?: boolean;
}): SmtpConfig | null {
  const email = input.email.trim();
  const password = input.password.trim();
  const servers = mailboxServers(input.preset, email);
  const host = (input.preset === "custom" ? input.host?.trim() : "") || servers.host;
  const port = input.preset === "custom" && input.port ? input.port : servers.port;
  const imapHost = (input.preset === "custom" ? input.imapHost?.trim() : "") || servers.imapHost || inferImapHost(host);
  const imapPort = input.preset === "custom" && input.imapPort ? input.imapPort : servers.imapPort;
  const secure = input.preset === "custom" ? input.secure !== false : servers.secure;
  return parseMailboxPayload({
    host,
    port,
    username: email,
    password,
    from: formatFromAddress(input.displayName, email),
    secure,
    imapHost,
    imapPort,
  });
}

export function clearStoredMailbox(): void {
  window.localStorage.removeItem(MAILBOX_STORAGE_KEY);
}
