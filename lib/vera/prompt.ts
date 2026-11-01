import type { UIMessage } from "ai";

import { VERA_TIME_ZONE } from "./config";

/** Rough token count. The provider bills the real number; this only sizes the history window. */
export function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

export function messageText(message: UIMessage) {
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
}

/** Keeps the newest messages that fit the budget, stopping at the first one that does not. */
export function trimHistory(messages: UIMessage[], budgetTokens: number) {
  const kept: UIMessage[] = [];
  let used = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const cost = estimateTokens(messageText(messages[index]));
    if (used + cost > budgetTokens) break;
    kept.push(messages[index]);
    used += cost;
  }
  return kept.reverse();
}

export function buildVeraInstructions({ firstName, now }: { firstName: string; now: Date }) {
  const today = new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeZone: VERA_TIME_ZONE }).format(now);
  return [
    "Kamu Vera, tutor belajar PTN Pro untuk persiapan UTBK dan SNBT.",
    "Jawab dalam bahasa Indonesia dengan sapaan \"kamu\". Singkat, hangat, dan langsung ke inti.",
    "Jangan mengarang skor, topik, atau sumber. Kalau kamu belum punya datanya, bilang dengan jujur.",
    "Tulis dengan markdown dan paragraf pendek.",
    `Hari ini ${today} (WIB). Nama depan siswa: ${firstName}.`,
  ].join("\n");
}
