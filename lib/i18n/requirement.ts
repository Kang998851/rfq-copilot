import type { Locale } from "./locale";

const PHRASES: Array<[string, string]> = [
  ["deep groove bearing", "深沟球轴承"],
  ["horizontal centrifugal pump", "卧式离心泵"],
  ["centrifugal pump", "离心泵"],
  ["ball valve", "球阀"],
  ["gate valve", "闸阀"],
  ["globe valve", "截止阀"],
  ["check valve", "止回阀"],
  ["butterfly valve", "蝶阀"],
  ["stainless steel", "不锈钢"],
  ["carbon steel", "碳钢"],
  ["cast iron", "铸铁"],
  ["ce certificate", "CE 认证"],
  ["please quote", "请报价"],
  ["lead time", "交期"],
  ["connection type", "连接方式"],
  ["pressure rating", "压力等级"],
  ["bearing", "轴承"],
  ["valve", "阀门"],
  ["pump", "泵"],
  ["motor", "电机"],
  ["bolt", "螺栓"],
  ["nut", "螺母"],
  ["fitting", "管件"],
  ["flanged", "法兰连接"],
  ["flange", "法兰"],
  ["threaded", "螺纹连接"],
  ["thread", "螺纹"],
  ["certificate", "证书"],
  ["quantity", "数量"],
  ["pieces", "件"],
  ["brass", "黄铜"],
  ["aluminum", "铝"],
  ["aluminium", "铝"],
  ["units", "台"],
  ["unit", "台"],
  ["sets", "套"],
  ["set", "套"],
  ["pcs", "件"],
  ["pc", "件"],
  ["and", "和"],
  ["with", "带"],
];

const EN_TO_ZH = [...PHRASES].sort((a, b) => b[0].length - a[0].length);
const ZH_TO_EN = [...PHRASES].sort((a, b) => b[1].length - a[1].length);

export function looksEnglish(value: string): boolean {
  const letters = value.replace(/[^A-Za-z\u4e00-\u9fff]/g, "");
  if (!letters) return false;
  const latin = (value.match(/[A-Za-z]/g) ?? []).length;
  const cjk = (value.match(/[\u4e00-\u9fff]/g) ?? []).length;
  return latin >= 8 && latin > cjk * 2;
}

export function looksChinese(value: string): boolean {
  return /[\u4e00-\u9fff]/.test(value) && !looksEnglish(value);
}

function replacePhrase(source: string, from: string, to: string, latin: boolean) {
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = latin ? `(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])` : escaped;
  return source.replace(new RegExp(pattern, "gi"), to);
}

export function translateRequirement(text: string, locale: Locale): { text: string; original: string; changed: boolean } {
  const original = text.trim();
  if (!original) return { text: original, original, changed: false };

  let next = original;
  if (locale === "zh" && looksEnglish(original)) {
    for (const [en, zh] of EN_TO_ZH) next = replacePhrase(next, en, zh, true);
  } else if (locale === "en" && looksChinese(original)) {
    for (const [en, zh] of ZH_TO_EN) next = replacePhrase(next, zh, en, false);
  }

  next = next.replace(/\s+,/g, "，").replace(/,\s*/g, locale === "zh" ? "，" : ", ").replace(/\s+/g, " ").trim();
  return { text: next, original, changed: next !== original };
}

export function translateUnit(unit: string | null | undefined, locale: Locale): string {
  if (!unit) return "";
  return translateRequirement(unit, locale).text;
}
