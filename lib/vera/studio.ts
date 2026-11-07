import { z } from "zod";

import { VERA_EFFORT_IDS, VERA_TIME_ZONE } from "./config";
import type { VeraSource } from "./sources/types";

export const STUDIO_TOOL_IDS = ["weakness_analysis", "study_route", "wrong_answer_review"] as const;
export type StudioToolId = (typeof STUDIO_TOOL_IDS)[number];

export const STUDY_ROUTE_MINUTES = [20, 30, 45, 60] as const;

const effortField = z.enum(VERA_EFFORT_IDS).default("mendalam");

/** One shape per tool, so each tool's options are checked against its own fields. */
export const studioRequestSchema = z.discriminatedUnion("tool", [
  z.object({
    tool: z.literal("weakness_analysis"),
    input: z.object({ subtest: z.string().trim().min(1).max(60).optional() }).default({}),
    effort: effortField,
  }),
  z.object({
    tool: z.literal("study_route"),
    input: z.object({ minutesPerDay: z.union([z.literal(20), z.literal(30), z.literal(45), z.literal(60)]) }),
    effort: effortField,
  }),
  z.object({
    tool: z.literal("wrong_answer_review"),
    input: z.object({
      target: z.union([
        z.literal("latest"),
        z.object({ type: z.enum(["kuis", "tryout"]), id: z.string().min(1).max(64) }),
      ]),
    }),
    effort: effortField,
  }),
]);

export type StudioRequest = z.infer<typeof studioRequestSchema>;

/**
 * The options a Studio tool takes, without the effort. A Studio request in the chat carries these, and each tool checks its own fields.
 */
export const studioOptionsSchema = z.discriminatedUnion("tool", [
  z.object({
    tool: z.literal("weakness_analysis"),
    input: z.object({ subtest: z.string().trim().min(1).max(60).optional() }).default({}),
  }),
  z.object({
    tool: z.literal("study_route"),
    input: z.object({ minutesPerDay: z.union([z.literal(20), z.literal(30), z.literal(45), z.literal(60)]) }),
  }),
  z.object({
    tool: z.literal("wrong_answer_review"),
    input: z.object({
      target: z.union([
        z.literal("latest"),
        z.object({ type: z.enum(["kuis", "tryout"]), id: z.string().min(1).max(64) }),
      ]),
    }),
  }),
]);

export type StudioOptions = z.infer<typeof studioOptionsSchema>;

/** The chat tool each Studio tool is called as. A turn that calls one of these writes its answer as a saved document. */
export const STUDIO_WRITE_TOOLS = {
  weakness_analysis: "write_weakness_analysis",
  study_route: "write_study_route",
  wrong_answer_review: "write_wrong_answer_review",
} as const satisfies Record<StudioToolId, string>;

/** The Studio tool a chat tool writes, or null when the tool is not one of them. */
export function studioToolOfWrite(toolName: string): StudioToolId | null {
  return (Object.keys(STUDIO_WRITE_TOOLS) as StudioToolId[]).find((tool) => STUDIO_WRITE_TOOLS[tool] === toolName) ?? null;
}

/**
 * What the model reads as the student's request. A review's target id is for the model's tool call only, and the student never sees it.
 */
export function studioModelText(options: StudioOptions): string {
  switch (options.tool) {
    case "weakness_analysis":
      return options.input.subtest
        ? `Buat Analisis Kelemahan dengan fokus pada subtes ${options.input.subtest}.`
        : "Buat Analisis Kelemahan untuk semua subtes.";
    case "study_route":
      return `Buat Rute Belajar 7 hari dengan ${options.input.minutesPerDay} menit per hari.`;
    case "wrong_answer_review": {
      const { target } = options.input;
      if (target === "latest") return "Bahas soal yang salah pada hasil terbaru.";
      return `Bahas soal yang salah pada hasil ${target.type === "tryout" ? "Tryout" : "Kuis"} dengan ID ${target.id}.`;
    }
  }
}

/**
 * The sentence the student sees as their own message for a Studio request. It names the choice in plain words and never shows an id.
 * A named result shows its title.
 */
export function studioBubbleText(options: StudioOptions, resultTitle?: string): string {
  switch (options.tool) {
    case "weakness_analysis":
      return options.input.subtest
        ? `Analisis Kelemahan untuk subtes ${options.input.subtest}.`
        : "Analisis Kelemahan untuk semua subtes.";
    case "study_route":
      return `Rute Belajar 7 hari, ${options.input.minutesPerDay} menit per hari.`;
    case "wrong_answer_review": {
      const { target } = options.input;
      if (target === "latest") return "Bahas soal yang salah pada hasil terakhir.";
      const kind = target.type === "tryout" ? "Tryout" : "Kuis";
      return `Bahas soal yang salah pada hasil ${kind}${resultTitle ? ` ${resultTitle}` : ""}.`;
    }
  }
}

