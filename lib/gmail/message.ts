import { encodeMimeWord, formatFromAddress } from "@/lib/quote/smtp";
import { textToHtml } from "@/lib/quote/email";

export function buildGmailRaw(input: {
  fromName?: string | null;
  fromEmail: string;
  to: string;
  subject: string;
  text: string;
}): string {
  const from = formatFromAddress(input.fromName, input.fromEmail);
  const raw = [
    `From: ${from}`,
    `To: ${input.to}`,
    `Subject: ${encodeMimeWord(input.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "",
    textToHtml(input.text),
  ].join("\r\n");
  return Buffer.from(raw, "utf8").toString("base64url");
}
