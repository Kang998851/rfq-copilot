import { Socket } from "node:net";
import { connect as tlsConnect, type TLSSocket } from "node:tls";
import {
  buildRfc822Message,
  extractEmailAddress,
  formatFromAddress,
  isCompleteSmtpReply,
  stuffDots,
  type SmtpConfig,
} from "./smtp";

type Conn = Socket | TLSSocket;

function readResponse(conn: Conn, timeoutMs = 12000): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("SMTP timed out waiting for the mail server"));
    }, timeoutMs);
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      if (isCompleteSmtpReply(buffer)) {
        cleanup();
        resolve(buffer);
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timer);
      conn.off("data", onData);
      conn.off("error", onError);
    };
    conn.on("data", onData);
    conn.on("error", onError);
  });
}

async function expectCode(conn: Conn, allowed: number | number[]): Promise<string> {
  const text = await readResponse(conn);
  const code = Number(text.slice(0, 3));
  const ok = Array.isArray(allowed) ? allowed : [allowed];
  if (!ok.includes(code)) {
    const first = text.split(/\r?\n/).find(Boolean) ?? text;
    throw new Error(first.replace(/^\d{3}[ -]/, "").trim() || `SMTP ${code}`);
  }
  return text;
}

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

export async function sendSmtpMail(config: SmtpConfig, message: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}): Promise<void> {
  const host = config.host.trim();
  const port = config.port || (config.secure ? 465 : 587);
  const from = config.from.trim() || formatFromAddress(null, config.username);
  const envelopeFrom = extractEmailAddress(from);
  if (!host || !config.username || !config.password) throw new Error("Mailbox is not fully configured");

  let conn: Conn = config.secure || port === 465
    ? await connectTls(host, port)
    : await connectPlain(host, port);

  try {
    await expectCode(conn, 220);
    await writeLine(conn, "EHLO rfq-copilot");
    await expectCode(conn, 250);

    if (!config.secure && port !== 465) {
      await writeLine(conn, "STARTTLS");
      await expectCode(conn, 220);
      conn = await connectTls(host, port, conn as Socket);
      await writeLine(conn, "EHLO rfq-copilot");
      await expectCode(conn, 250);
    }

    await writeLine(conn, "AUTH LOGIN");
    await expectCode(conn, 334);
    await writeLine(conn, Buffer.from(config.username, "utf8").toString("base64"));
    await expectCode(conn, 334);
    await writeLine(conn, Buffer.from(config.password, "utf8").toString("base64"));
    await expectCode(conn, 235);

    await writeLine(conn, `MAIL FROM:<${envelopeFrom}>`);
    await expectCode(conn, 250);
    await writeLine(conn, `RCPT TO:<${message.to.trim()}>`);
    await expectCode(conn, [250, 251]);
    await writeLine(conn, "DATA");
    await expectCode(conn, 354);

    const raw = stuffDots(buildRfc822Message({
      from,
      to: message.to.trim(),
      subject: message.subject,
      text: message.text,
      html: message.html,
      replyTo: message.replyTo,
    }));
    await writeLine(conn, `${raw.replace(/\r?\n$/, "")}\r\n.`);
    await expectCode(conn, 250);
    await writeLine(conn, "QUIT");
  } finally {
    conn.end();
  }
}