/** A Kuis attempt or Tryout result the review is about, already checked against what the student may read. */
export type ReviewTarget = { type: "kuis" | "tryout"; id: string };

export const STUDIO_TOOLS: Record<StudioToolId, { label: string; description: string }> = {
  weakness_analysis: {
    label: "Analisis Kelemahan",
    description: "Topik yang paling perlu dikuatkan, dengan bukti dari hasil Kuis dan Tryout.",
  },
  study_route: {
    label: "Rute Belajar 7 Hari",
    description: "Tujuh hari belajar, paling banyak tiga aktivitas per hari, tiap aktivitas tertaut ke Materi atau Kuis.",
  },
  wrong_answer_review: {
    label: "Bahas Soal Salah",
    description: "Setiap soal yang salah dijelaskan langkah demi langkah dari pembahasan yang tersedia.",
  },
};

const DOCUMENT_RULES = [
  'Tulis dokumen dalam markdown, bahasa Indonesia, dengan sapaan "kamu".',
  "Pakai hanya data yang dikembalikan alat. Jangan mengarang skor, soal, penjelasan, atau Materi.",
  "Tautan hanya boleh memakai href yang dikembalikan alat untuk Materi, Kuis, atau Tryout yang kamu baca.",
  "Jangan tampilkan ID, JSON, atau nama alat kepada siswa.",
].join("\n");

const TOOL_PROMPTS: Record<StudioToolId, string> = {
  weakness_analysis: [
    "Susun Analisis Kelemahan dengan struktur ini, dengan judul persis seperti ini:",
    "## Ringkasan",
    "Dua atau tiga kalimat tentang pola hasil siswa.",
    "## Topik yang perlu dikuatkan",
    "Paling banyak 5 butir. Tiap butir menyebut topiknya dan buktinya: hasil Kuis atau Tryout mana, dengan akurasi atau skornya.",
    "## Langkah berikutnya",
    "Paling banyak 3 butir. Tiap butir menautkan Materi atau Kuis yang nyata dari hasil alat.",
  ].join("\n"),
  study_route: [
    "Susun Rute Belajar 7 hari dengan satu judul per hari: ## Hari 1, ## Hari 2, sampai ## Hari 7.",
    "Setiap hari paling banyak 3 aktivitas. Tiap aktivitas adalah tautan ke Materi atau Kuis yang nyata dari alat, diikuti jumlah menit sesuai menit per hari yang diminta.",
    "Di akhir dokumen, tulis catatan bahwa ini hanya saran dan tidak ada yang dijadwalkan otomatis.",
  ].join("\n"),
  wrong_answer_review: [
    "Bahas soal yang salah dengan struktur ini. Untuk tiap soal salah, tulis judul ### Soal n dengan nomor dari alat, lalu:",
    "- Mengapa jawabanmu belum tepat.",
    "- Penalaran langkah demi langkah menuju jawaban yang benar.",
    "- Satu pola yang perlu diingat.",
    "Hanya pakai penjelasan yang dikembalikan alat. Jika pembahasan kunci belum dibuka, katakan dengan jelas bahwa pembahasannya belum tersedia, lalu beri strategi umum untuk jenis soalnya.",
  ].join("\n"),
};

/** The instructions for one document: the shared rules, then the structure the tool requires. */
export function studioInstructions(tool: StudioToolId) {
  return `${DOCUMENT_RULES}\n\n${TOOL_PROMPTS[tool]}`;
}

/** The user message that starts a document. It carries the student's options and, for a review, the target to read. */
export function studioRequestText(request: StudioRequest, target?: ReviewTarget): string {
  switch (request.tool) {
    case "weakness_analysis":
      return request.input.subtest
        ? `Buat Analisis Kelemahan dengan fokus pada subtes ${request.input.subtest}.`
        : "Buat Analisis Kelemahan untuk semua subtes.";
    case "study_route":
      return `Buat Rute Belajar 7 hari dengan ${request.input.minutesPerDay} menit per hari.`;
    case "wrong_answer_review": {
      const kind = target?.type === "tryout" ? "Tryout" : "Kuis";
      return `Bahas soal yang salah pada hasil ${kind} dengan ID ${target?.id ?? ""}.`;
    }
  }
}

const DATE_FORMAT = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: VERA_TIME_ZONE });

/** Title from the tool and the date, so the document list reads like a list of work, not of ids. */
export function studioTitle(tool: StudioToolId, now: Date) {
  return `${STUDIO_TOOLS[tool].label} · ${DATE_FORMAT.format(now)}`.slice(0, 160);
}

/**
 * A document may link only to pages the tools returned. Any other link keeps its text and loses its target, so a made-up or
 * hidden link never reaches the student.
 */
export function keepToolLinks(markdown: string, sources: VeraSource[]) {
  const allowed = new Set(sources.map((source) => source.href));
  return markdown.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/gu, (_match, text: string, href: string) =>
    allowed.has(href) ? `[${text}](${href})` : text,
  );
}
