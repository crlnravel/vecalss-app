import "server-only";

import { simulateReadableStream, type LanguageModel } from "ai";

type DevModel = Extract<LanguageModel, { specificationVersion: "v4" }>;

const ANSWER = [
  "Ini jawaban contoh dari mode uji lokal. ",
  "Tidak ada panggilan ke OpenAI, jadi isinya tidak mewakili Vera yang sebenarnya. ",
  "Jika teks ini tampil pelan-pelan, streaming di halaman berjalan dengan benar. ",
  "Kredit di bawah jawaban dihitung dari pemakaian contoh ini.",
];

const USAGE = {
  inputTokens: { total: 1_200, noCache: 1_200, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 90, text: 90, reasoning: 0 },
};

/**
 * The stand-in for the provider when VERA_MOCK_MODEL=1 outside production. It never reaches the network. A title request gets a short
 * fixed title, and every answer streams the same sample text with the usage a short answer would report.
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
    doStream: async () => ({
      stream: simulateReadableStream({
        initialDelayInMs: 200,
        chunkDelayInMs: 120,
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "answer" },
          ...ANSWER.map((delta) => ({ type: "text-delta" as const, id: "answer", delta })),
          { type: "text-end", id: "answer" },
          { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: USAGE },
        ],
      }),
    }),
  } as DevModel;
}
