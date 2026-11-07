import "server-only";

import { tool } from "ai";
import { z } from "zod";

import { serverLogger } from "@/lib/server-logger";
import { getKuisAttemptReview, listKuisAttempts } from "./sources/kuis";
import { readMateri, searchMateri } from "./sources/materi";
import { getLearningOverview } from "./sources/overview";
import { getTryoutResultReview, listTryoutResults } from "./sources/tryout";
import type { VeraToolError } from "./sources/types";
import { studioInstructions, type StudioOptions, type StudioToolId } from "./studio";
import { resolveReviewTarget } from "./studio-targets";

const attemptId = z.string().max(64).describe("ID hasil dari daftar sebelumnya.");
const subtest = z.string().trim().min(1).max(60).optional().describe("Kode atau nama subtes, misalnya PU atau PK.");
const onlyWrong = z.boolean().default(true).describe("true untuk hanya soal yang salah.");

/**
 * A Studio document a turn wrote: the id it is saved under, its tool, its options, and the Kuis or Tryout link it reads. The turn keeps
 * the last one it wrote, and that one becomes the document the answer is saved as.
 */
export type StudioWrite = {
  documentId: string;
  tool: StudioToolId;
  input: StudioOptions["input"];
};

/**
 * Runs one reader. An unexpected failure is logged here and reported as unavailable, so its message (SQL, paths, stack) never
 * reaches the model or the stored answer.
 */
export async function guarded<T>(name: string, read: () => Promise<T>): Promise<T | VeraToolError> {
  try {
    return await read();
  } catch (error) {
    serverLogger.error("vera.tool.failed", error, { area: "vera", operation: name });
    return { error: "unavailable" };
  }
}

/**
 * The tools Vera may call while answering. Each one is bound to the signed-in student when it is created, so the model never
 * chooses whose data it reads. Readers return an error object instead of throwing when a result is missing or still hidden.
 */
