export type MailReply = {
  id: string;
  from: string;
  date: string;
  snippet: string;
};

export function imapQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function buildImapSearch(reference: string, from: string): string {
  const ref = reference.trim();
  const sender = from.trim();
  if (ref && sender) return `UID SEARCH OR SUBJECT ${imapQuote(ref)} FROM ${imapQuote(sender)}`;
  if (ref) return `UID SEARCH SUBJECT ${imapQuote(ref)}`;
  if (sender) return `UID SEARCH FROM ${imapQuote(sender)}`;
  return "UID SEARCH RECENT";
}

export function parseImapSearch(text: string): number[] {
  const ids: number[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\* SEARCH\b(.*)$/i);
    if (!match) continue;
    for (const part of match[1].trim().split(/\s+/)) {
      const n = Number(part);
      if (Number.isInteger(n) && n > 0) ids.push(n);
    }
  }
  return ids;
}

export function decodeMimeWords(value: string): string {
  return value.replace(/=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g, (_, charset, encoding, data) => {
    try {
      const bytes = String(encoding).toUpperCase() === "B"
        ? Buffer.from(data, "base64")
        : Buffer.from(decodeQuotedPrintable(String(data).replace(/_/g, " ")), "binary");
      return new TextDecoder(String(charset)).decode(bytes);
    } catch {
      return value;
    }
  });
}

function decodeQuotedPrintable(value: string): string {
  return value.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export function parseMailHeaders(raw: string): { from: string; date: string; subject: string } {
  const unfolded = raw.replace(/\r?\n[ \t]+/g, " ");
  const field = (name: string) => {
    const match = unfolded.match(new RegExp(`^${name}:\\s*(.*)$`, "im"));
    return decodeMimeWords((match?.[1] ?? "").trim());
  };
  return { from: field("from"), date: field("date"), subject: field("subject") };
}

export function mailSnippet(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/=\r?\n/g, "").replace(/\s+/g, " ").trim().slice(0, 220);
}

export function parseImapFetches(text: string): MailReply[] {
  const replies: MailReply[] = [];
  const blocks = text.split(/^\* \d+ FETCH /im).slice(1);
  for (const block of blocks) {
    const uid = block.match(/\bUID (\d+)/i)?.[1] ?? String(replies.length + 1);
    const header = block.match(/BODY\[HEADER\.FIELDS[^\]]*\](?:<\d+\.\d+>)?\s*(?:\{\d+\}\n)?([\s\S]*?)(?=\s(?:BODY|UID|FLAGS)|\n\)|$)/i)?.[1] ?? block;
    const textPart = block.match(/BODY\[TEXT\](?:<[^>]+>)?\s*(?:\{\d+\}\n)?([\s\S]*?)(?=\s(?:BODY|UID|FLAGS)|\n\)|$)/i)?.[1] ?? "";
    const headers = parseMailHeaders(header);
    replies.push({
      id: uid,
      from: headers.from || "—",
      date: headers.date,
      snippet: mailSnippet(textPart) || headers.subject,
    });
  }
  return replies;
}
