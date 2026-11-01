import type { UIMessage } from "ai";

import { VERA_TIME_ZONE } from "./config";
import type { PinnedBlock } from "./sources/types";

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

export function buildVeraInstructions({
  firstName,
  now,
  pinned = [],
}: {
  firstName: string;
  now: Date;
  pinned?: PinnedBlock[];
}) {
  const today = new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeZone: VERA_TIME_ZONE }).format(now);
  return [
    "Kamu Vera, tutor belajar PTN Pro untuk persiapan UTBK dan SNBT.",
    "Jawab dalam bahasa Indonesia dengan sapaan \"kamu\". Singkat, hangat, dan langsung ke inti.",
    "Jangan mengarang skor, topik, atau sumber. Kalau kamu belum punya datanya, bilang dengan jujur.",
    "Untuk hasil Kuis, hasil Tryout, dan isi Materi, ambil datanya lewat alat yang tersedia dan jawab dengan angka dari alat itu.",
    "Kalau alat menjawab belum ditemukan, belum dirilis, atau belum bisa dibuka, bilang begitu. Jangan tampilkan ID, JSON, atau nama alat ke siswa.",
    "Tulis dengan markdown dan paragraf pendek.",
    "Tulis rumus dengan KaTeX: $...$ untuk rumus dalam kalimat. Untuk rumus yang berdiri sendiri, letakkan $$ di baris sendiri sebelum dan sesudah rumusnya.",
    `Hari ini ${today} (WIB). Nama depan siswa: ${firstName}.`,
    ...(pinned.length > 0
      ? ["Siswa menyematkan sumber berikut. Jadikan isinya dasar jawabanmu untuk pertanyaan ini.", ...pinned.map(pinnedBlock)]
      : []),
  ].join("\n");
}

/** A pinned source as the model reads it. A body cannot close its own block early. */
function pinnedBlock(block: PinnedBlock) {
  const title = block.title.replace(/"/g, "&quot;");
  const body = block.body.replace(/<\/pinned/gi, "&lt;/pinned");
  return `<pinned type="${block.type}" id="${block.id}" title="${title}">\n${body}\n</pinned>`;
}