export function createVeraTools({
  studentId,
  now = new Date(),
  chosen = null,
  onWrite,
}: {
  studentId: string;
  now?: Date;
  // The Studio options the student chose for this turn. A write tool of the same kind uses them, so the model's own arguments cannot change them.
  chosen?: StudioOptions | null;
  // Called once a write tool has checked its options, so the turn knows which document its answer becomes.
  onWrite?: (write: StudioWrite) => void;
}) {
  return {
    get_learning_overview: tool({
      description:
        "Ringkasan hasil Kuis dan Tryout terbaru siswa, jumlah hasilnya, dan akurasi per subtes. Pakai untuk pertanyaan perkembangan belajar secara umum.",
      inputSchema: z.object({}),
      execute: () => guarded("get_learning_overview", () => getLearningOverview({ studentId, now })),
    }),
    list_kuis_attempts: tool({
      description: "Daftar hasil Kuis siswa yang sudah dirilis, dari yang paling baru.",
      inputSchema: z.object({
        subtest,
        limit: z.number().int().min(1).max(10).default(5).describe("Jumlah hasil, paling banyak 10."),
      }),
      execute: (input) =>
        guarded("list_kuis_attempts", async () => ({ attempts: await listKuisAttempts({ studentId, ...input, now }) })),
    }),
    get_kuis_attempt_review: tool({
      description:
        "Pembahasan satu hasil Kuis. Kebenaran jawaban hanya ada kalau pembahasannya sudah dibuka. Jika tidak, hasilnya berisi skor dan alasannya.",
      inputSchema: z.object({ attemptId, onlyWrong }),
      execute: (input) => guarded("get_kuis_attempt_review", () => getKuisAttemptReview({ studentId, ...input, now })),
    }),
    list_tryout_results: tool({
      description: "Hasil Tryout siswa yang sudah dirilis, dari yang paling baru, dengan skor tiap subtes.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(5).default(3).describe("Jumlah hasil, paling banyak 5."),
      }),
      execute: (input) =>
        guarded("list_tryout_results", async () => ({ results: await listTryoutResults({ studentId, ...input, now }) })),
    }),
    get_tryout_result_review: tool({
      description: "Pembahasan satu hasil Tryout, seperti yang terlihat di halaman hasilnya.",
      inputSchema: z.object({ attemptId, subtest, onlyWrong }),
      execute: (input) =>
        guarded("get_tryout_result_review", () => getTryoutResultReview({ studentId, ...input, now })),
    }),
    search_materi: tool({
      description:
        "Cari Materi PTN Pro yang sudah diterbitkan dengan kata kunci, termasuk nama subtes. Jika hanya subtes yang diisi, daftar Materi subtes itu, yang paling baru dulu.",
      inputSchema: z.object({
        query: z
          .string()
          .trim()
          .max(200)
          .optional()
          .describe("Kata kunci, misalnya nama topik atau subtes. Boleh kosong jika subtes diisi."),
        subtest,
      }),
      execute: (input) => guarded("search_materi", async () => ({ hits: await searchMateri({ ...input, now }) })),
    }),
    read_materi: tool({
      description: "Baca isi satu Materi per bagian sekitar 8.000 karakter. Minta bagian berikutnya dengan part.",
      inputSchema: z.object({
        moduleId: z.string().max(64).describe("moduleId dari hasil search_materi."),
        part: z.number().int().min(1).max(100).default(1),
      }),
      execute: (input) => guarded("read_materi", () => readMateri({ ...input, now })),
    }),
    write_weakness_analysis: tool({
      description:
        "Susun Analisis Kelemahan siswa dari hasil Kuis dan Tryout. Panggil saat siswa meminta analisis kelemahan atau topik yang perlu dikuatkan. Setelah alat ini, tulis dokumennya sebagai jawabanmu.",
      inputSchema: z.object({ subtest: subtest.describe("Subtes yang difokuskan. Kosongkan untuk semua subtes.") }),
      execute: (input) => {
        const options = chosen?.tool === "weakness_analysis" ? chosen.input : input;
        const documentId = crypto.randomUUID();
        onWrite?.({ documentId, tool: "weakness_analysis", input: options.subtest ? { subtest: options.subtest } : {} });
        return { documentId, tool: "weakness_analysis" };
      },
      toModelOutput: () => ({ type: "json", value: { instructions: studioInstructions("weakness_analysis") } }),
    }),
    write_study_route: tool({
      description:
        "Susun Rute Belajar 7 hari dari hasil dan Materi siswa. Panggil saat siswa meminta rute, jadwal, atau rencana belajar seminggu. Setelah alat ini, tulis dokumennya sebagai jawabanmu.",
      inputSchema: z.object({
        minutesPerDay: z
          .union([z.literal(20), z.literal(30), z.literal(45), z.literal(60)])
          .describe("Menit belajar per hari: 20, 30, 45, atau 60."),
      }),
      execute: (input) => {
        const options = chosen?.tool === "study_route" ? chosen.input : input;
        const documentId = crypto.randomUUID();
        onWrite?.({ documentId, tool: "study_route", input: { minutesPerDay: options.minutesPerDay } });
        return { documentId, tool: "study_route" };
      },
      toModelOutput: () => ({ type: "json", value: { instructions: studioInstructions("study_route") } }),
    }),
    write_wrong_answer_review: tool({
      description:
        'Bahas soal yang salah pada satu hasil Kuis atau Tryout siswa. Pakai "latest" untuk hasil terbaru, atau type dan id dari daftar hasil. Setelah alat ini, tulis dokumennya sebagai jawabanmu.',
      inputSchema: z.object({
        target: z
          .union([
            z.literal("latest"),
            z.object({ type: z.enum(["kuis", "tryout"]), id: z.string().min(1).max(64) }),
          ])
          .describe("latest untuk hasil terbaru, atau type dan id dari daftar hasil."),
      }),
      execute: async (input) => {
        const target = chosen?.tool === "wrong_answer_review" ? chosen.input.target : input.target;
        const resolved = await guarded("write_wrong_answer_review", () => resolveReviewTarget(studentId, target, now));
        if (resolved === null) return { error: "not_found" };
        if ("error" in resolved) return resolved;
        const documentId = crypto.randomUUID();
        onWrite?.({ documentId, tool: "wrong_answer_review", input: { target } });
        return { documentId, tool: "wrong_answer_review", source: resolved.source };
      },
      // The model reads the instructions and the result it reviews. The stored and streamed output keeps only the document, the tool and the link.
      toModelOutput: ({ output }) =>
        "error" in output
          ? { type: "json", value: output }
          : {
              type: "json",
              value: {
                instructions: studioInstructions("wrong_answer_review"),
                target: { type: output.source.type, id: output.source.id },
                source: output.source,
              },
            },
    }),
  };
}
