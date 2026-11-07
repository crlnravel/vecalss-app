import "server-only";

import { simulateReadableStream, type LanguageModel } from "ai";

type DevModel = Extract<LanguageModel, { specificationVersion: "v4" }>;

const ANSWER = [
  "Ini jawaban contoh dari mode uji lokal. ",
  "Tidak ada panggilan ke OpenAI, jadi isinya tidak mewakili Vera yang sebenarnya. ",
  "Jika teks ini tampil pelan-pelan, streaming di halaman berjalan dengan benar. ",
  "Kredit di bawah jawaban dihitung dari pemakaian contoh ini.",
];

// A Studio answer, written after its tool has been called.
const DOCUMENT = [
  "## Ringkasan\n\n",
  "Ini dokumen contoh dari mode uji lokal. Tidak ada panggilan ke OpenAI, jadi isinya tidak mewakili Vera yang sebenarnya.\n\n",
  "## Langkah berikutnya\n\n",
  "- Baca ulang Materi yang kamu tandai.\n",
];

// The Studio tool each request names, with the arguments the stand-in gives it. A typed request that names a document calls its tool too.
const STUDIO_REQUESTS = [
  { phrase: "Analisis Kelemahan", tool: "write_weakness_analysis", input: {} },
  { phrase: "Rute Belajar", tool: "write_study_route", input: { minutesPerDay: 30 } },
  { phrase: "Bahas soal yang salah", tool: "write_wrong_answer_review", input: { target: "latest" } },
];

const USAGE = {
  inputTokens: { total: 1_200, noCache: 1_200, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 90, text: 90, reasoning: 0 },
};

/**
 * The stand-in for the provider when VERA_MOCK_MODEL=1 outside production. It never reaches the network. A title request gets a short
 * fixed title. A Studio request calls its write tool first, as a forced first step does, and then writes a short document. Any other
 * answer streams the same sample text with the usage a short answer would report.
 */
export function createVeraDevModel(): DevModel {
  return {
    specificationVersion: "v4",
    provider: "vera-dev",
    modelId: "vera-dev-mock",
    supportedUrls: {},
    doGenerate: async () => ({
      content: [{ type: "text", text: "Percakapan uji lokal" }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: USAGE,
      warnings: [],
    }),
    doStream: async ({ prompt, toolChoice }) => {
      const answeredWithTool = prompt.some((message) => message.role === "tool");
      const asked = JSON.stringify([...prompt].reverse().find((message) => message.role === "user") ?? "");
      const forced = toolChoice?.type === "tool" ? toolChoice.toolName : null;
      const request = answeredWithTool
        ? undefined
        : STUDIO_REQUESTS.find((entry) => entry.tool === forced || (forced === null && asked.includes(entry.phrase)));
      if (request) {
        return {
          stream: simulateReadableStream({
            initialDelayInMs: 200,
            chunkDelayInMs: 120,
            chunks: [
              { type: "stream-start", warnings: [] },
              {
                type: "tool-call",
                toolCallId: `dev-${crypto.randomUUID()}`,
                toolName: request.tool,
                input: JSON.stringify(request.input),
              },
              { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage: USAGE },
            ],
          }),
        };
      }
      const deltas = answeredWithTool ? DOCUMENT : ANSWER;
      return {
        stream: simulateReadableStream({
          initialDelayInMs: 200,
          chunkDelayInMs: 120,
          chunks: [
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "answer" },
            ...deltas.map((delta) => ({ type: "text-delta" as const, id: "answer", delta })),
            { type: "text-end", id: "answer" },
            { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: USAGE },
          ],
        }),
      };
    },
  } as DevModel;
}
