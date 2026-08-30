export type PdfExtract = {
  text: string;
  pageCount: number;
  kind: "text" | "empty" | "invalid";
};

function decodePdfLiteral(raw: string): string {
  return raw.replace(/\\([nrt()\\]|[0-7]{1,3})/g, (_match, token: string) => {
    if (token === "n") return "\n";
    if (token === "r") return "\r";
    if (token === "t") return "\t";
    if (token === "(" || token === ")" || token === "\\") return token;
    return String.fromCharCode(parseInt(token, 8));
  });
}

function collectLiterals(chunk: string): string[] {
  const out: string[] = [];
  const pattern = /\(((?:\\.|[^\\)])*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(chunk))) out.push(decodePdfLiteral(match[1]));
  return out;
}

export function extractPdfText(bytes: Uint8Array): PdfExtract {
  if (bytes.length < 5) return { text: "", pageCount: 0, kind: "invalid" };
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]);
  if (magic !== "%PDF-") return { text: "", pageCount: 0, kind: "invalid" };

  const latin = new TextDecoder("latin1").decode(bytes);
  const pageCount = Math.max((latin.match(/\/Type\s*\/Page(?!\s*s)/g) || []).length, 1);
  const pieces: string[] = [];

  const tj = /\(((?:\\.|[^\\)])*)\)\s*Tj/g;
  let match: RegExpExecArray | null;
  while ((match = tj.exec(latin))) pieces.push(decodePdfLiteral(match[1]));

  const arrays = /\[((?:[^\[\]]|\[[^\]]*\])*)\]\s*TJ/g;
  while ((match = arrays.exec(latin))) pieces.push(collectLiterals(match[1]).join(""));

  const text = pieces.join(" ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  return { text, pageCount, kind: text ? "text" : "empty" };
}
