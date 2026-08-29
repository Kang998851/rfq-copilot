import { Socket } from "node:net";
import { connect as tlsConnect, type TLSSocket } from "node:tls";
import { buildImapSearch, imapQuote, parseImapFetches, parseImapSearch, type MailReply } from "./imap-parse";
import { extractEmailAddress, inferImapHost, type SmtpConfig } from "./smtp";

export type { MailReply } from "./imap-parse";
export { buildImapSearch, decodeMimeWords, imapQuote, mailSnippet, parseImapFetches, parseImapSearch, parseMailHeaders } from "./imap-parse";

type Conn = Socket | TLSSocket;

function writeLine(conn: Conn, line: string): Promise<void> {
  return new Promise((resolve, reject) => {
    conn.write(`${line}\r\n`, (error) => (error ? reject(error) : resolve()));
  });
}

function connectPlain(host: string, port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Could not reach ${host}:${port}`));
    }, 10000);
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.connect(port, host, () => {
      clearTimeout(timer);
      resolve(socket);
    });
  });
}

function connectTls(host: string, port: number, socket?: Socket): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const tlsSocket = tlsConnect({ host, port, socket, servername: host, minVersion: "TLSv1.2" }, () => resolve(tlsSocket));
    tlsSocket.once("error", reject);
  });
}

class ImapSession {
  leftover = Buffer.alloc(0);
  tag = 0;
  conn: Conn;

  constructor(conn: Conn) {
    this.conn = conn;
  }

  private async readChunk(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("IMAP timed out waiting for the mail server")), 15000);
      const onData = (chunk: Buffer) => {
        cleanup();
        resolve(chunk);
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        clearTimeout(timer);
        this.conn.off("data", onData);
        this.conn.off("error", onError);
      };
      this.conn.once("data", onData);
      this.conn.once("error", onError);
    });
  }

  private async fill(): Promise<void> {
    this.leftover = Buffer.concat([this.leftover, await this.readChunk()]);
  }

  async readLine(): Promise<string> {
    while (true) {
      const idx = this.leftover.indexOf(0x0a);
      if (idx !== -1) {
        const line = this.leftover.subarray(0, idx).toString("utf8").replace(/\r$/, "");
        this.leftover = this.leftover.subarray(idx + 1);
        return line;
      }
      await this.fill();
    }
  }

  async readBytes(count: number): Promise<Buffer> {
    while (this.leftover.length < count) await this.fill();
    const out = this.leftover.subarray(0, count);
    this.leftover = this.leftover.subarray(count);
    return out;
  }

  async readImapLine(): Promise<string> {
    let result = "";
    while (true) {
      const line = await this.readLine();
      const literal = line.match(/^(.*)\{(\d+)\}\s*$/);
      if (!literal) return result + line;
      result += literal[1];
      result += (await this.readBytes(Number(literal[2]))).toString("utf8");
    }
  }

  async command(line: string): Promise<string> {
    this.tag += 1;
    const tag = `A${this.tag}`;
    await writeLine(this.conn, `${tag} ${line}`);
    const parts: string[] = [];
    while (true) {
      const text = await this.readImapLine();
      parts.push(text);
      if (!text.startsWith(`${tag} `)) continue;
      const status = text.slice(tag.length + 1);
      if (status.startsWith("NO") || status.startsWith("BAD")) {
        throw new Error(status.replace(/^(NO|BAD)\s+/i, "").replace(/^\[[^\]]+\]\s*/, "").trim() || "IMAP command failed");
      }
      return parts.join("\n");
    }
  }
}

async function openImap(config: SmtpConfig): Promise<ImapSession> {
  const host = (config.imapHost || inferImapHost(config.host)).trim();
  const port = config.imapPort || 993;
  if (!host || !config.username || !config.password) throw new Error("Mailbox is not fully configured");
  const useTls = port === 993 || port === 995;
  let conn: Conn = useTls ? await connectTls(host, port) : await connectPlain(host, port);
  const session = new ImapSession(conn);
  await session.readImapLine();
  if (!useTls) {
    await session.command("STARTTLS");
    conn = await connectTls(host, port, conn as Socket);
    session.conn = conn;
  }
  const user = imapQuote(extractEmailAddress(config.username) || config.username);
  const pass = imapQuote(config.password);
  try {
    await session.command(`LOGIN ${user} ${pass}`);
  } catch {
    const plain = Buffer.from(`\u0000${extractEmailAddress(config.username) || config.username}\u0000${config.password}`, "utf8").toString("base64");
    await session.command(`AUTHENTICATE PLAIN ${plain}`);
  }
  return session;
}

export async function verifyImapMailbox(config: SmtpConfig): Promise<void> {
  const session = await openImap(config);
  try {
    await session.command("SELECT INBOX");
    await session.command("LOGOUT").catch(() => undefined);
  } finally {
    session.conn.end();
  }
}

export async function listImapReplies(config: SmtpConfig, reference: string, from: string): Promise<MailReply[]> {
  const session = await openImap(config);
  try {
    await session.command("SELECT INBOX");
    const search = await session.command(buildImapSearch(reference, from));
    const uids = parseImapSearch(search).slice(-15);
    if (!uids.length) return [];
    const fetched = await session.command(
      `UID FETCH ${uids.join(",")} (UID BODY.PEEK[HEADER.FIELDS (FROM DATE SUBJECT)] BODY.PEEK[TEXT]<0.350>)`,
    );
    await session.command("LOGOUT").catch(() => undefined);
    return parseImapFetches(fetched);
  } finally {
    session.conn.end();
  }
}
