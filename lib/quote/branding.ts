export const BRANDING_STORAGE_KEY = "rfq-copilot-branding";
export const DEFAULT_ACCENT = "#26448c";

export type QuoteBranding = {
  logoDataUrl: string | null;
  accent: string;
  footer: string;
  terms: string;
};

export function defaultBranding(): QuoteBranding {
  return { logoDataUrl: null, accent: DEFAULT_ACCENT, footer: "", terms: "" };
}

export function parseBranding(raw: unknown): QuoteBranding {
  const base = defaultBranding();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const row = raw as Record<string, unknown>;
  const accent = typeof row.accent === "string" && /^#?[0-9a-f]{6}$/i.test(row.accent.trim())
    ? (row.accent.startsWith("#") ? row.accent : `#${row.accent}`)
    : base.accent;
  return {
    logoDataUrl: typeof row.logoDataUrl === "string" && row.logoDataUrl.startsWith("data:image/") ? row.logoDataUrl : null,
    accent,
    footer: typeof row.footer === "string" ? row.footer.slice(0, 240) : "",
    terms: typeof row.terms === "string" ? row.terms.slice(0, 800) : "",
  };
}

export function readStoredBranding(companyId: string): QuoteBranding {
  if (typeof window === "undefined") return defaultBranding();
  try {
    const raw = window.localStorage.getItem(`${BRANDING_STORAGE_KEY}:${companyId}`);
    return parseBranding(raw ? JSON.parse(raw) : null);
  } catch {
    return defaultBranding();
  }
}

export function writeStoredBranding(companyId: string, branding: QuoteBranding) {
  window.localStorage.setItem(`${BRANDING_STORAGE_KEY}:${companyId}`, JSON.stringify(branding));
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0.15, g: 0.27, b: 0.55 };
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

export function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
    }
    i += 2 + len;
  }
  return null;
}

export function jpegFromDataUrl(dataUrl: string): Uint8Array | null {
  const match = /^data:image\/jpeg;base64,([a-z0-9+/]+=*)$/i.exec(dataUrl.replace(/\s/g, ""));
  if (!match) return null;
  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return jpegDimensions(bytes) ? bytes : null;
}

export async function logoFileToJpegDataUrl(file: File): Promise<string | null> {
  if (file.size > 400_000) return null;
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("read"));
    reader.readAsDataURL(file);
  });
  if (dataUrl.startsWith("data:image/jpeg")) return dataUrl;
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("image"));
    el.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 480 / Math.max(image.width, image.height));
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}
