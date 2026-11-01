import "server-only";

import { tool } from "ai";
import { z } from "zod";

import { getKuisAttemptReview, listKuisAttempts } from "./sources/kuis";
import { readMateri, searchMateri } from "./sources/materi";
import { getLearningOverview } from "./sources/overview";
import { getTryoutResultReview, listTryoutResults } from "./sources/tryout";

const attemptId = z.string().max(64).describe("ID hasil dari daftar sebelumnya.");
const subtest = z.string().trim().min(1).max(60).optional().describe("Kode atau nama subtes, misalnya PU atau PK.");
const onlyWrong = z.boolean().default(true).describe("true untuk hanya soal yang salah.");

/**
 * The tools Vera may call while answering. Each one is bound to the signed-in student when it is created, so the model never
 * chooses whose data it reads. Readers return an error object instead of throwing when a result is missing or still hidden.
 */
export function createVeraTools({ studentId, now = new Date() }: { studentId: string; now?: Date }) {
  return {
    get_learning_overview: tool({
      description:
        "Ringkasan hasil Kuis dan Tryout terbaru siswa, jumlah hasilnya, dan akurasi per subtes. Pakai untuk pertanyaan perkembangan belajar secara umum.",
      inputSchema: z.object({}),
      execute: () => getLearningOverview({ studentId, now }),
    }),
    list_kuis_attempts: tool({
      description: "Daftar hasil Kuis siswa yang sudah dirilis, dari yang paling baru.",
      inputSchema: z.object({
        subtest,
        limit: z.number().int().min(1).max(10).default(5).describe("Jumlah hasil, paling banyak 10."),
      }),
      execute: async (input) => ({ attempts: await listKuisAttempts({ studentId, ...input, now }) }),
    }),
    get_kuis_attempt_review: tool({
      description:
        "Pembahasan satu hasil Kuis. Kebenaran jawaban hanya ada kalau pembahasannya sudah dibuka. Jika tidak, hasilnya berisi skor dan alasannya.",
      inputSchema: z.object({ attemptId, onlyWrong }),
      execute: (input) => getKuisAttemptReview({ studentId, ...input, now }),
    }),
    list_tryout_results: tool({
      description: "Hasil Tryout siswa yang sudah dirilis, dari yang paling baru, dengan skor tiap subtes.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(5).default(3).describe("Jumlah hasil, paling banyak 5."),
      }),
      execute: async (input) => ({ results: await listTryoutResults({ studentId, ...input, now }) }),
    }),
    get_tryout_result_review: tool({
      description: "Pembahasan satu hasil Tryout, seperti yang terlihat di halaman hasilnya.",
      inputSchema: z.object({ attemptId, subtest, onlyWrong }),
      execute: (input) => getTryoutResultReview({ studentId, ...input, now }),
    }),
    search_materi: tool({
      description: "Cari Materi PTN Pro yang sudah diterbitkan dengan kata kunci.",
      inputSchema: z.object({
        query: z.string().trim().min(2).max(200).describe("Kata kunci, misalnya nama topik."),
        subtest,
      }),
      execute: async (input) => ({ hits: await searchMateri({ ...input, now }) }),
    }),
    read_materi: tool({
      description: "Baca isi satu Materi per bagian sekitar 8.000 karakter. Minta bagian berikutnya dengan part.",
      inputSchema: z.object({
        moduleId: z.string().max(64).describe("moduleId dari hasil search_materi."),
        part: z.number().int().min(1).max(100).default(1),
      }),
      execute: (input) => readMateri({ ...input, now }),
    }),
  };
}
